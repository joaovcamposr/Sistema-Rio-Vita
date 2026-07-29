from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..schemas import BiometriaIn, BiometriaOut, UsuarioOut

router = APIRouter(prefix="/biometria", tags=["biometria"])
_COLUNAS = "id, client_id, lote_id, data, peso_medio_g, criado_em"


@router.post("", response_model=BiometriaOut, status_code=201)
def criar_biometria(
    body: BiometriaIn, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user),
):
    try:
        row = db.execute(
            text(f"""
                INSERT INTO biometria (client_id, lote_id, data, peso_medio_g, criado_por)
                VALUES (:client_id, :lote_id, :data, :peso_medio_g, :criado_por)
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
            text(f"SELECT {_COLUNAS} FROM biometria WHERE client_id = :cid"),
            {"cid": str(body.client_id)},
        ).mappings().first()
        if row is None:
            # client_id não colidiu, mas (lote_id, data) já tinha biometria de outra tentativa
            raise HTTPException(422, "já existe uma biometria para este lote nesta data")
    return BiometriaOut(**row)
