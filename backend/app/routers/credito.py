"""Crédito por cliente: limite definido × o que está em aberto (parcelas sem pagamento)."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..auth import exigir_gerente
from ..db import get_db

router = APIRouter(prefix="/credito", tags=["credito"])

_SQL = """
    SELECT c.id, c.nome, c.cidade, vd.nome AS vendedor_nome, c.prazo_dias, c.limite_credito,
           COALESCE(a.em_aberto, 0) AS em_aberto, COALESCE(a.vencido, 0) AS vencido,
           a.maior_atraso_dias, a.proximo_vencimento, COALESCE(a.vendas_abertas, 0) AS vendas_abertas,
           u.ultima_compra
    FROM cliente c
    LEFT JOIN vendedor vd ON vd.id = c.vendedor_id
    LEFT JOIN LATERAL (
      SELECT SUM(vp.valor) AS em_aberto,
             SUM(vp.valor) FILTER (WHERE vp.data_prevista < :hoje) AS vencido,
             MAX(:hoje - vp.data_prevista) FILTER (WHERE vp.data_prevista < :hoje) AS maior_atraso_dias,
             MIN(vp.data_prevista) FILTER (WHERE vp.data_prevista >= :hoje) AS proximo_vencimento,
             COUNT(DISTINCT v.id) AS vendas_abertas
      FROM venda v JOIN venda_parcela vp ON vp.venda_id = v.id
      WHERE v.cliente_id = c.id AND v.excluido_em IS NULL AND vp.excluido_em IS NULL AND vp.data_pagamento IS NULL
    ) a ON true
    LEFT JOIN LATERAL (
      SELECT MAX(data) AS ultima_compra FROM venda WHERE cliente_id = c.id AND excluido_em IS NULL
    ) u ON true
    WHERE c.ativo {filtro}
    ORDER BY COALESCE(a.em_aberto, 0) DESC, c.nome
"""


def _linha(r) -> dict:
    limite = float(r["limite_credito"]) if r["limite_credito"] is not None else None
    em_aberto, vencido = float(r["em_aberto"]), float(r["vencido"])
    disponivel = (limite - em_aberto) if limite is not None else None
    uso = (em_aberto / limite) if limite else None
    if limite is None:
        status = "sem_limite"
    elif em_aberto > limite + 0.005:
        status = "estourado"
    elif uso is not None and uso >= 0.8:
        status = "atencao"
    else:
        status = "ok"
    return {
        "cliente_id": r["id"], "nome": r["nome"], "cidade": r["cidade"], "vendedor_nome": r["vendedor_nome"],
        "prazo_dias": r["prazo_dias"], "limite_credito": limite, "em_aberto": em_aberto, "vencido": vencido,
        "a_vencer": em_aberto - vencido, "disponivel": disponivel, "uso": uso, "status": status,
        "maior_atraso_dias": r["maior_atraso_dias"], "proximo_vencimento": r["proximo_vencimento"],
        "vendas_abertas": r["vendas_abertas"], "ultima_compra": r["ultima_compra"],
    }


@router.get("/clientes")
def listar_credito(db: Session = Depends(get_db)):
    rows = db.execute(text(_SQL.format(filtro="")), {"hoje": date.today()}).mappings().all()
    return [_linha(r) for r in rows]


@router.get("/clientes/{cliente_id}")
def credito_do_cliente(cliente_id: int, db: Session = Depends(get_db)):
    r = db.execute(text(_SQL.format(filtro="AND c.id = :id")), {"hoje": date.today(), "id": cliente_id}).mappings().first()
    if r is None:
        raise HTTPException(404, "cliente não encontrado")
    return _linha(r)


class LimiteIn(BaseModel):
    limite_credito: float | None = Field(default=None, ge=0)


@router.patch("/clientes/{cliente_id}", dependencies=[Depends(exigir_gerente)])
def definir_limite(cliente_id: int, body: LimiteIn, db: Session = Depends(get_db)):
    r = db.execute(
        text("UPDATE cliente SET limite_credito = :l WHERE id = :id AND ativo RETURNING id"),
        {"l": body.limite_credito, "id": cliente_id},
    ).first()
    db.commit()
    if r is None:
        raise HTTPException(404, "cliente não encontrado")
    return credito_do_cliente(cliente_id, db)
