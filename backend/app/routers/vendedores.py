from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas import VendedorIn, VendedorOut

router = APIRouter(prefix="/vendedores", tags=["vendedores"])


@router.get("", response_model=list[VendedorOut])
def listar_vendedores(db: Session = Depends(get_db)):
    rows = db.execute(text(
        "SELECT id, nome, telefone FROM vendedor WHERE ativo ORDER BY nome"
    )).mappings().all()
    return [VendedorOut(**r) for r in rows]


@router.post("", response_model=VendedorOut, status_code=201)
def criar_vendedor(body: VendedorIn, db: Session = Depends(get_db)):
    row = db.execute(
        text("INSERT INTO vendedor (nome, telefone) VALUES (:nome, :telefone) RETURNING id, nome, telefone"),
        body.model_dump(),
    ).mappings().first()
    db.commit()
    return VendedorOut(**row)


@router.delete("/{vendedor_id}", status_code=204)
def excluir_vendedor(vendedor_id: int, db: Session = Depends(get_db)):
    """Não apaga a linha (preserva o histórico de expedições já feitas por
    ele) — só inativa, e ele some das listagens."""
    row = db.execute(
        text("UPDATE vendedor SET ativo = false WHERE id = :id RETURNING id"), {"id": vendedor_id}
    ).mappings().first()
    db.commit()
    if row is None:
        raise HTTPException(404, "vendedor não encontrado")
