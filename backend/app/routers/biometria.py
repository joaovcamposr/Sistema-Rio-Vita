from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..schemas import BiometriaDetalheOut, BiometriaEditarIn, BiometriaIn, BiometriaOut, UsuarioOut

router = APIRouter(prefix="/biometria", tags=["biometria"])
_COLUNAS = "id, client_id, lote_id, data, peso_medio_g, criado_em, excluido_em, excluido_por"


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


@router.get("/painel", response_model=list[BiometriaDetalheOut])
def painel_biometria(
    de: date | None = Query(default=None),
    ate: date | None = Query(default=None),
    excluidos: bool = Query(default=False, description="true = só as excluídas (tela de restaurar)"),
    db: Session = Depends(get_db),
    _usuario: UsuarioOut = Depends(get_current_user),
):
    """Uma linha por biometria já lançada — tela de conferência, com
    opção de corrigir cada lançamento (PATCH /biometria/{id})."""
    ate = ate or date.today()
    de = de or (ate - timedelta(days=30))
    rows = db.execute(text(f"""
        SELECT b.id, b.lote_id, l.codigo AS lote_codigo, v.codigo AS viveiro_codigo,
               b.data, b.peso_medio_g, b.criado_em, b.excluido_em, b.excluido_por
        FROM biometria b
        JOIN lote l ON l.id = b.lote_id
        JOIN viveiro v ON v.id = l.viveiro_id
        WHERE b.data BETWEEN :de AND :ate
          AND {"b.excluido_em IS NOT NULL" if excluidos else "b.excluido_em IS NULL"}
        ORDER BY b.data DESC, b.id DESC
    """), {"de": de, "ate": ate}).mappings().all()
    return [BiometriaDetalheOut(**r) for r in rows]


@router.patch("/{biometria_id}", response_model=BiometriaOut)
def editar_biometria(
    biometria_id: int, body: BiometriaEditarIn, db: Session = Depends(get_db),
    _usuario: UsuarioOut = Depends(get_current_user),
):
    """Corrige data ou peso médio de uma biometria já lançada. Não mexe
    em lote — pra reatribuir a outro tanque, exclua e lance de novo."""
    try:
        row = db.execute(
            text(f"""
                UPDATE biometria SET data = :data, peso_medio_g = :peso_medio_g
                WHERE id = :id AND excluido_em IS NULL
                RETURNING {_COLUNAS}
            """),
            {"id": biometria_id, **body.model_dump()},
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"já existe outra biometria deste lote nesta data: {exc.orig}") from exc
    if row is None:
        raise HTTPException(404, "biometria não encontrada (ou excluída — restaure antes de editar)")
    return BiometriaOut(**row)


@router.delete("/{biometria_id}", response_model=BiometriaOut)
def excluir_biometria(
    biometria_id: int, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user),
):
    row = db.execute(
        text(f"""
            UPDATE biometria SET excluido_em = now(), excluido_por = :quem
            WHERE id = :id AND excluido_em IS NULL
            RETURNING {_COLUNAS}
        """),
        {"id": biometria_id, "quem": usuario.nome},
    ).mappings().first()
    db.commit()
    if row is None:
        raise HTTPException(404, "biometria não encontrada (ou já excluída)")
    return BiometriaOut(**row)


@router.post("/{biometria_id}/restaurar", response_model=BiometriaOut)
def restaurar_biometria(
    biometria_id: int, db: Session = Depends(get_db), _usuario: UsuarioOut = Depends(get_current_user),
):
    row = db.execute(
        text(f"""
            UPDATE biometria SET excluido_em = NULL, excluido_por = NULL
            WHERE id = :id AND excluido_em IS NOT NULL
            RETURNING {_COLUNAS}
        """),
        {"id": biometria_id},
    ).mappings().first()
    db.commit()
    if row is None:
        raise HTTPException(404, "biometria não encontrada (ou não está excluída)")
    return BiometriaOut(**row)
