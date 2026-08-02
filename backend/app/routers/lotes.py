from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..schemas import EncerrarLoteIn, LoteOut, PovoamentoIn, RepicagemIn, RepicagemOut, UsuarioOut

router = APIRouter(tags=["lotes"])

_COLUNAS_LOTE = (
    "id, codigo, fase, viveiro_id, data_inicio, quantidade_inicial, "
    "peso_medio_inicial_g, data_fim, criado_em"
)


def _gerar_codigo(db: Session, fase: str, data: date) -> str:
    """O operador nunca digita o código do lote — o sistema gera, evitando
    a fragilidade de hoje (repicagem lançada como povoamento novo, sem
    identidade própria). Ver Etapa 3, decisão 'um lote por fase'."""
    prefixo = "PRE" if fase == "pre_engorda" else "ENG"
    seq = db.execute(
        text("SELECT COUNT(*) + 1 FROM lote WHERE fase = :fase AND EXTRACT(YEAR FROM data_inicio) = :ano"),
        {"fase": fase, "ano": data.year},
    ).scalar_one()
    return f"{prefixo}-{data.year}-{seq:02d}"


@router.post("/lotes", response_model=LoteOut, status_code=201)
def registrar_povoamento(
    body: PovoamentoIn, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user),
):
    viveiro = db.execute(
        text("SELECT tipo FROM viveiro WHERE id = :id"), {"id": body.viveiro_id}
    ).mappings().first()
    if viveiro is None:
        raise HTTPException(422, "viveiro_id inválido")
    if viveiro["tipo"] == "decantacao":
        raise HTTPException(422, "viveiro de decantação não recebe povoamento")

    fase = "pre_engorda" if viveiro["tipo"] == "pre_engorda" else "engorda"
    codigo = _gerar_codigo(db, fase, body.data)

    try:
        row = db.execute(
            text(f"""
                INSERT INTO lote (client_id, codigo, fase, viveiro_id, viveiro_tipo, data_inicio,
                                   quantidade_inicial, peso_medio_inicial_g, observacao, criado_por)
                VALUES (:client_id, :codigo, :fase, :viveiro_id, :viveiro_tipo, :data,
                        :quantidade_inicial, :peso_medio_inicial_g, :observacao, :criado_por)
                ON CONFLICT (client_id) DO NOTHING
                RETURNING {_COLUNAS_LOTE}
            """),
            {
                "client_id": str(body.client_id), "codigo": codigo, "fase": fase,
                "viveiro_id": body.viveiro_id, "viveiro_tipo": viveiro["tipo"], "data": body.data,
                "quantidade_inicial": body.quantidade_inicial,
                "peso_medio_inicial_g": body.peso_medio_inicial_g, "observacao": body.observacao,
                "criado_por": usuario.nome,
            },
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"dado inválido ou fora das regras: {exc.orig}") from exc

    if row is None:
        row = db.execute(
            text(f"SELECT {_COLUNAS_LOTE} FROM lote WHERE client_id = :cid"),
            {"cid": str(body.client_id)},
        ).mappings().first()
    return LoteOut(**row)


