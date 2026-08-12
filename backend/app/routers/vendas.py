from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..schemas import UsuarioOut, VendaEditarIn, VendaIn, VendaListaOut, VendaObservacoesIn, VendaOut, VendaPagamentoIn

router = APIRouter(prefix="/vendas", tags=["vendas"])
_COLUNAS = (
    "id, client_id, data, cliente_id, vendedor, produto_id, quantidade_un, "
    "quantidade_kg, preco_kg, valor_total, forma_pgto, situacao, data_pagamento, "
    "data_prevista_recebimento, criado_em"
)


@router.get("/vendedores", response_model=list[str])
def listar_vendedores(db: Session = Depends(get_db), _usuario: UsuarioOut = Depends(get_current_user)):
    """Nomes distintos já usados no campo livre 'vendedor' das vendas —
    alimenta o filtro do painel comercial."""
    rows = db.execute(
        text("SELECT DISTINCT vendedor FROM venda WHERE vendedor IS NOT NULL ORDER BY vendedor")
    ).scalars().all()
    return list(rows)


@router.get("", response_model=list[VendaListaOut])
def listar_vendas(
    de: date | None = Query(default=None),
    ate: date | None = Query(default=None),
    situacao: str | None = Query(default=None),
    cliente_id: int | None = Query(default=None),
    vendedor: str | None = Query(default=None),
    excluidos: bool = Query(default=False, description="true = só as excluídas (tela de restaurar)"),
    db: Session = Depends(get_db),
    _usuario: UsuarioOut = Depends(get_current_user),
):
    """Lista vendas para conferência/recebimento — não é o lançamento (esse
    é o POST), é a tela de controle de quais já foram pagas."""
    ate = ate or date.today()
    de = de or (ate - timedelta(days=90))
    rows = db.execute(text(f"""
        SELECT v.id, v.data, v.cliente_id, COALESCE(c.nome, 'Consumidor final') AS cliente_nome,
               c.prazo_dias AS cliente_prazo_dias, v.produto_id, pr.nome AS produto_nome,
               v.quantidade_un, v.quantidade_kg, v.preco_kg, v.valor_total, v.forma_pgto, v.vendedor,
               v.situacao, v.data_pagamento, v.data_prevista_recebimento, v.observacoes,
               v.excluido_em, v.excluido_por
        FROM venda v
        JOIN produto pr ON pr.id = v.produto_id
        LEFT JOIN cliente c ON c.id = v.cliente_id
        WHERE v.data BETWEEN :de AND :ate
          AND {"v.excluido_em IS NOT NULL" if excluidos else "v.excluido_em IS NULL"}
          AND (CAST(:situacao AS text) IS NULL OR v.situacao = :situacao)
          AND (CAST(:cliente_id AS bigint) IS NULL OR v.cliente_id = :cliente_id)
          AND (CAST(:vendedor AS text) IS NULL OR v.vendedor = :vendedor)
        ORDER BY v.data DESC, v.id DESC
    """), {"de": de, "ate": ate, "situacao": situacao, "cliente_id": cliente_id, "vendedor": vendedor}).mappings().all()
    return [VendaListaOut(**r) for r in rows]


@router.post("", response_model=VendaOut, status_code=201)
def criar_venda(body: VendaIn, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user)):
    try:
        row = db.execute(
            text(f"""
                INSERT INTO venda (client_id, data, cliente_id, vendedor, produto_id,
                                    quantidade_un, quantidade_kg, preco_kg, forma_pgto,
                                    situacao, data_pagamento, data_prevista_recebimento, criado_por)
                VALUES (:client_id, :data, :cliente_id, :vendedor, :produto_id,
                        :quantidade_un, :quantidade_kg, :preco_kg, :forma_pgto,
                        :situacao, :data_pagamento, :data_prevista_recebimento, :criado_por)
                ON CONFLICT (client_id) DO NOTHING
                RETURNING {_COLUNAS}
            """),
            {
                **body.model_dump(),
                "situacao": "Pago" if body.a_vista else "Em aberto",
                "data_pagamento": body.data if body.a_vista else None,
                "criado_por": usuario.nome,
            },
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"cliente_id/produto_id inválido ou dado fora das regras: {exc.orig}") from exc

    if row is None:
        row = db.execute(
            text(f"SELECT {_COLUNAS} FROM venda WHERE client_id = :cid"),
            {"cid": str(body.client_id)},
        ).mappings().first()
    return VendaOut(**row)


