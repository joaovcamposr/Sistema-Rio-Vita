from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas import (
    ClienteDetalheOut,
    ClienteIn,
    ClienteOut,
    ClienteProdutoPrecoIn,
    ClienteProdutoPrecoOut,
)

router = APIRouter(prefix="/clientes", tags=["clientes"])

_COLUNAS_DETALHE = (
    "c.id, c.nome, c.cnpj, c.contato, c.cidade, c.prazo_dias, c.emite_nf, c.emite_boleto, "
    "c.vendedor_id, vd.nome AS vendedor_nome"
)
_FROM_DETALHE = "FROM cliente c LEFT JOIN vendedor vd ON vd.id = c.vendedor_id"


@router.get("", response_model=list[ClienteOut])
def listar_clientes(db: Session = Depends(get_db)):
    rows = db.execute(text(f"""
        SELECT c.id, c.nome, c.cidade, c.prazo_dias, c.emite_nf, c.emite_boleto,
               c.vendedor_id, vd.nome AS vendedor_nome
        {_FROM_DETALHE}
        WHERE c.ativo ORDER BY c.nome
    """)).mappings().all()
    return [ClienteOut(**r) for r in rows]


@router.post("", response_model=ClienteDetalheOut, status_code=201)
def criar_cliente(body: ClienteIn, db: Session = Depends(get_db)):
    try:
        novo_id = db.execute(
            text("""
                INSERT INTO cliente (nome, cnpj, contato, cidade, prazo_dias, emite_nf, emite_boleto, vendedor_id)
                VALUES (:nome, :cnpj, :contato, :cidade, :prazo_dias, :emite_nf, :emite_boleto, :vendedor_id)
                RETURNING id
            """),
            body.model_dump(),
        ).scalar_one()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"vendedor_id inválido: {exc.orig}") from exc
    row = db.execute(text(f"SELECT {_COLUNAS_DETALHE} {_FROM_DETALHE} WHERE c.id = :id"), {"id": novo_id}).mappings().first()
    return ClienteDetalheOut(**row)


@router.get("/{cliente_id}", response_model=ClienteDetalheOut)
def obter_cliente(cliente_id: int, db: Session = Depends(get_db)):
    row = db.execute(
        text(f"SELECT {_COLUNAS_DETALHE} {_FROM_DETALHE} WHERE c.id = :id"), {"id": cliente_id}
    ).mappings().first()
    if row is None:
        raise HTTPException(404, "cliente não encontrado")
    return ClienteDetalheOut(**row)


@router.put("/{cliente_id}", response_model=ClienteDetalheOut)
def atualizar_cliente(cliente_id: int, body: ClienteIn, db: Session = Depends(get_db)):
    try:
        row = db.execute(
            text("""
                UPDATE cliente SET nome = :nome, cnpj = :cnpj, contato = :contato, cidade = :cidade,
                       prazo_dias = :prazo_dias, emite_nf = :emite_nf, emite_boleto = :emite_boleto,
                       vendedor_id = :vendedor_id
                WHERE id = :id
                RETURNING id
            """),
            {**body.model_dump(), "id": cliente_id},
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"vendedor_id inválido: {exc.orig}") from exc
    if row is None:
        raise HTTPException(404, "cliente não encontrado")
    atualizado = db.execute(text(f"SELECT {_COLUNAS_DETALHE} {_FROM_DETALHE} WHERE c.id = :id"), {"id": cliente_id}).mappings().first()
    return ClienteDetalheOut(**atualizado)


@router.delete("/{cliente_id}", status_code=204)
def excluir_cliente(cliente_id: int, db: Session = Depends(get_db)):
    """Soft-delete: preserva o histórico de vendas já ligado a este cliente
    — só inativa e ele some das listagens/seletores."""
    row = db.execute(
        text("UPDATE cliente SET ativo = false WHERE id = :id RETURNING id"), {"id": cliente_id}
    ).mappings().first()
    db.commit()
    if row is None:
        raise HTTPException(404, "cliente não encontrado")


@router.get("/{cliente_id}/precos", response_model=list[ClienteProdutoPrecoOut])
def listar_precos_cliente(cliente_id: int, db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT p.id AS produto_id, p.nome AS produto_nome, cp.preco
        FROM produto p
        LEFT JOIN cliente_produto_preco cp ON cp.produto_id = p.id AND cp.cliente_id = :cid
        WHERE p.ativo
        ORDER BY p.nome
    """), {"cid": cliente_id}).mappings().all()
    return [
        ClienteProdutoPrecoOut(produto_id=r["produto_id"], produto_nome=r["produto_nome"],
                                preco=float(r["preco"]) if r["preco"] is not None else 0.0)
        for r in rows
    ]


@router.put("/{cliente_id}/precos", response_model=list[ClienteProdutoPrecoOut])
def definir_preco_cliente(cliente_id: int, body: ClienteProdutoPrecoIn, db: Session = Depends(get_db)):
    try:
        db.execute(text("""
            INSERT INTO cliente_produto_preco (cliente_id, produto_id, preco)
            VALUES (:cliente_id, :produto_id, :preco)
            ON CONFLICT (cliente_id, produto_id) DO UPDATE SET preco = EXCLUDED.preco
        """), {"cliente_id": cliente_id, **body.model_dump()})
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"cliente_id/produto_id inválido: {exc.orig}") from exc
    return listar_precos_cliente(cliente_id, db)
