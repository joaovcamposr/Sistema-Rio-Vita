from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..schemas import (
    UsuarioOut, VendaEditarIn, VendaIn, VendaListaOut, VendaObservacoesIn, VendaOut,
    VendaParcelaOut, VendaParcelaPagamentoIn,
)

router = APIRouter(prefix="/vendas", tags=["vendas"])


def _listar_parcelas(db: Session, venda_id: int) -> list[VendaParcelaOut]:
    rows = db.execute(text("""
        SELECT id, numero, valor, forma_pgto, data_prevista, data_pagamento
        FROM venda_parcela WHERE venda_id = :id AND excluido_em IS NULL ORDER BY numero
    """), {"id": venda_id}).mappings().all()
    return [VendaParcelaOut(**r) for r in rows]


def _buscar_venda_out(db: Session, venda_id: int) -> VendaOut | None:
    row = db.execute(text("""
        SELECT v.id, v.client_id, v.data, v.cliente_id, v.vendedor, v.produto_id,
               v.quantidade_un, v.quantidade_kg, v.preco_kg, v.valor_total,
               p.situacao, p.valor_recebido, p.valor_pendente, p.proxima_data_prevista,
               v.criado_em
        FROM venda v JOIN vw_venda_pagamento p ON p.venda_id = v.id
        WHERE v.id = :id
    """), {"id": venda_id}).mappings().first()
    if row is None:
        return None
    return VendaOut(**row, parcelas=_listar_parcelas(db, venda_id))


def _renumerar_parcelas(db: Session, venda_id: int) -> None:
    """Reordena numero por data_prevista sem colidir com a UNIQUE
    (venda_id, numero) no meio do caminho — passa primeiro por uma faixa
    alta, só depois assume o número final."""
    rows = db.execute(
        text("SELECT id FROM venda_parcela WHERE venda_id = :id AND excluido_em IS NULL ORDER BY data_prevista, id"),
        {"id": venda_id},
    ).mappings().all()
    for i, r in enumerate(rows, start=1):
        db.execute(text("UPDATE venda_parcela SET numero = :n WHERE id = :id"), {"n": 1000 + i, "id": r["id"]})
    for i, r in enumerate(rows, start=1):
        db.execute(text("UPDATE venda_parcela SET numero = :n WHERE id = :id"), {"n": i, "id": r["id"]})


@router.get("/vendedores", response_model=list[str])
def listar_vendedores(db: Session = Depends(get_db), _usuario: UsuarioOut = Depends(get_current_user)):
    """Nomes distintos já usados no campo livre 'vendedor' das vendas —
    alimenta o filtro do painel comercial."""
    rows = db.execute(
        text("SELECT DISTINCT vendedor FROM venda WHERE vendedor IS NOT NULL ORDER BY vendedor")
    ).scalars().all()
    return list(rows)


_COLUNAS_LISTA = """
    v.id, v.data, v.cliente_id, COALESCE(c.nome, 'Consumidor final') AS cliente_nome,
    c.prazo_dias AS cliente_prazo_dias, v.produto_id, pr.nome AS produto_nome,
    v.quantidade_un, v.quantidade_kg, v.preco_kg, v.valor_total, v.vendedor,
    p.situacao, p.valor_recebido, p.valor_pendente, p.proxima_data_prevista,
    v.observacoes, v.excluido_em, v.excluido_por
"""
_FROM_LISTA = """
    FROM venda v
    JOIN produto pr ON pr.id = v.produto_id
    LEFT JOIN cliente c ON c.id = v.cliente_id
    JOIN vw_venda_pagamento p ON p.venda_id = v.id
"""


def _montar_lista(db: Session, rows) -> list[VendaListaOut]:
    out = []
    for r in rows:
        out.append(VendaListaOut(**r, parcelas=_listar_parcelas(db, r["id"])))
    return out


