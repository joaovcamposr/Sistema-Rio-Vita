from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..schemas import (
    AcertoDiferencaOut,
    AcertoIn,
    AcertoOut,
    ExpedicaoIn,
    ExpedicaoItemOut,
    ExpedicaoOut,
    UsuarioOut,
)

router = APIRouter(prefix="/expedicoes", tags=["expedicoes"])


def _carregar_expedicao(db: Session, expedicao_id: int) -> ExpedicaoOut:
    cab = db.execute(text("""
        SELECT e.id, e.vendedor_id, v.nome AS vendedor_nome, e.data_saida, e.data_acerto
        FROM expedicao e JOIN vendedor v ON v.id = e.vendedor_id
        WHERE e.id = :id
    """), {"id": expedicao_id}).mappings().first()
    if cab is None:
        raise HTTPException(404, "expedição não encontrada")
    itens = db.execute(text("""
        SELECT ei.produto_id, p.nome AS produto_nome, ei.quantidade_kg
        FROM expedicao_item ei JOIN produto p ON p.id = ei.produto_id
        WHERE ei.expedicao_id = :id ORDER BY p.nome
    """), {"id": expedicao_id}).mappings().all()
    return ExpedicaoOut(
        id=cab["id"], vendedor_id=cab["vendedor_id"], vendedor_nome=cab["vendedor_nome"],
        data_saida=cab["data_saida"], data_acerto=cab["data_acerto"],
        itens=[ExpedicaoItemOut(produto_id=i["produto_id"], produto_nome=i["produto_nome"],
                                 quantidade_kg=float(i["quantidade_kg"])) for i in itens],
    )


@router.get("/abertas", response_model=list[ExpedicaoOut])
def listar_abertas(db: Session = Depends(get_db)):
    ids = db.execute(text(
        "SELECT id FROM expedicao WHERE data_acerto IS NULL ORDER BY data_saida"
    )).mappings().all()
    return [_carregar_expedicao(db, r["id"]) for r in ids]


@router.post("", response_model=ExpedicaoOut, status_code=201)
def criar_expedicao(
    body: ExpedicaoIn, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user),
):
    try:
        row = db.execute(text("""
            INSERT INTO expedicao (client_id, vendedor_id, data_saida, observacao, criado_por)
            VALUES (:client_id, :vendedor_id, :data_saida, :observacao, :criado_por)
            ON CONFLICT (client_id) DO NOTHING
            RETURNING id
        """), {
            "client_id": str(body.client_id), "vendedor_id": body.vendedor_id,
            "data_saida": body.data_saida, "observacao": body.observacao, "criado_por": usuario.nome,
        }).mappings().first()

        if row is not None:
            for item in body.itens:
                db.execute(text("""
                    INSERT INTO expedicao_item (expedicao_id, produto_id, quantidade_embalagens, quantidade_kg)
                    VALUES (:expedicao_id, :produto_id, :quantidade_embalagens, :quantidade_kg)
                """), {
                    "expedicao_id": row["id"], "produto_id": item.produto_id,
                    "quantidade_embalagens": item.quantidade_embalagens,
                    "quantidade_kg": item.quantidade_kg or 0,
                })
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"dado inválido, ou este vendedor já tem uma expedição em aberto: {exc.orig}") from exc

    if row is None:
        row = db.execute(
            text("SELECT id FROM expedicao WHERE client_id = :cid"), {"cid": str(body.client_id)}
        ).mappings().first()
    return _carregar_expedicao(db, row["id"])


@router.get("/{expedicao_id}", response_model=ExpedicaoOut)
def obter_expedicao(expedicao_id: int, db: Session = Depends(get_db)):
    return _carregar_expedicao(db, expedicao_id)


