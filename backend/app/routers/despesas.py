from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..schemas import DespesaIn, DespesaOut, UsuarioOut

router = APIRouter(prefix="/despesas", tags=["despesas"])
_COLUNAS = "id, client_id, data, categoria, valor, forma_pgto, expedicao_id, observacao, criado_em"


@router.post("", response_model=DespesaOut, status_code=201)
def criar_despesa(body: DespesaIn, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user)):
    """Despesa solta — sem vínculo com nenhuma expedição (as da rota entram
    junto do acerto, em POST /expedicoes/{id}/acerto)."""
    try:
        row = db.execute(
            text(f"""
                INSERT INTO despesa (client_id, data, categoria, valor, forma_pgto, observacao, criado_por)
                VALUES (:client_id, :data, :categoria, :valor, :forma_pgto, :observacao, :criado_por)
                ON CONFLICT (client_id) DO NOTHING
                RETURNING {_COLUNAS}
            """),
            {**body.model_dump(), "criado_por": usuario.nome},
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"dado inválido: {exc.orig}") from exc

    if row is None:
        row = db.execute(
            text(f"SELECT {_COLUNAS} FROM despesa WHERE client_id = :cid"),
            {"cid": str(body.client_id)},
        ).mappings().first()
    return DespesaOut(**row)
