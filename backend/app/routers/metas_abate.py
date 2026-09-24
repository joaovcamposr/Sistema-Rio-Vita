from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..schemas import MetaAbateMesOut, MetasAbateIn, UsuarioOut

router = APIRouter(prefix="/metas-abate", tags=["metas-abate"])


@router.put("", response_model=list[MetaAbateMesOut])
def salvar_metas(
    body: MetasAbateIn, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user),
):
    salvas = []
    for m in body.metas:
        mes = m.mes.replace(day=1)
        row = db.execute(
            text("""
                INSERT INTO meta_abate_mensal (mes, kg, atualizado_por) VALUES (:mes, :kg, :quem)
                ON CONFLICT (mes) DO UPDATE SET kg = EXCLUDED.kg, atualizado_em = now(), atualizado_por = EXCLUDED.atualizado_por
                RETURNING mes, kg
            """),
            {"mes": mes, "kg": m.kg, "quem": usuario.nome},
        ).mappings().first()
        salvas.append(MetaAbateMesOut(mes=row["mes"], kg=float(row["kg"])))
    db.commit()
    return salvas