@router.get("", response_model=list[VendaListaOut])
def listar_vendas(
    de: date | None = Query(default=None),
    ate: date | None = Query(default=None),
    situacao: str | None = Query(default=None),
    cliente_id: int | None = Query(default=None),
    vendedor: str | None = Query(default=None),
    excluidos: bool = Query(default=False, description="true = só as excluídas (tela de restaurar)"),
    id: int | None = Query(default=None, description="quando informado, ignora os demais filtros — busca só essa venda (atalho de edição vindo de outra tela)"),
    db: Session = Depends(get_db),
    _usuario: UsuarioOut = Depends(get_current_user),
):
    """Lista vendas para conferência/recebimento — não é o lançamento (esse
    é o POST), é a tela de controle de quais já foram pagas. Situação e
    valores recebido/pendente vêm de vw_venda_pagamento (soma das
    parcelas), não são mais campo direto da venda."""
    if id is not None:
        rows = db.execute(
            text(f"SELECT {_COLUNAS_LISTA} {_FROM_LISTA} WHERE v.id = :id"), {"id": id}
        ).mappings().all()
        return _montar_lista(db, rows)

    ate = ate or date.today()
    de = de or (ate - timedelta(days=90))
    rows = db.execute(text(f"""
        SELECT {_COLUNAS_LISTA}
        {_FROM_LISTA}
        WHERE v.data BETWEEN :de AND :ate
          AND {"v.excluido_em IS NOT NULL" if excluidos else "v.excluido_em IS NULL"}
          AND (
                CAST(:situacao AS text) IS NULL
                -- "Em aberto" na tela = ainda tem dinheiro a receber (inclui
                -- 'Parcial'); venda de valor zero não tem nada a receber
                OR (CAST(:situacao AS text) = 'Em aberto' AND p.situacao <> 'Pago' AND p.valor_pendente > 0)
                OR (CAST(:situacao AS text) <> 'Em aberto' AND p.situacao = CAST(:situacao AS text))
              )
          AND (CAST(:cliente_id AS bigint) IS NULL OR v.cliente_id = :cliente_id)
          AND (CAST(:vendedor AS text) IS NULL OR v.vendedor = :vendedor)
        ORDER BY v.data DESC, v.id DESC
    """), {"de": de, "ate": ate, "situacao": situacao, "cliente_id": cliente_id, "vendedor": vendedor}).mappings().all()
    return _montar_lista(db, rows)


@router.post("", response_model=VendaOut, status_code=201)
def criar_venda(body: VendaIn, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user)):
    try:
        row = db.execute(
            text("""
                INSERT INTO venda (client_id, data, cliente_id, vendedor, produto_id,
                                    quantidade_un, quantidade_kg, preco_kg, criado_por)
                VALUES (:client_id, :data, :cliente_id, :vendedor, :produto_id,
                        :quantidade_un, :quantidade_kg, :preco_kg, :criado_por)
                ON CONFLICT (client_id) DO NOTHING
                RETURNING id
            """),
            {
                "client_id": body.client_id, "data": body.data, "cliente_id": body.cliente_id,
                "vendedor": body.vendedor, "produto_id": body.produto_id,
                "quantidade_un": body.quantidade_un, "quantidade_kg": body.quantidade_kg,
                "preco_kg": body.preco_kg, "criado_por": usuario.nome,
            },
        ).mappings().first()
        if row is not None:
            for i, p in enumerate(body.parcelas, start=1):
                db.execute(
                    text("""
                        INSERT INTO venda_parcela (venda_id, numero, valor, forma_pgto, data_prevista, data_pagamento, criado_por)
                        VALUES (:venda_id, :numero, :valor, :forma_pgto, :data_prevista, :data_pagamento, :criado_por)
                    """),
                    {"venda_id": row["id"], "numero": i, "criado_por": usuario.nome, **p.model_dump(exclude={"id"})},
                )
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"cliente_id/produto_id inválido ou dado fora das regras: {exc.orig}") from exc

    venda_id = row["id"] if row is not None else db.execute(
        text("SELECT id FROM venda WHERE client_id = :cid"), {"cid": str(body.client_id)},
    ).scalar()
    venda_out = _buscar_venda_out(db, venda_id)
    if venda_out is None:
        raise HTTPException(500, "venda criada mas não encontrada ao reler")
    return venda_out