@router.post("/{expedicao_id}/acerto", response_model=AcertoOut)
def acertar_expedicao(
    expedicao_id: int, body: AcertoIn, db: Session = Depends(get_db),
    usuario: UsuarioOut = Depends(get_current_user),
):
    atual = db.execute(
        text("SELECT id, data_acerto, acerto_client_id FROM expedicao WHERE id = :id"),
        {"id": expedicao_id},
    ).mappings().first()
    if atual is None:
        raise HTTPException(404, "expedição não encontrada")

    ja_processado = str(atual["acerto_client_id"]) == str(body.client_id)
    if atual["data_acerto"] is not None and not ja_processado:
        raise HTTPException(422, f"expedição já foi acertada em {atual['data_acerto']}")

    if not ja_processado:
        vendedor_nome = db.execute(text("""
            SELECT vd.nome FROM expedicao e JOIN vendedor vd ON vd.id = e.vendedor_id WHERE e.id = :id
        """), {"id": expedicao_id}).scalar_one()

        try:
            for v in body.vendas:
                db.execute(text("""
                    INSERT INTO venda (data, cliente_id, vendedor, produto_id, quantidade_un, quantidade_kg,
                                        preco_kg, forma_pgto, expedicao_id, prazo_dias, emite_nf, emite_boleto,
                                        criado_por)
                    VALUES (:data, :cliente_id, :vendedor, :produto_id, :quantidade_un, :quantidade_kg,
                            :preco_kg, :forma_pgto, :expedicao_id, :prazo_dias, :emite_nf, :emite_boleto,
                            :criado_por)
                """), {
                    "data": body.data_acerto, "expedicao_id": expedicao_id, "vendedor": vendedor_nome,
                    "criado_por": usuario.nome, **v.model_dump(),
                })
            for r in body.retornos:
                db.execute(text("""
                    INSERT INTO expedicao_retorno (expedicao_id, produto_id, quantidade_embalagens, quantidade_kg)
                    VALUES (:expedicao_id, :produto_id, :quantidade_embalagens, :quantidade_kg)
                """), {
                    "expedicao_id": expedicao_id, "produto_id": r.produto_id,
                    "quantidade_embalagens": r.quantidade_embalagens,
                    "quantidade_kg": r.quantidade_kg or 0,
                })
            for d in body.despesas:
                db.execute(text("""
                    INSERT INTO despesa (data, categoria, valor, forma_pgto, expedicao_id, observacao, criado_por)
                    VALUES (:data, :categoria, :valor, :forma_pgto, :expedicao_id, :observacao, :criado_por)
                """), {
                    "data": body.data_acerto, "expedicao_id": expedicao_id,
                    "criado_por": usuario.nome, **d.model_dump(),
                })

            db.execute(text("""
                UPDATE expedicao SET data_acerto = :data_acerto, acerto_client_id = :cid WHERE id = :id
            """), {"data_acerto": body.data_acerto, "cid": str(body.client_id), "id": expedicao_id})
            db.commit()
        except DBAPIError as exc:
            db.rollback()
            raise HTTPException(422, f"dado inválido no acerto: {exc.orig}") from exc

    diferencas = db.execute(text("""
        SELECT ei.produto_id, p.nome AS produto_nome, ei.quantidade_kg AS expedida,
               COALESCE(v.kg, 0) AS vendida, COALESCE(r.kg, 0) AS retornada
        FROM expedicao_item ei
        JOIN produto p ON p.id = ei.produto_id
        LEFT JOIN (
          SELECT produto_id, SUM(quantidade_kg) AS kg FROM venda
          WHERE expedicao_id = :id GROUP BY produto_id
        ) v ON v.produto_id = ei.produto_id
        LEFT JOIN (
          SELECT produto_id, SUM(quantidade_kg) AS kg FROM expedicao_retorno
          WHERE expedicao_id = :id GROUP BY produto_id
        ) r ON r.produto_id = ei.produto_id
        WHERE ei.expedicao_id = :id
        ORDER BY p.nome
    """), {"id": expedicao_id}).mappings().all()

    totais = db.execute(text("""
        SELECT
          COALESCE((SELECT SUM(valor_total) FROM venda WHERE expedicao_id = :id AND forma_pgto = 'Dinheiro'), 0)
            AS vendas_dinheiro,
          COALESCE((SELECT SUM(valor) FROM despesa WHERE expedicao_id = :id AND forma_pgto = 'Dinheiro'), 0)
            AS despesas_dinheiro
    """), {"id": expedicao_id}).mappings().first()

    vendas_dinheiro = float(totais["vendas_dinheiro"])
    despesas_dinheiro = float(totais["despesas_dinheiro"])

    return AcertoOut(
        expedicao_id=expedicao_id,
        total_vendas_dinheiro=vendas_dinheiro,
        total_despesas_dinheiro=despesas_dinheiro,
        total_esperado_dinheiro=vendas_dinheiro - despesas_dinheiro,
        diferencas=[
            AcertoDiferencaOut(
                produto_id=d["produto_id"], produto_nome=d["produto_nome"],
                quantidade_expedida_kg=float(d["expedida"]), quantidade_vendida_kg=float(d["vendida"]),
                quantidade_retornada_kg=float(d["retornada"]),
                diferenca_kg=float(d["expedida"]) - float(d["vendida"]) - float(d["retornada"]),
            )
            for d in diferencas
        ],
    )
