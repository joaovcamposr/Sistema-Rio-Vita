from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..schemas import InteracaoClienteEditarIn, InteracaoClienteIn, InteracaoClienteOut, UsuarioOut

router = APIRouter(tags=["interacoes"])

_QUERY = """
    SELECT i.id, i.cliente_id, i.data, i.tipo, i.descricao, i.vendedor_id, vd.nome AS vendedor_nome,
           i.criado_em, i.criado_por, i.excluido_em, i.excluido_por
    FROM interacao_cliente i
    LEFT JOIN vendedor vd ON vd.id = i.vendedor_id
"""


@router.post("/interacoes", response_model=InteracaoClienteOut, status_code=201)
def criar_interacao(
    body: InteracaoClienteIn, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user),
):
    try:
        row = db.execute(
            text("""
                INSERT INTO interacao_cliente (cliente_id, data, tipo, descricao, vendedor_id, criado_por)
                VALUES (:cliente_id, :data, :tipo, :descricao, :vendedor_id, :criado_por)
                RETURNING id
            """),
            {**body.model_dump(), "criado_por": usuario.nome},
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"cliente_id ou vendedor_id inválido: {exc.orig}") from exc

    criada = db.execute(text(f"{_QUERY} WHERE i.id = :id"), {"id": row["id"]}).mappings().first()
    return InteracaoClienteOut(**criada)


@router.get("/clientes/{cliente_id}/interacoes", response_model=list[InteracaoClienteOut])
def listar_interacoes(
    cliente_id: int,
    excluidos: bool = Query(default=False, description="true = só as excluídas (tela de restaurar)"),
    db: Session = Depends(get_db),
    _usuario: UsuarioOut = Depends(get_current_user),
):
    rows = db.execute(
        text(f"""
            {_QUERY}
            WHERE i.cliente_id = :cliente_id
              AND {"i.excluido_em IS NOT NULL" if excluidos else "i.excluido_em IS NULL"}
            ORDER BY i.data DESC, i.id DESC
        """),
        {"cliente_id": cliente_id},
    ).mappings().all()
    return [InteracaoClienteOut(**r) for r in rows]


@router.patch("/interacoes/{interacao_id}", response_model=InteracaoClienteOut)
def editar_interacao(
    interacao_id: int, body: InteracaoClienteEditarIn, db: Session = Depends(get_db),
    _usuario: UsuarioOut = Depends(get_current_user),
):
    try:
        atualizado = db.execute(
            text("""
                UPDATE interacao_cliente SET data = :data, tipo = :tipo, descricao = :descricao,
                                              vendedor_id = :vendedor_id
                WHERE id = :id AND excluido_em IS NULL
                RETURNING id
            """),
            {"id": interacao_id, **body.model_dump()},
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"vendedor_id inválido: {exc.orig}") from exc
    if atualizado is None:
        raise HTTPException(404, "interação não encontrada (ou excluída — restaure antes de editar)")
    row = db.execute(text(f"{_QUERY} WHERE i.id = :id"), {"id": interacao_id}).mappings().first()
    return InteracaoClienteOut(**row)


@router.delete("/interacoes/{interacao_id}", response_model=InteracaoClienteOut)
def excluir_interacao(
    interacao_id: int, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user),
):
    atualizado = db.execute(
        text("""
            UPDATE interacao_cliente SET excluido_em = now(), excluido_por = :quem
            WHERE id = :id AND excluido_em IS NULL
            RETURNING id
        """),
        {"id": interacao_id, "quem": usuario.nome},
    ).mappings().first()
    db.commit()
    if atualizado is None:
        raise HTTPException(404, "interação não encontrada (ou já excluída)")
    row = db.execute(text(f"{_QUERY} WHERE i.id = :id"), {"id": interacao_id}).mappings().first()
    return InteracaoClienteOut(**row)


@router.post("/interacoes/{interacao_id}/restaurar", response_model=InteracaoClienteOut)
def restaurar_interacao(
    interacao_id: int, db: Session = Depends(get_db), _usuario: UsuarioOut = Depends(get_current_user),
):
    atualizado = db.execute(
        text("""
            UPDATE interacao_cliente SET excluido_em = NULL, excluido_por = NULL
            WHERE id = :id AND excluido_em IS NOT NULL
            RETURNING id
        """),
        {"id": interacao_id},
    ).mappings().first()
    db.commit()
    if atualizado is None:
        raise HTTPException(404, "interação não encontrada (ou não está excluída)")
    row = db.execute(text(f"{_QUERY} WHERE i.id = :id"), {"id": interacao_id}).mappings().first()
    return InteracaoClienteOut(**row)
