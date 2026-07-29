from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..schemas import AjusteEstoqueIn, AjusteEstoqueOut, UsuarioOut

router = APIRouter(prefix="/ajustes-estoque", tags=["ajustes-estoque"])
_COLUNAS = (
    "a.id, a.client_id, a.data, a.produto_id, pr.nome AS produto_nome, "
    "a.quantidade_embalagens, a.quantidade_kg, a.tipo, a.observacao, a.criado_em"
)
_FROM = "FROM ajuste_estoque a JOIN produto pr ON pr.id = a.produto_id"


@router.get("", response_model=list[AjusteEstoqueOut])
def listar_ajustes(
    de: date | None = Query(default=None),
    ate: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    where = "WHERE a.data BETWEEN :de AND :ate" if de and ate else ""
    rows = db.execute(
        text(f"SELECT {_COLUNAS} {_FROM} {where} ORDER BY a.data DESC, a.id DESC"),
        {"de": de, "ate": ate},
    ).mappings().all()
    return [AjusteEstoqueOut(**r) for r in rows]


@router.post("", response_model=AjusteEstoqueOut, status_code=201)
def criar_ajuste(
    body: AjusteEstoqueIn, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user),
):
    try:
        produto = db.execute(
            text("SELECT kg_digitado, fator_kg FROM produto WHERE id = :id"),
            {"id": body.produto_id},
        ).mappings().first()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, "produto_id inválido") from exc
    if produto is None:
        raise HTTPException(422, "produto_id inválido")

    if produto["kg_digitado"]:
        if body.quantidade_kg is None:
            raise HTTPException(422, "este produto exige quantidade_kg (peso digitado por peixe)")
    elif body.quantidade_embalagens is None:
        raise HTTPException(422, "este produto exige quantidade_embalagens — o Kg é convertido automaticamente")

    payload = {
        "client_id": str(body.client_id),
        "data": body.data,
        "produto_id": body.produto_id,
        "quantidade_embalagens": body.quantidade_embalagens,
        "quantidade_kg": body.quantidade_kg if body.quantidade_kg is not None else 0,
        "tipo": body.tipo,
        "observacao": body.observacao,
        "criado_por": usuario.nome,
    }

    try:
        row = db.execute(
            text("""
                INSERT INTO ajuste_estoque (client_id, data, produto_id, quantidade_embalagens, quantidade_kg, tipo, observacao, criado_por)
                VALUES (:client_id, :data, :produto_id, :quantidade_embalagens, :quantidade_kg, :tipo, :observacao, :criado_por)
                ON CONFLICT (client_id) DO NOTHING
                RETURNING id
            """),
            payload,
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"dado fora das regras: {exc.orig}") from exc

    ajuste_id = row["id"] if row else db.execute(
        text("SELECT id FROM ajuste_estoque WHERE client_id = :cid"), {"cid": str(body.client_id)}
    ).scalar()
    result = db.execute(
        text(f"SELECT {_COLUNAS} {_FROM} WHERE a.id = :id"), {"id": ajuste_id}
    ).mappings().first()
    return AjusteEstoqueOut(**result)
