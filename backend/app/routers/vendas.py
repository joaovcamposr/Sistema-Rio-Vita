from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..schemas import UsuarioOut, VendaIn, VendaOut

router = APIRouter(prefix="/vendas", tags=["vendas"])
_COLUNAS = (
    "id, client_id, data, cliente_id, vendedor, produto_id, quantidade_un, "
    "quantidade_kg, preco_kg, valor_total, forma_pgto, criado_em"
)


@router.post("", response_model=VendaOut, status_code=201)
def criar_venda(body: VendaIn, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user)):
    try:
        row = db.execute(
            text(f"""
                INSERT INTO venda (client_id, data, cliente_id, vendedor, produto_id,
                                    quantidade_un, quantidade_kg, preco_kg, forma_pgto, criado_por)
                VALUES (:client_id, :data, :cliente_id, :vendedor, :produto_id,
                        :quantidade_un, :quantidade_kg, :preco_kg, :forma_pgto, :criado_por)
                ON CONFLICT (client_id) DO NOTHING
                RETURNING {_COLUNAS}
            """),
            {**body.model_dump(), "criado_por": usuario.nome},
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"cliente_id/produto_id inválido ou dado fora das regras: {exc.orig}") from exc

    if row is None:
        row = db.execute(
            text(f"SELECT {_COLUNAS} FROM venda WHERE client_id = :cid"),
            {"cid": str(body.client_id)},
        ).mappings().first()
    return VendaOut(**row)
