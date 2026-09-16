from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..schemas import LembreteClienteEditarIn, LembreteClienteIn, LembreteClienteOut, UsuarioOut

router = APIRouter(tags=["lembretes"])

_QUERY = """
    SELECT l.id, l.cliente_id, c.nome AS cliente_nome, l.data_prevista, l.descricao,
           l.vendedor_id, vd.nome AS vendedor_nome, l.concluido, l.concluido_em,
           l.criado_em, l.criado_por, l.excluido_em, l.excluido_por
    FROM lembrete_cliente l
    JOIN cliente c ON c.id = l.cliente_id
    LEFT JOIN vendedor vd ON vd.id = l.vendedor_id
"""


@router.post("/lembretes", response_model=LembreteClienteOut, status_code=201)
def criar_lembrete(
    body: LembreteClienteIn, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user),
):
    try:
        row = db.execute(
            text("""
                INSERT INTO lembrete_cliente (cliente_id, data_prevista, descricao, vendedor_id, criado_por)
                VALUES (:cliente_id, :data_prevista, :descricao, :vendedor_id, :criado_por)
                RETURNING id
            """),
            {**body.model_dump(), "criado_por": usuario.nome},
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"cliente_id ou vendedor_id inválido: {exc.orig}") from exc

    criado = db.execute(text(f"{_QUERY} WHERE l.id = :id"), {"id": row["id"]}).mappings().first()
    return LembreteClienteOut(**criado)


@router.get("/clientes/{cliente_id}/lembretes", response_model=list[LembreteClienteOut])
def listar_lembretes_cliente(
    cliente_id: int,
    excluidos: bool = Query(default=False),
    db: Session = Depends(get_db),
    _usuario: UsuarioOut = Depends(get_current_user),
):
    rows = db.execute(
        text(f"""
            {_QUERY}
            WHERE l.cliente_id = :cliente_id
              AND {"l.excluido_em IS NOT NULL" if excluidos else "l.excluido_em IS NULL"}
            ORDER BY l.concluido ASC, l.data_prevista ASC
        """),
        {"cliente_id": cliente_id},
    ).mappings().all()
    return [LembreteClienteOut(**r) for r in rows]


@router.get("/lembretes", response_model=list[LembreteClienteOut])
def painel_lembretes(
    situacao: str = Query(default="pendente", description="pendente | atrasado | concluido | todos"),
    vendedor_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _usuario: UsuarioOut = Depends(get_current_user),
):
    """Follow-ups pra tela de painel: o que está pendente, atrasado ou já
    concluído, com filtro por vendedor. 'atrasado' é um pendente cuja
    data_prevista já passou — mesmo cálculo simples usado no resto do
    sistema (comparar contra a data de hoje), sem status próprio na
    tabela pra não desincronizar."""
    condicoes = ["l.excluido_em IS NULL"]
    params: dict = {}
    if situacao == "pendente":
        condicoes.append("l.concluido = false")
    elif situacao == "atrasado":
        condicoes.append("l.concluido = false AND l.data_prevista < CURRENT_DATE")
    elif situacao == "concluido":
        condicoes.append("l.concluido = true")
    # "todos" não adiciona filtro de situação
    if vendedor_id is not None:
        condicoes.append("l.vendedor_id = :vendedor_id")
        params["vendedor_id"] = vendedor_id

    rows = db.execute(
        text(f"{_QUERY} WHERE {' AND '.join(condicoes)} ORDER BY l.concluido ASC, l.data_prevista ASC"),
        params,
    ).mappings().all()
    return [LembreteClienteOut(**r) for r in rows]


