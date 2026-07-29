from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas import ParametroIn, ParametroOut

router = APIRouter(prefix="/parametros", tags=["parametros"])


@router.get("", response_model=list[ParametroOut])
def listar_parametros(db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT chave, valor, descricao FROM parametro ORDER BY chave")).mappings().all()
    return [ParametroOut(chave=r["chave"], valor=float(r["valor"]), descricao=r["descricao"]) for r in rows]


@router.put("/{chave}", response_model=ParametroOut)
def atualizar_parametro(chave: str, body: ParametroIn, db: Session = Depends(get_db)):
    row = db.execute(
        text("UPDATE parametro SET valor = :valor WHERE chave = :chave RETURNING chave, valor, descricao"),
        {"chave": chave, "valor": body.valor},
    ).mappings().first()
    db.commit()
    if row is None:
        raise HTTPException(404, "parâmetro não encontrado")
    return ParametroOut(chave=row["chave"], valor=float(row["valor"]), descricao=row["descricao"])
