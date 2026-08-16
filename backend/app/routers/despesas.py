from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..schemas import DespesaEditarIn, DespesaIn, DespesaOut, UsuarioOut

router = APIRouter(prefix="/despesas", tags=["despesas"])
_COLUNAS = "id, client_id, data, categoria, valor, forma_pgto, expedicao_id, observacao, criado_em, excluido_em, excluido_por"


@router.get("", response_model=list[DespesaOut])
def listar_despesas(
    expedicao_id: int = Query(..., description="Despesas lançadas no acerto desta expedição"),
    db: Session = Depends(get_db),
    _usuario: UsuarioOut = Depends(get_current_user),
):
    """Alimenta o detalhe do relatório de acertos — despesas lançadas
    junto do acerto de uma expedição específica."""
    rows = db.execute(
        text(f"SELECT {_COLUNAS} FROM despesa WHERE expedicao_id = :id AND excluido_em IS NULL ORDER BY id"),
        {"id": expedicao_id},
    ).mappings().all()
    return [DespesaOut(**r) for r in rows]


@router.get("/soltas", response_model=list[DespesaOut])
def listar_despesas_soltas(
    de: date | None = Query(default=None),
    ate: date | None = Query(default=None),
    excluidos: bool = Query(default=False, description="true = só as excluídas (tela de restaurar)"),
    db: Session = Depends(get_db),
    _usuario: UsuarioOut = Depends(get_current_user),
):
    """Tela de conferência das despesas soltas (sem vínculo com
    expedição) — as de acerto de expedição são revertidas junto do
    acerto (POST /expedicoes/{id}/acerto/cancelar), não aqui."""
    ate = ate or date.today()
    de = de or (ate - timedelta(days=30))
    rows = db.execute(
        text(f"""
            SELECT {_COLUNAS} FROM despesa
            WHERE expedicao_id IS NULL AND data BETWEEN :de AND :ate
              AND {"excluido_em IS NOT NULL" if excluidos else "excluido_em IS NULL"}
            ORDER BY data DESC, id DESC
        """),
        {"de": de, "ate": ate},
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
                WHERE id = :id AND excluido_em IS NULL
                RETURNING {_COLUNAS}
            """),
            {"id": despesa_id, **body.model_dump()},
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"dado fora das regras: {exc.orig}") from exc
    if row is None:
        raise HTTPException(404, "despesa não encontrada (ou excluída — restaure antes de editar)")
    return DespesaOut(**row)


@router.delete("/{despesa_id}", response_model=DespesaOut)
def excluir_despesa(
    despesa_id: int, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user),
):
    """Só despesas soltas — as de acerto de expedição saem junto quando
    o acerto é cancelado (POST /expedicoes/{id}/acerto/cancelar)."""
    row = db.execute(
        text(f"""
            UPDATE despesa SET excluido_em = now(), excluido_por = :quem
            WHERE id = :id AND expedicao_id IS NULL AND excluido_em IS NULL
            RETURNING {_COLUNAS}
        """),
        {"id": despesa_id, "quem": usuario.nome},
    ).mappings().first()
    db.commit()
    if row is None:
        raise HTTPException(404, "despesa não encontrada, já excluída, ou vinculada a uma expedição")
    return DespesaOut(**row)


@router.post("/{despesa_id}/restaurar", response_model=DespesaOut)
def restaurar_despesa(
    despesa_id: int, db: Session = Depends(get_db), _usuario: UsuarioOut = Depends(get_current_user),
):
    row = db.execute(
        text(f"""
            UPDATE despesa SET excluido_em = NULL, excluido_por = NULL
            WHERE id = :id AND excluido_em IS NOT NULL
            RETURNING {_COLUNAS}
        """),
        {"id": despesa_id},
    ).mappings().first()
    db.commit()
    if row is None:
        raise HTTPException(404, "despesa não encontrada (ou não está excluída)")
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