@router.patch("/lembretes/{lembrete_id}", response_model=LembreteClienteOut)
def editar_lembrete(
    lembrete_id: int, body: LembreteClienteEditarIn, db: Session = Depends(get_db),
    _usuario: UsuarioOut = Depends(get_current_user),
):
    try:
        atualizado = db.execute(
            text("""
                UPDATE lembrete_cliente SET data_prevista = :data_prevista, descricao = :descricao,
                                             vendedor_id = :vendedor_id
                WHERE id = :id AND excluido_em IS NULL
                RETURNING id
            """),
            {"id": lembrete_id, **body.model_dump()},
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"vendedor_id inválido: {exc.orig}") from exc
    if atualizado is None:
        raise HTTPException(404, "lembrete não encontrado (ou excluído — restaure antes de editar)")
    row = db.execute(text(f"{_QUERY} WHERE l.id = :id"), {"id": lembrete_id}).mappings().first()
    return LembreteClienteOut(**row)


@router.patch("/lembretes/{lembrete_id}/concluir", response_model=LembreteClienteOut)
def concluir_lembrete(
    lembrete_id: int, db: Session = Depends(get_db), _usuario: UsuarioOut = Depends(get_current_user),
):
    atualizado = db.execute(
        text("""
            UPDATE lembrete_cliente SET concluido = true, concluido_em = now()
            WHERE id = :id AND excluido_em IS NULL AND concluido = false
            RETURNING id
        """),
        {"id": lembrete_id},
    ).mappings().first()
    db.commit()
    if atualizado is None:
        raise HTTPException(404, "lembrete não encontrado (ou já concluído/excluído)")
    row = db.execute(text(f"{_QUERY} WHERE l.id = :id"), {"id": lembrete_id}).mappings().first()
    return LembreteClienteOut(**row)


@router.patch("/lembretes/{lembrete_id}/reabrir", response_model=LembreteClienteOut)
def reabrir_lembrete(
    lembrete_id: int, db: Session = Depends(get_db), _usuario: UsuarioOut = Depends(get_current_user),
):
    atualizado = db.execute(
        text("""
            UPDATE lembrete_cliente SET concluido = false, concluido_em = NULL
            WHERE id = :id AND excluido_em IS NULL AND concluido = true
            RETURNING id
        """),
        {"id": lembrete_id},
    ).mappings().first()
    db.commit()
    if atualizado is None:
        raise HTTPException(404, "lembrete não encontrado (ou não está concluído)")
    row = db.execute(text(f"{_QUERY} WHERE l.id = :id"), {"id": lembrete_id}).mappings().first()
    return LembreteClienteOut(**row)


@router.delete("/lembretes/{lembrete_id}", response_model=LembreteClienteOut)
def excluir_lembrete(
    lembrete_id: int, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user),
):
    atualizado = db.execute(
        text("""
            UPDATE lembrete_cliente SET excluido_em = now(), excluido_por = :quem
            WHERE id = :id AND excluido_em IS NULL
            RETURNING id
        """),
        {"id": lembrete_id, "quem": usuario.nome},
    ).mappings().first()
    db.commit()
    if atualizado is None:
        raise HTTPException(404, "lembrete não encontrado (ou já excluído)")
    row = db.execute(text(f"{_QUERY} WHERE l.id = :id"), {"id": lembrete_id}).mappings().first()
    return LembreteClienteOut(**row)


@router.post("/lembretes/{lembrete_id}/restaurar", response_model=LembreteClienteOut)
def restaurar_lembrete(
    lembrete_id: int, db: Session = Depends(get_db), _usuario: UsuarioOut = Depends(get_current_user),
):
    atualizado = db.execute(
        text("""
            UPDATE lembrete_cliente SET excluido_em = NULL, excluido_por = NULL
            WHERE id = :id AND excluido_em IS NOT NULL
            RETURNING id
        """),
        {"id": lembrete_id},
    ).mappings().first()
    db.commit()
    if atualizado is None:
        raise HTTPException(404, "lembrete não encontrado (ou não está excluído)")
    row = db.execute(text(f"{_QUERY} WHERE l.id = :id"), {"id": lembrete_id}).mappings().first()
    return LembreteClienteOut(**row)
