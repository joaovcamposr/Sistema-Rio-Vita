from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..schemas import DespescaEditarIn, DespescaIn, DespescaOut, DespescaResumoOut, UsuarioOut

router = APIRouter(prefix="/despescas", tags=["despescas"])

_COLUNAS = "id, client_id, lote_id, data, destino, quantidade_un, peso_medio_g, peso_total_kg, criado_em"


@router.get("", response_model=list[DespescaOut])
def listar_despescas(
    lote_id: int = Query(..., description="Lote cuja despesca será listada"),
    db: Session = Depends(get_db),
):
    """Alimenta o seletor 'Despesca de origem' na tela de Produção."""
    rows = db.execute(
        text(f"SELECT {_COLUNAS} FROM despesca WHERE lote_id = :lote_id ORDER BY data DESC, id DESC"),
        {"lote_id": lote_id},
    ).mappings().all()
    return [DespescaOut(**r) for r in rows]


@router.post("", response_model=DespescaOut, status_code=201)
def criar_despesca(body: DespescaIn, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user)):
    try:
        row = db.execute(
            text(f"""
                INSERT INTO despesca (client_id, lote_id, data, destino, quantidade_un, peso_medio_g, criado_por)
                VALUES (:client_id, :lote_id, :data, :destino, :quantidade_un, :peso_medio_g, :criado_por)
                ON CONFLICT (client_id) DO NOTHING
                RETURNING {_COLUNAS}
            """),
            {**body.model_dump(), "criado_por": usuario.nome},
        ).mappings().first()
        if row is not None:
            # despesca zerou o saldo do lote (colheita total) — fecha o
            # lote para liberar o viveiro para um novo povoamento, e para
            # que a mortalidade da fase entre no painel gerencial
            saldo = db.execute(
                text("SELECT saldo_un FROM vw_saldo_lote WHERE lote_id = :l"),
                {"l": row["lote_id"]},
            ).scalar_one()
            if saldo <= 0:
                db.execute(
                    text("UPDATE lote SET data_fim = :data WHERE id = :id AND data_fim IS NULL"),
                    {"data": row["data"], "id": row["lote_id"]},
                )
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"lote_id inválido ou dado fora das regras: {exc.orig}") from exc

    if row is None:
        # client_id já existia — reenvio idempotente (retry offline). Devolve
        # o registro que já está salvo, sem criar duplicata.
        row = db.execute(
            text(f"SELECT {_COLUNAS} FROM despesca WHERE client_id = :cid"),
            {"cid": str(body.client_id)},
        ).mappings().first()
    return DespescaOut(**row)


@router.patch("/{despesca_id}", response_model=DespescaOut)
def editar_despesca(
    despesca_id: int, body: DespescaEditarIn, db: Session = Depends(get_db),
    usuario: UsuarioOut = Depends(get_current_user),
):
    """Corrige uma despesca já lançada (tanque, data, destino, quantidade ou
    peso digitados errado). Não reabre um lote que já foi encerrado — se a
    correção zerar o saldo de novo, fecha o lote como no lançamento normal."""
    try:
        row = db.execute(
            text(f"""
                UPDATE despesca SET lote_id = :lote_id, data = :data, destino = :destino,
                                     quantidade_un = :quantidade_un, peso_medio_g = :peso_medio_g
                WHERE id = :id
                RETURNING {_COLUNAS}
            """),
            {"id": despesca_id, **body.model_dump()},
        ).mappings().first()
        if row is None:
            raise HTTPException(404, "despesca não encontrada")

        saldo = db.execute(
            text("SELECT saldo_un FROM vw_saldo_lote WHERE lote_id = :l"), {"l": row["lote_id"]}
        ).scalar_one()
        if saldo <= 0:
            db.execute(
                text("UPDATE lote SET data_fim = :data WHERE id = :id AND data_fim IS NULL"),
                {"data": row["data"], "id": row["lote_id"]},
            )
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"lote_id inválido ou dado fora das regras: {exc.orig}") from exc
    return DespescaOut(**row)


@router.get("/{despesca_id}/resumo", response_model=DespescaResumoOut)
def resumo_despesca(despesca_id: int, db: Session = Depends(get_db)):
    """Peso despescado e Kg de filé já lançado para o mesmo lote+data —
    o front soma o valor que o operador está digitando e calcula o
    rendimento ao vivo (regra R2), sem gravar nada."""
    base = db.execute(
        text("SELECT lote_id, data FROM despesca WHERE id = :id"),
        {"id": despesca_id},
    ).mappings().first()
    if base is None:
        raise HTTPException(404, "despesca não encontrada")

    peso = db.execute(
        text("SELECT COALESCE(SUM(peso_total_kg), 0) FROM despesca WHERE lote_id = :l AND data = :d"),
        {"l": base["lote_id"], "d": base["data"]},
    ).scalar_one()

    kg_file = db.execute(
        text("""
            SELECT COALESCE(SUM(p.quantidade_kg), 0)
            FROM producao p JOIN produto pr ON pr.id = p.produto_id
            WHERE p.lote_id = :l AND p.data_despesca = :d AND pr.nome LIKE 'Filé%'
        """),
        {"l": base["lote_id"], "d": base["data"]},
    ).scalar_one()

    return DespescaResumoOut(peso_despescado_kg=float(peso), kg_file_lancado=float(kg_file))
