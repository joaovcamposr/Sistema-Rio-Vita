from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..schemas import DespesaEditarIn, DespesaIn, DespesaOut, UsuarioOut

router = APIRouter(prefix="/despesas", tags=["despesas"])
_COLUNAS = "id, client_id, data, categoria, valor, forma_pgto, expedicao_id, observacao, criado_em"


@router.get("", response_model=list[DespesaOut])
def listar_despesas(
    expedicao_id: int = Query(..., description="Despesas lançadas no acerto desta expedição"),
    db: Session = Depends(get_db),
    _usuario: UsuarioOut = Depends(get_current_user),
):
    """Alimenta o detalhe do relatório de acertos — despesas lançadas
    junto do acerto de uma expedição específica."""
    rows = db.execute(
        text(f"SELECT {_COLUNAS} FROM despesa WHERE expedicao_id = :id ORDER BY id"),
        {"id": expedicao_id},
    ).mappings().all()
    return [DespesaOut(**r) for r in rows]


@router.patch("/{despesa_id}", response_model=DespesaOut)
def editar_despesa(
    despesa_id: int, body: DespesaEditarIn, db: Session = Depends(get_db),
    _usuario: UsuarioOut = Depends(get_current_user),
):
    """Corrige categoria/valor/forma/observação de uma despesa já
    lançada (solta ou de acerto de expedição)."""
    try:
        row = db.execute(
            text(f"""
                UPDATE despesa SET data = :data, categoria = :categoria, valor = :valor,
                                    forma_pgto = :forma_pgto, observacao = :observacao
                WHERE id = :id
                RETURNING {_COLUNAS}
            """),
            {"id": despesa_id, **body.model_dump()},
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"dado fora das regras: {exc.orig}") from exc
    if row is None:
        raise HTTPException(404, "despesa não encontrada")
    return DespesaOut(**row)


@router.post("", response_model=DespesaOut, status_code=201)
def criar_despesa(body: DespesaIn, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user)):
    """Despesa solta — sem vínculo com nenhuma expedição (as da rota entram
    junto do acerto, em POST /expedicoes/{id}/acerto)."""
    try:
        row = db.execute(
            text(f"""
                INSERT INTO despesa (client_id, data, categoria, valor, forma_pgto, observacao, criado_por)
                VALUES (:client_id, :data, :categoria, :valor, :forma_pgto, :observacao, :criado_por)
                ON CONFLICT (client_id) DO NOTHING
                RETURNING {_COLUNAS}
            """),
            {**body.model_dump(), "criado_por": usuario.nome},
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"dado inválido: {exc.orig}") from exc

    if row is None:
        row = db.execute(
            text(f"SELECT {_COLUNAS} FROM despesa WHERE client_id = :cid"),
            {"cid": str(body.client_id)},
        ).mappings().first()
    return DespesaOut(**row)