@router.patch("/{venda_id}/pagamento", response_model=VendaOut)
def atualizar_pagamento(
    venda_id: int, body: VendaPagamentoIn, db: Session = Depends(get_db),
    _usuario: UsuarioOut = Depends(get_current_user),
):
    try:
        row = db.execute(
            text(f"""
                UPDATE venda SET situacao = :situacao, data_pagamento = :data_pagamento,
                                  forma_pgto = COALESCE(:forma_pgto, forma_pgto)
                WHERE id = :id
                RETURNING {_COLUNAS}
            """),
            {"id": venda_id, **body.model_dump()},
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"data de pagamento inválida: {exc.orig}") from exc
    if row is None:
        raise HTTPException(404, "venda não encontrada")
    return VendaOut(**row)


@router.patch("/{venda_id}/observacoes", response_model=VendaOut)
def atualizar_observacoes(
    venda_id: int, body: VendaObservacoesIn, db: Session = Depends(get_db),
    _usuario: UsuarioOut = Depends(get_current_user),
):
    row = db.execute(
        text(f"UPDATE venda SET observacoes = :observacoes WHERE id = :id RETURNING {_COLUNAS}"),
        {"id": venda_id, "observacoes": body.observacoes},
    ).mappings().first()
    db.commit()
    if row is None:
        raise HTTPException(404, "venda não encontrada")
    return VendaOut(**row)


@router.patch("/{venda_id}", response_model=VendaOut)
def editar_venda(
    venda_id: int, body: VendaEditarIn, db: Session = Depends(get_db),
    usuario: UsuarioOut = Depends(get_current_user),
):
    """Corrige uma venda já lançada — data, cliente, produto, quantidade,
    preço, forma ou prazo de recebimento. Não mexe em situação/data de
    pagamento (isso é o PATCH /pagamento, separado, pra não desfazer uma
    baixa já confirmada)."""
    try:
        row = db.execute(
            text(f"""
                UPDATE venda SET data = :data, cliente_id = :cliente_id, vendedor = :vendedor,
                                  produto_id = :produto_id, quantidade_un = :quantidade_un,
                                  quantidade_kg = :quantidade_kg, preco_kg = :preco_kg, forma_pgto = :forma_pgto,
                                  data_prevista_recebimento = :data_prevista_recebimento
                WHERE id = :id AND excluido_em IS NULL
                RETURNING {_COLUNAS}
            """),
            {"id": venda_id, **body.model_dump()},
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"cliente_id/produto_id inválido ou dado fora das regras: {exc.orig}") from exc
    if row is None:
        raise HTTPException(404, "venda não encontrada (ou excluída — restaure antes de editar)")
    return VendaOut(**row)


@router.delete("/{venda_id}", response_model=VendaOut)
def excluir_venda(
    venda_id: int, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user),
):
    """Exclusão reversível — marca excluido_em/excluido_por em vez de
    apagar a linha, pra poder restaurar (POST .../restaurar) se for
    engano."""
    row = db.execute(
        text(f"""
            UPDATE venda SET excluido_em = now(), excluido_por = :quem
            WHERE id = :id AND excluido_em IS NULL
            RETURNING {_COLUNAS}
        """),
        {"id": venda_id, "quem": usuario.nome},
    ).mappings().first()
    db.commit()
    if row is None:
        raise HTTPException(404, "venda não encontrada (ou já excluída)")
    return VendaOut(**row)


@router.post("/{venda_id}/restaurar", response_model=VendaOut)
def restaurar_venda(
    venda_id: int, db: Session = Depends(get_db), _usuario: UsuarioOut = Depends(get_current_user),
):
    row = db.execute(
        text(f"""
            UPDATE venda SET excluido_em = NULL, excluido_por = NULL
            WHERE id = :id AND excluido_em IS NOT NULL
            RETURNING {_COLUNAS}
        """),
        {"id": venda_id},
    ).mappings().first()
    db.commit()
    if row is None:
        raise HTTPException(404, "venda não encontrada (ou não está excluída)")
    return VendaOut(**row)