@router.patch("/{venda_id}/parcelas/{parcela_id}/pagamento", response_model=VendaOut)
def atualizar_pagamento_parcela(
    venda_id: int, parcela_id: int, body: VendaParcelaPagamentoIn, db: Session = Depends(get_db),
    _usuario: UsuarioOut = Depends(get_current_user),
):
    """Marca uma parcela como paga (ou reverte, mandando data_pagamento
    null) — o atalho rápido de um clique em Recebimentos. Pra mudar
    valor/forma/data de uma parcela, usa o PATCH /{venda_id} (edição
    completa)."""
    try:
        row = db.execute(
            text("""
                UPDATE venda_parcela SET data_pagamento = :data_pagamento,
                                          forma_pgto = COALESCE(:forma_pgto, forma_pgto)
                WHERE id = :parcela_id AND venda_id = :venda_id AND excluido_em IS NULL
                RETURNING id
            """),
            {"parcela_id": parcela_id, "venda_id": venda_id, **body.model_dump()},
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"data de pagamento inválida: {exc.orig}") from exc
    if row is None:
        raise HTTPException(404, "parcela não encontrada (ou excluída)")
    venda_out = _buscar_venda_out(db, venda_id)
    if venda_out is None:
        raise HTTPException(404, "venda não encontrada")
    return venda_out


@router.patch("/{venda_id}/observacoes", response_model=VendaOut)
def atualizar_observacoes(
    venda_id: int, body: VendaObservacoesIn, db: Session = Depends(get_db),
    _usuario: UsuarioOut = Depends(get_current_user),
):
    row = db.execute(
        text("UPDATE venda SET observacoes = :observacoes WHERE id = :id RETURNING id"),
        {"id": venda_id, "observacoes": body.observacoes},
    ).mappings().first()
    db.commit()
    if row is None:
        raise HTTPException(404, "venda não encontrada")
    venda_out = _buscar_venda_out(db, venda_id)
    if venda_out is None:
        raise HTTPException(404, "venda não encontrada")
    return venda_out


