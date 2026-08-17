from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..schemas import DespescaEditarIn, DespescaIn, DespescaOut, DespescaResumoOut, UsuarioOut

router = APIRouter(prefix="/despescas", tags=["despescas"])

_COLUNAS = "id, client_id, lote_id, data, destino, quantidade_un, peso_medio_g, peso_total_kg, criado_em"


def _sincronizar_fechamento_lote(db: Session, lote_id: int, data_evento: date) -> None:
    """Fecha o lote se o saldo zerou (colheita total), ou reabre se um
    saldo positivo voltou a existir — ex.: excluir/corrigir uma despesca
    que tinha zerado o tanque. Só reabre se o viveiro não tiver ganhado
    outro lote ativo enquanto este estava fechado, pra nunca deixar dois
    lotes ativos no mesmo tanque ao mesmo tempo."""
    lote = db.execute(
        text("SELECT viveiro_id, data_fim FROM lote WHERE id = :id"), {"id": lote_id}
    ).mappings().first()
    if lote is None:
        return
    saldo = db.execute(
        text("SELECT saldo_un FROM vw_saldo_lote WHERE lote_id = :l"), {"l": lote_id}
    ).scalar_one()
    if saldo <= 0:
        if lote["data_fim"] is None:
            db.execute(
                text("UPDATE lote SET data_fim = :data WHERE id = :id"),
                {"data": data_evento, "id": lote_id},
            )
    elif lote["data_fim"] is not None:
        outro_ativo = db.execute(
            text("SELECT 1 FROM lote WHERE viveiro_id = :v AND data_fim IS NULL AND id != :id"),
            {"v": lote["viveiro_id"], "id": lote_id},
        ).first()
        if outro_ativo is None:
            db.execute(text("UPDATE lote SET data_fim = NULL WHERE id = :id"), {"id": lote_id})


@router.get("", response_model=list[DespescaOut])
def listar_despescas(
    lote_id: int = Query(..., description="Lote cuja despesca será listada"),
    db: Session = Depends(get_db),
):
    """Alimenta o seletor 'Despesca de origem' na tela de Produção."""
    rows = db.execute(
        text(f"""
            SELECT {_COLUNAS} FROM despesca
            WHERE lote_id = :lote_id AND excluido_em IS NULL
            ORDER BY data DESC, id DESC
        """),
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
            # despesca pode ter zerado o saldo do lote (colheita total) —
            # fecha o lote para liberar o viveiro para um novo povoamento,
            # e para que a mortalidade da fase entre no painel gerencial
            _sincronizar_fechamento_lote(db, row["lote_id"], row["data"])
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
    peso digitados errado). Refaz o fechamento do lote conforme o saldo
    resultante — fecha se a correção zerou o saldo, reabre se o saldo
    voltou a ficar positivo (ver _sincronizar_fechamento_lote)."""
    try:
        row = db.execute(
            text(f"""
                UPDATE despesca SET lote_id = :lote_id, data = :data, destino = :destino,
                                     quantidade_un = :quantidade_un, peso_medio_g = :peso_medio_g
                WHERE id = :id AND excluido_em IS NULL
                RETURNING {_COLUNAS}
            """),
            {"id": despesca_id, **body.model_dump()},
        ).mappings().first()
        if row is None:
            raise HTTPException(404, "despesca não encontrada (ou excluída — restaure antes de editar)")

        _sincronizar_fechamento_lote(db, row["lote_id"], row["data"])
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"lote_id inválido ou dado fora das regras: {exc.orig}") from exc
    return DespescaOut(**row)


@router.get("/{despesca_id}/resumo", response_model=DespescaResumoOut)
def resumo_despesca(despesca_id: int, db: Session = Depends(get_db)):
    """Peso despescado (destino filé) e Kg de filé já lançado para o mesmo
    lote+data — o front soma o valor que o operador está digitando e
    calcula o rendimento ao vivo (regra R2), sem gravar nada. Filtra por
    destino='file': um mesmo lote+data pode ter despesca de mais de um
    destino (ex.: parte foi pra filé, parte foi vendida inteira suja no
    mesmo dia), e misturar esse peso no denominador sub-avalia o
    rendimento real do filé (mesma falha corrigida na view
    vw_producao_detalhe, migração 018)."""
    base = db.execute(
        text("SELECT lote_id, data FROM despesca WHERE id = :id"),
        {"id": despesca_id},
    ).mappings().first()
    if base is None:
        raise HTTPException(404, "despesca não encontrada")

    peso = db.execute(
        text("""
            SELECT COALESCE(SUM(peso_total_kg), 0) FROM despesca
            WHERE lote_id = :l AND data = :d AND destino = 'file' AND excluido_em IS NULL
        """),
        {"l": base["lote_id"], "d": base["data"]},
    ).scalar_one()

    kg_file = db.execute(
        text("""
            SELECT COALESCE(SUM(p.quantidade_kg), 0)
            FROM producao p JOIN produto pr ON pr.id = p.produto_id
            WHERE p.lote_id = :l AND p.data_despesca = :d AND pr.nome LIKE 'Filé%' AND p.excluido_em IS NULL
        """),
        {"l": base["lote_id"], "d": base["data"]},
    ).scalar_one()

    return DespescaResumoOut(peso_despescado_kg=float(peso), kg_file_lancado=float(kg_file))


@router.delete("/{despesca_id}", response_model=DespescaOut)
def excluir_despesca(
    despesca_id: int, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user),
):
    """Exclusão reversível — marca excluido_em/excluido_por em vez de
    apagar a linha, pra poder restaurar (POST .../restaurar) se for
    engano. vw_saldo_lote já ignora despesca excluída, então o peixe
    volta pro saldo do tanque assim que isso é salvo — e se isso tirar o
    lote do zero, ele é reaberto (ver _sincronizar_fechamento_lote)."""
    row = db.execute(
        text(f"""
            UPDATE despesca SET excluido_em = now(), excluido_por = :quem
            WHERE id = :id AND excluido_em IS NULL
            RETURNING {_COLUNAS}
        """),
        {"id": despesca_id, "quem": usuario.nome},
    ).mappings().first()
    if row is None:
        raise HTTPException(404, "despesca não encontrada (ou já excluída)")
    _sincronizar_fechamento_lote(db, row["lote_id"], row["data"])
    db.commit()
    return DespescaOut(**row)


@router.post("/{despesca_id}/restaurar", response_model=DespescaOut)
def restaurar_despesca(
    despesca_id: int, db: Session = Depends(get_db), _usuario: UsuarioOut = Depends(get_current_user),
):
    """Restaurar volta a contar a despesca no saldo — se isso zerar o
    tanque de novo, fecha o lote como no lançamento normal (ver
    _sincronizar_fechamento_lote)."""
    row = db.execute(
        text(f"""
            UPDATE despesca SET excluido_em = NULL, excluido_por = NULL
            WHERE id = :id AND excluido_em IS NOT NULL
            RETURNING {_COLUNAS}
        """),
        {"id": despesca_id},
    ).mappings().first()
    if row is None:
        raise HTTPException(404, "despesca não encontrada (ou não está excluída)")
    _sincronizar_fechamento_lote(db, row["lote_id"], row["data"])
    db.commit()
    return DespescaOut(**row)
