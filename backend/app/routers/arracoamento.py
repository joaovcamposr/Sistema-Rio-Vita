from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..schemas import ArracoamentoIn, ArracoamentoOut, UsuarioOut

router = APIRouter(prefix="/arracoamento", tags=["arracoamento"])
_COLUNAS = "id, client_id, lote_id, data, trato, sacos, tipo_racao_id, criado_em"


def _linha(r) -> ArracoamentoOut:
    d = dict(r)
    d["trato"] = d["trato"].strftime("%H:%M")
    return ArracoamentoOut(**d)


@router.post("", response_model=ArracoamentoOut, status_code=201)
def criar_arracoamento(
    body: ArracoamentoIn, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user),
):
    try:
        row = db.execute(
            text(f"""
                INSERT INTO arracoamento (client_id, lote_id, data, trato, sacos, tipo_racao_id, criado_por)
                VALUES (:client_id, :lote_id, :data, :trato, :sacos, :tipo_racao_id, :criado_por)
                ON CONFLICT (client_id) DO NOTHING
                RETURNING {_COLUNAS}
            """),
            {**body.model_dump(), "criado_por": usuario.nome},
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"lote_id inválido ou dado fora das regras: {exc.orig}") from exc

    if row is None:
        row = db.execute(
            text(f"SELECT {_COLUNAS} FROM arracoamento WHERE client_id = :cid"),
            {"cid": str(body.client_id)},
        ).mappings().first()
        if row is None:
            raise HTTPException(422, "já existe um lançamento para este lote, data e trato")
    return _linha(row)
