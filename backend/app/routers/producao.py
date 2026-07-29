from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..schemas import ProducaoIn, ProducaoOut, UsuarioOut

router = APIRouter(prefix="/producao", tags=["producao"])

_COLUNAS = "id, client_id, data, produto_id, quantidade_embalagens, quantidade_kg, lote_id, data_despesca, criado_em"


@router.post("", response_model=ProducaoOut, status_code=201)
def criar_producao(body: ProducaoIn, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user)):
    try:
        produto = db.execute(
            text("SELECT kg_digitado, fator_kg FROM produto WHERE id = :id"),
            {"id": body.produto_id},
        ).mappings().first()
    except DBAPIError as exc:
        # ex.: produto_id fora da faixa do smallint — entrada inválida, não
        # erro de servidor
        db.rollback()
        raise HTTPException(422, "produto_id inválido") from exc
    if produto is None:
        raise HTTPException(422, "produto_id inválido")

    # regra R1: produto com fator de conversão exige bandejas; produto com
    # Kg digitado (ex.: tilápia limpa) exige o Kg direto
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
        # placeholder quando convertido por trigger; valor real quando kg_digitado
        "quantidade_kg": body.quantidade_kg if body.quantidade_kg is not None else 0,
        "lote_id": body.lote_id,
        "data_despesca": body.data_despesca,
        "criado_por": usuario.nome,
    }

    try:
        row = db.execute(
            text(f"""
                INSERT INTO producao (client_id, data, produto_id, quantidade_embalagens,
                                       quantidade_kg, lote_id, data_despesca, criado_por)
                VALUES (:client_id, :data, :produto_id, :quantidade_embalagens,
                        :quantidade_kg, :lote_id, :data_despesca, :criado_por)
                ON CONFLICT (client_id) DO NOTHING
                RETURNING {_COLUNAS}
            """),
            payload,
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"lote_id inválido ou dado fora das regras: {exc.orig}") from exc

    if row is None:
        row = db.execute(
            text(f"SELECT {_COLUNAS} FROM producao WHERE client_id = :cid"),
            {"cid": str(body.client_id)},
        ).mappings().first()
    return ProducaoOut(**row)
