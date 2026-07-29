from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas import ProdutoOut

router = APIRouter(prefix="/produtos", tags=["produtos"])


@router.get("", response_model=list[ProdutoOut])
def listar_produtos(db: Session = Depends(get_db)):
    rows = db.execute(text(
        "SELECT id, nome, unidade_embalagem, fator_kg, kg_digitado "
        "FROM produto WHERE ativo ORDER BY nome"
    )).mappings().all()
    return [
        ProdutoOut(
            id=r["id"], nome=r["nome"], unidade_embalagem=r["unidade_embalagem"],
            fator_kg=float(r["fator_kg"]) if r["fator_kg"] is not None else None,
            kg_digitado=r["kg_digitado"],
        )
        for r in rows
    ]