@router.post("/repicagens", response_model=RepicagemOut, status_code=201)
def registrar_repicagem(
    body: RepicagemIn, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user),
):
    # idempotência: se este client_id já foi processado (retry offline),
    # devolve o resultado anterior sem repetir a transação
    existente = db.execute(
        text("SELECT id FROM lote WHERE client_id = :cid"), {"cid": str(body.client_id)}
    ).mappings().first()
    if existente is not None:
        origem_ids = [
            r["lote_origem_id"]
            for r in db.execute(
                text("""
                    SELECT o.lote_origem_id FROM lote_origem o
                    JOIN lote l ON l.id = o.lote_origem_id
                    WHERE o.lote_id = :l AND l.data_fim IS NOT NULL
                """),
                {"l": existente["id"]},
            ).mappings().all()
        ]
        lote_row = db.execute(
            text(f"SELECT {_COLUNAS_LOTE} FROM lote WHERE id = :id"), {"id": existente["id"]}
        ).mappings().first()
        return RepicagemOut(lote=LoteOut(**lote_row), lotes_origem_fechados=origem_ids)

    destino = db.execute(
        text("SELECT tipo FROM viveiro WHERE id = :id"), {"id": body.viveiro_destino_id}
    ).mappings().first()
    if destino is None:
        raise HTTPException(422, "viveiro_destino_id inválido")
    if destino["tipo"] == "decantacao":
        raise HTTPException(422, "viveiro de decantação não recebe repicagem")

    # sem separação por fase — qualquer tanque com lote ativo pode ser
    # origem, repicando pra qualquer outro tanque (menos decantação); a
    # fase do lote novo segue o tipo do viveiro de destino, igual ao
    # povoamento
    origem_lotes: list[tuple[int, int, int]] = []  # (lote_id, quantidade, saldo_atual)
    for o in body.origens:
        lote_o = db.execute(
            text("""
                SELECT l.id, s.saldo_un FROM lote l
                JOIN vw_saldo_lote s ON s.lote_id = l.id
                WHERE l.viveiro_id = :v AND l.data_fim IS NULL
            """),
            {"v": o.viveiro_origem_id},
        ).mappings().first()
        if lote_o is None:
            raise HTTPException(422, f"viveiro {o.viveiro_origem_id} não tem lote ativo")
        origem_lotes.append((lote_o["id"], o.quantidade, lote_o["saldo_un"]))

    quantidade_total = sum(q for _, q, _ in origem_lotes)
    fase_destino = "pre_engorda" if destino["tipo"] == "pre_engorda" else "engorda"
    codigo = _gerar_codigo(db, fase_destino, body.data)

    try:
        novo = db.execute(
            text(f"""
                INSERT INTO lote (client_id, codigo, fase, viveiro_id, viveiro_tipo, data_inicio,
                                   quantidade_inicial, peso_medio_inicial_g, criado_por)
                VALUES (:client_id, :codigo, :fase, :viveiro_id, :viveiro_tipo, :data,
                        :quantidade_inicial, :peso_medio_g, :criado_por)
                RETURNING {_COLUNAS_LOTE}
            """),
            {
                "client_id": str(body.client_id), "codigo": codigo, "fase": fase_destino,
                "viveiro_id": body.viveiro_destino_id, "viveiro_tipo": destino["tipo"],
                "data": body.data, "quantidade_inicial": quantidade_total, "peso_medio_g": body.peso_medio_g,
                "criado_por": usuario.nome,
            },
        ).mappings().first()

        fechados: list[int] = []
        for lote_origem_id, quantidade, saldo_atual in origem_lotes:
            db.execute(
                text("""
                    INSERT INTO lote_origem (lote_id, lote_origem_id, quantidade, peso_medio_g, data)
                    VALUES (:lote_id, :lote_origem_id, :quantidade, :peso_medio_g, :data)
                """),
                {
                    "lote_id": novo["id"], "lote_origem_id": lote_origem_id, "quantidade": quantidade,
                    "peso_medio_g": body.peso_medio_g, "data": body.data,
                },
            )
            # só fecha o lote de origem quando a repicagem esvazia ele por
            # completo — repicagem parcial deixa o restante ativo no
            # tanque, com o saldo já reduzido pelo lote_origem acima
            if quantidade >= saldo_atual:
                db.execute(
                    text("UPDATE lote SET data_fim = :data WHERE id = :id"),
                    {"data": body.data, "id": lote_origem_id},
                )
                fechados.append(lote_origem_id)

        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"dado inválido ou fora das regras: {exc.orig}") from exc

    return RepicagemOut(lote=LoteOut(**novo), lotes_origem_fechados=fechados)


@router.patch("/lotes/{lote_id}/encerrar", response_model=LoteOut)
def encerrar_lote(
    lote_id: int, body: EncerrarLoteIn, db: Session = Depends(get_db), _usuario: UsuarioOut = Depends(get_current_user),
):
    """Fecha o lote quando o tanque foi zerado por despesca (sem repicagem
    — essa já fecha sozinha). Sem isso o viveiro fica preso, sem poder
    receber um povoamento novo (só um lote aberto por viveiro)."""
    lote = db.execute(text("SELECT data_inicio, data_fim FROM lote WHERE id = :id"), {"id": lote_id}).mappings().first()
    if lote is None:
        raise HTTPException(404, "lote não encontrado")
    if lote["data_fim"] is not None:
        raise HTTPException(422, "esse lote já está encerrado")
    if body.data < lote["data_inicio"]:
        raise HTTPException(422, "data de encerramento não pode ser antes do início do lote")

    row = db.execute(
        text(f"UPDATE lote SET data_fim = :data WHERE id = :id RETURNING {_COLUNAS_LOTE}"),
        {"data": body.data, "id": lote_id},
    ).mappings().first()
    db.commit()
    return LoteOut(**row)