@router.patch("/{venda_id}", response_model=VendaOut)
def editar_venda(
    venda_id: int, body: VendaEditarIn, db: Session = Depends(get_db),
    usuario: UsuarioOut = Depends(get_current_user),
):
    """Corrige qualquer campo de uma venda já lançada — data, cliente,
    produto, quantidade, preço e as parcelas (valor/forma/data de cada
    uma; parcela com id=null é nova, parcela existente não reenviada é
    excluída). Se quantidade ou preço mudam, o novo valor_total pode não
    bater mais com a soma das parcelas enviadas — a diferença é
    absorvida pela parcela em aberto (sem data_pagamento) com a data
    prevista mais distante; se não sobrar nenhuma parcela aberta pra
    absorver, a edição é recusada (ajuste as parcelas na mão antes).
    'Marcar como pago' (PATCH .../parcelas/{id}/pagamento) continua
    existindo como atalho rápido pro caso comum."""
    novo_total = round(body.quantidade_kg * body.preco_kg, 2)
    parcelas = list(body.parcelas)
    soma = round(sum(p.valor for p in parcelas), 2)
    diferenca = round(novo_total - soma, 2)
    if abs(diferenca) > 0.01:
        abertas = [p for p in parcelas if p.data_pagamento is None]
        if not abertas:
            raise HTTPException(
                400,
                f"o novo valor da venda (R$ {novo_total:.2f}) não bate com a soma das parcelas "
                f"(R$ {soma:.2f}) e todas já estão pagas — ajuste as parcelas antes de mudar quantidade/preço.",
            )
        alvo = max(abertas, key=lambda p: p.data_prevista)
        idx = parcelas.index(alvo)
        novo_valor = round(alvo.valor + diferenca, 2)
        if novo_valor <= 0:
            raise HTTPException(
                400,
                f"a diferença (R$ {diferenca:.2f}) é maior do que a última parcela em aberto "
                f"(R$ {alvo.valor:.2f}) consegue absorver — ajuste as parcelas manualmente antes de mudar quantidade/preço.",
            )
        parcelas[idx] = alvo.model_copy(update={"valor": novo_valor})

    try:
        row = db.execute(
            text("""
                UPDATE venda SET data = :data, cliente_id = :cliente_id, vendedor = :vendedor,
                                  produto_id = :produto_id, quantidade_un = :quantidade_un,
                                  quantidade_kg = :quantidade_kg, preco_kg = :preco_kg
                WHERE id = :id AND excluido_em IS NULL
                RETURNING id
            """),
            {
                "id": venda_id, "data": body.data, "cliente_id": body.cliente_id, "vendedor": body.vendedor,
                "produto_id": body.produto_id, "quantidade_un": body.quantidade_un,
                "quantidade_kg": body.quantidade_kg, "preco_kg": body.preco_kg,
            },
        ).mappings().first()
        if row is None:
            db.rollback()
            raise HTTPException(404, "venda não encontrada (ou excluída — restaure antes de editar)")

        enviados_ids = {p.id for p in parcelas if p.id is not None}
        existentes = db.execute(
            text("SELECT id FROM venda_parcela WHERE venda_id = :id AND excluido_em IS NULL"),
            {"id": venda_id},
        ).mappings().all()
        for r in existentes:
            if r["id"] not in enviados_ids:
                db.execute(
                    text("UPDATE venda_parcela SET excluido_em = now(), excluido_por = :quem WHERE id = :id"),
                    {"id": r["id"], "quem": usuario.nome},
                )
        novas = [p for p in parcelas if p.id is None]
        for i, p in enumerate(novas):
            db.execute(
                text("""
                    INSERT INTO venda_parcela (venda_id, numero, valor, forma_pgto, data_prevista, data_pagamento, criado_por)
                    VALUES (:venda_id, :numero, :valor, :forma_pgto, :data_prevista, :data_pagamento, :criado_por)
                """),
                {"venda_id": venda_id, "numero": 2000 + i, "criado_por": usuario.nome, **p.model_dump(exclude={"id"})},
            )
        for p in parcelas:
            if p.id is not None:
                db.execute(
                    text("""
                        UPDATE venda_parcela SET valor = :valor, forma_pgto = :forma_pgto,
                                                  data_prevista = :data_prevista, data_pagamento = :data_pagamento
                        WHERE id = :id AND venda_id = :venda_id AND excluido_em IS NULL
                    """),
                    {"id": p.id, "venda_id": venda_id, **p.model_dump(exclude={"id"})},
                )
        _renumerar_parcelas(db, venda_id)
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"cliente_id/produto_id inválido ou dado fora das regras: {exc.orig}") from exc

    venda_out = _buscar_venda_out(db, venda_id)
    if venda_out is None:
        raise HTTPException(404, "venda não encontrada")
    return venda_out


@router.delete("/{venda_id}", response_model=VendaOut)
def excluir_venda(
    venda_id: int, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user),
):
    """Exclusão reversível — marca excluido_em/excluido_por em vez de
    apagar a linha, pra poder restaurar (POST .../restaurar) se for
    engano. As parcelas continuam como estavam (não são excluídas junto)
    — se a venda for restaurada, as parcelas voltam a valer."""
    row = db.execute(
        text("""
            UPDATE venda SET excluido_em = now(), excluido_por = :quem
            WHERE id = :id AND excluido_em IS NULL
            RETURNING id
        """),
        {"id": venda_id, "quem": usuario.nome},
    ).mappings().first()
    db.commit()
    if row is None:
        raise HTTPException(404, "venda não encontrada (ou já excluída)")
    venda_out = _buscar_venda_out(db, venda_id)
    if venda_out is None:
        raise HTTPException(404, "venda não encontrada")
    return venda_out


@router.post("/{venda_id}/restaurar", response_model=VendaOut)
def restaurar_venda(
    venda_id: int, db: Session = Depends(get_db), _usuario: UsuarioOut = Depends(get_current_user),
):
    row = db.execute(
        text("""
            UPDATE venda SET excluido_em = NULL, excluido_por = NULL
            WHERE id = :id AND excluido_em IS NOT NULL
            RETURNING id
        """),
        {"id": venda_id},
    ).mappings().first()
    db.commit()
    if row is None:
        raise HTTPException(404, "venda não encontrada (ou não está excluída)")
    venda_out = _buscar_venda_out(db, venda_id)
    if venda_out is None:
        raise HTTPException(404, "venda não encontrada")
    return venda_out
