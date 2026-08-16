from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..schemas import AjusteEstoqueEditarIn, AjusteEstoqueIn, AjusteEstoqueOut, UsuarioOut

router = APIRouter(prefix="/ajustes-estoque", tags=["ajustes-estoque"])
_COLUNAS = (
    "a.id, a.client_id, a.data, a.produto_id, pr.nome AS produto_nome, "
    "a.quantidade_embalagens, a.quantidade_kg, a.tipo, a.observacao, a.criado_em, "
    "a.excluido_em, a.excluido_por"
)
_FROM = "FROM ajuste_estoque a JOIN produto pr ON pr.id = a.produto_id"


@router.get("", response_model=list[AjusteEstoqueOut])
def listar_ajustes(
    de: date | None = Query(default=None),
    ate: date | None = Query(default=None),
    excluidos: bool = Query(default=False, description="true = só os excluídos (tela de restaurar)"),
    db: Session = Depends(get_db),
):
    condicoes = ["a.data BETWEEN :de AND :ate"] if de and ate else []
    condicoes.append("a.excluido_em IS NOT NULL" if excluidos else "a.excluido_em IS NULL")
    where = "WHERE " + " AND ".join(condicoes)
    rows = db.execute(
        text(f"SELECT {_COLUNAS} {_FROM} {where} ORDER BY a.data DESC, a.id DESC"),
        {"de": de, "ate": ate},
    ).mappings().all()
    return [AjusteEstoqueOut(**r) for r in rows]


@router.post("", response_model=AjusteEstoqueOut, status_code=201)
def criar_ajuste(
    body: AjusteEstoqueIn, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user),
):
    try:
        produto = db.execute(
            text("SELECT kg_digitado, fator_kg FROM produto WHERE id = :id"),
            {"id": body.produto_id},
        ).mappings().first()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, "produto_id inválido") from exc
    if produto is None:
        raise HTTPException(422, "produto_id inválido")

    if produto["kg_digitado"]:
        if body.quantidade_kg is None:
            raise HTTPException(422, "este produto exige quantidade_kg (peso digitado por peixe)")
    elif body.quantidade_embalagens is None:
        raise HTTPException(422, "este produto exige quantidade_embalagens — o Kg é convertido automaticamente")

    payload = {
        "client_id": str(body.client_id),
        "data": body.data,
        "produto_id": body.produto_id,
        "quantidade_embalagens": body.quantidade_embalagens,
        "quantidade_kg": body.quantidade_kg if body.quantidade_kg is not None else 0,
        "tipo": body.tipo,
        "observacao": body.observacao,
        "criado_por": usuario.nome,
    }

    try:
        row = db.execute(
            text("""
                INSERT INTO ajuste_estoque (client_id, data, produto_id, quantidade_embalagens, quantidade_kg, tipo, observacao, criado_por)
                VALUES (:client_id, :data, :produto_id, :quantidade_embalagens, :quantidade_kg, :tipo, :observacao, :criado_por)
                ON CONFLICT (client_id) DO NOTHING
                RETURNING id
            """),
            payload,
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"dado fora das regras: {exc.orig}") from exc

    ajuste_id = row["id"] if row else db.execute(
        text("SELECT id FROM ajuste_estoque WHERE client_id = :cid"), {"cid": str(body.client_id)}
    ).scalar()
    result = db.execute(
        text(f"SELECT {_COLUNAS} {_FROM} WHERE a.id = :id"), {"id": ajuste_id}
    ).mappings().first()
    return AjusteEstoqueOut(**result)


@router.patch("/{ajuste_id}", response_model=AjusteEstoqueOut)
def editar_ajuste(
    ajuste_id: int, body: AjusteEstoqueEditarIn, db: Session = Depends(get_db),
    _usuario: UsuarioOut = Depends(get_current_user),
):
    """Corrige data, quantidade, tipo ou observação de um ajuste já
    lançado. Não mexe em produto — pra reatribuir a outro produto,
    exclua e lance de novo."""
    atual = db.execute(
        text("SELECT pr.kg_digitado FROM ajuste_estoque a JOIN produto pr ON pr.id = a.produto_id WHERE a.id = :id AND a.excluido_em IS NULL"),
        {"id": ajuste_id},
    ).mappings().first()
    if atual is None:
        raise HTTPException(404, "ajuste não encontrado (ou excluído — restaure antes de editar)")

    payload = {
        "id": ajuste_id,
        "data": body.data,
        "quantidade_embalagens": None if atual["kg_digitado"] else body.quantidade_embalagens,
        "quantidade_kg": body.quantidade_kg if atual["kg_digitado"] and body.quantidade_kg is not None else 0,
        "tipo": body.tipo,
        "observacao": body.observacao,
    }
    try:
        row = db.execute(
            text("""
                UPDATE ajuste_estoque
                SET data = :data, quantidade_embalagens = :quantidade_embalagens,
                    quantidade_kg = :quantidade_kg, tipo = :tipo, observacao = :observacao
                WHERE id = :id AND excluido_em IS NULL
                RETURNING id
            """),
            payload,
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"dado fora das regras: {exc.orig}") from exc
    if row is None:
        raise HTTPException(404, "ajuste não encontrado (ou excluído — restaure antes de editar)")
    result = db.execute(text(f"SELECT {_COLUNAS} {_FROM} WHERE a.id = :id"), {"id": ajuste_id}).mappings().first()
    return AjusteEstoqueOut(**result)


@router.delete("/{ajuste_id}", response_model=AjusteEstoqueOut)
def excluir_ajuste(
    ajuste_id: int, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user),
):
    row = db.execute(
        text("""
            UPDATE ajuste_estoque SET excluido_em = now(), excluido_por = :quem
            WHERE id = :id AND excluido_em IS NULL
            RETURNING id
        """),
        {"id": ajuste_id, "quem": usuario.nome},
    ).mappings().first()
    db.commit()
    if row is None:
        raise HTTPException(404, "ajuste não encontrado (ou já excluído)")
    result = db.execute(text(f"SELECT {_COLUNAS} {_FROM} WHERE a.id = :id"), {"id": ajuste_id}).mappings().first()
    return AjusteEstoqueOut(**result)


@router.post("/{ajuste_id}/restaurar", response_model=AjusteEstoqueOut)
def restaurar_ajuste(
    ajuste_id: int, db: Session = Depends(get_db), _usuario: UsuarioOut = Depends(get_current_user),
):
    row = db.execute(
        text("""
            UPDATE ajuste_estoque SET excluido_em = NULL, excluido_por = NULL
            WHERE id = :id AND excluido_em IS NOT NULL
            RETURNING id
        """),
        {"id": ajuste_id},
    ).mappings().first()
    db.commit()
    if row is None:
        raise HTTPException(404, "ajuste não encontrado (ou não está excluído)")
    result = db.execute(text(f"SELECT {_COLUNAS} {_FROM} WHERE a.id = :id"), {"id": ajuste_id}).mappings().first()
    return AjusteEstoqueOut(**result)
