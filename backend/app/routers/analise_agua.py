from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..schemas import AnaliseAguaIn, AnaliseAguaOut, UsuarioOut

router = APIRouter(prefix="/analise-agua", tags=["analise-agua"])
_COLUNAS = (
    "id, client_id, viveiro_id, data, oxigenio, temperatura_c, amonia, ph, nitrito, "
    "nitrato, criado_em"
)


@router.post("", response_model=AnaliseAguaOut, status_code=201)
def criar_analise_agua(
    body: AnaliseAguaIn, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user),
):
    try:
        row = db.execute(
            text(f"""
                INSERT INTO analise_agua
                    (client_id, viveiro_id, data, oxigenio, temperatura_c, amonia, ph, nitrito, nitrato, criado_por)
                VALUES
                    (:client_id, :viveiro_id, :data, :oxigenio, :temperatura_c, :amonia, :ph, :nitrito, :nitrato,
                     :criado_por)
                ON CONFLICT (client_id) DO NOTHING
                RETURNING {_COLUNAS}
            """),
            {**body.model_dump(), "criado_por": usuario.nome},
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"viveiro_id inválido ou dado fora das regras: {exc.orig}") from exc

    if row is None:
        row = db.execute(
            text(f"SELECT {_COLUNAS} FROM analise_agua WHERE client_id = :cid"),
            {"cid": str(body.client_id)},
        ).mappings().first()
        if row is None:
            raise HTTPException(422, "já existe uma análise para este viveiro nesta data")
    return AnaliseAguaOut(**{**row, "oxigenio": float(row["oxigenio"]) if row["oxigenio"] is not None else None,
                              "temperatura_c": float(row["temperatura_c"]) if row["temperatura_c"] is not None else None,
                              "amonia": float(row["amonia"]) if row["amonia"] is not None else None,
                              "ph": float(row["ph"]) if row["ph"] is not None else None,
                              "nitrito": float(row["nitrito"]) if row["nitrito"] is not None else None,
                              "nitrato": float(row["nitrato"]) if row["nitrato"] is not None else None})
