from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..schemas import (
    ChegadaRacaoIn,
    ChegadaRacaoItemOut,
    ChegadaRacaoOut,
    FornecedorRacaoDetalheOut,
    FornecedorRacaoIn,
    TipoRacaoIn,
    TipoRacaoOut,
    UsuarioOut,
)

router = APIRouter(tags=["racao"])


@router.get("/fornecedores-racao", response_model=list[FornecedorRacaoDetalheOut])
def listar_fornecedores_racao(db: Session = Depends(get_db)):
    fornecedores = db.execute(
        text("SELECT id, nome FROM fornecedor_racao WHERE ativo ORDER BY nome")
    ).mappings().all()
    tipos = db.execute(
        text("SELECT id, fornecedor_id, codigo FROM tipo_racao WHERE ativo ORDER BY codigo")
    ).mappings().all()
    tipos_por_fornecedor: dict[int, list[TipoRacaoOut]] = {}
    for t in tipos:
        tipos_por_fornecedor.setdefault(t["fornecedor_id"], []).append(TipoRacaoOut(**t))
    return [
        FornecedorRacaoDetalheOut(id=f["id"], nome=f["nome"], tipos=tipos_por_fornecedor.get(f["id"], []))
        for f in fornecedores
    ]


@router.post("/fornecedores-racao", response_model=FornecedorRacaoDetalheOut, status_code=201)
def criar_fornecedor_racao(body: FornecedorRacaoIn, db: Session = Depends(get_db)):
    try:
        row = db.execute(
            text("INSERT INTO fornecedor_racao (nome) VALUES (:nome) RETURNING id, nome"), body.model_dump()
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, "já existe um fornecedor com esse nome") from exc
    return FornecedorRacaoDetalheOut(id=row["id"], nome=row["nome"], tipos=[])


@router.delete("/fornecedores-racao/{fornecedor_id}", status_code=204)
def excluir_fornecedor_racao(fornecedor_id: int, db: Session = Depends(get_db)):
    """Soft-delete: preserva o histórico de chegadas já lançadas — só
    inativa, e ele some do cadastro e dos seletores."""
    row = db.execute(
        text("UPDATE fornecedor_racao SET ativo = false WHERE id = :id RETURNING id"), {"id": fornecedor_id}
    ).mappings().first()
    db.commit()
    if row is None:
        raise HTTPException(404, "fornecedor não encontrado")


@router.post("/fornecedores-racao/{fornecedor_id}/tipos", response_model=TipoRacaoOut, status_code=201)
def criar_tipo_racao(fornecedor_id: int, body: TipoRacaoIn, db: Session = Depends(get_db)):
    fornecedor = db.execute(
        text("SELECT id FROM fornecedor_racao WHERE id = :id AND ativo"), {"id": fornecedor_id}
    ).mappings().first()
    if fornecedor is None:
        raise HTTPException(422, "fornecedor_id inválido")
    try:
        row = db.execute(
            text("""
                INSERT INTO tipo_racao (fornecedor_id, codigo) VALUES (:fornecedor_id, :codigo)
                RETURNING id, fornecedor_id, codigo
            """),
            {"fornecedor_id": fornecedor_id, "codigo": body.codigo},
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, "esse fornecedor já tem um tipo com esse código") from exc
    return TipoRacaoOut(**row)


@router.patch("/fornecedores-racao/{fornecedor_id}/tipos/{tipo_id}", response_model=TipoRacaoOut)
def atualizar_tipo_racao(fornecedor_id: int, tipo_id: int, body: TipoRacaoIn, db: Session = Depends(get_db)):
    try:
        row = db.execute(
            text("""
                UPDATE tipo_racao SET codigo = :codigo
                WHERE id = :id AND fornecedor_id = :fornecedor_id
                RETURNING id, fornecedor_id, codigo
            """),
            {"codigo": body.codigo, "id": tipo_id, "fornecedor_id": fornecedor_id},
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, "esse fornecedor já tem um tipo com esse código") from exc
    if row is None:
        raise HTTPException(404, "tipo não encontrado para esse fornecedor")
    return TipoRacaoOut(**row)


@router.delete("/fornecedores-racao/{fornecedor_id}/tipos/{tipo_id}", status_code=204)
def excluir_tipo_racao(fornecedor_id: int, tipo_id: int, db: Session = Depends(get_db)):
    """Soft-delete: preserva o histórico de chegadas/arraçoamento já
    lançados com esse tipo."""
    row = db.execute(
        text("""
            UPDATE tipo_racao SET ativo = false
            WHERE id = :id AND fornecedor_id = :fornecedor_id
            RETURNING id
        """),
        {"id": tipo_id, "fornecedor_id": fornecedor_id},
    ).mappings().first()
    db.commit()
    if row is None:
        raise HTTPException(404, "tipo não encontrado para esse fornecedor")


@router.get("/chegadas-racao", response_model=list[ChegadaRacaoOut])
def listar_chegadas_racao(
    de: date | None = None, ate: date | None = None, db: Session = Depends(get_db),
):
    ate = ate or date.today()
    de = de or ate.replace(year=ate.year - 1)
    chegadas = db.execute(
        text("""
            SELECT c.id, c.data, c.fornecedor_id, f.nome AS fornecedor_nome, c.observacao
            FROM chegada_racao c JOIN fornecedor_racao f ON f.id = c.fornecedor_id
            WHERE c.data BETWEEN :de AND :ate
            ORDER BY c.data DESC, c.id DESC
        """),
        {"de": de, "ate": ate},
    ).mappings().all()
    itens = db.execute(
        text("""
            SELECT i.chegada_id, i.tipo_racao_id, t.codigo AS tipo_racao_codigo, i.quantidade_sacos
            FROM chegada_racao_item i JOIN tipo_racao t ON t.id = i.tipo_racao_id
        """)
    ).mappings().all()
    itens_por_chegada: dict[int, list[ChegadaRacaoItemOut]] = {}
    for i in itens:
        itens_por_chegada.setdefault(i["chegada_id"], []).append(
            ChegadaRacaoItemOut(
                tipo_racao_id=i["tipo_racao_id"], tipo_racao_codigo=i["tipo_racao_codigo"],
                quantidade_sacos=float(i["quantidade_sacos"]),
            )
        )
    return [
        ChegadaRacaoOut(
            id=c["id"], data=c["data"], fornecedor_id=c["fornecedor_id"], fornecedor_nome=c["fornecedor_nome"],
            observacao=c["observacao"], itens=itens_por_chegada.get(c["id"], []),
        )
        for c in chegadas
    ]


@router.post("/chegadas-racao", response_model=ChegadaRacaoOut, status_code=201)
def criar_chegada_racao(
    body: ChegadaRacaoIn, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user),
):
    existente = db.execute(
        text("SELECT id FROM chegada_racao WHERE client_id = :cid"), {"cid": str(body.client_id)}
    ).mappings().first()
    if existente is None:
        try:
            nova = db.execute(
                text("""
                    INSERT INTO chegada_racao (client_id, data, fornecedor_id, observacao, criado_por)
                    VALUES (:client_id, :data, :fornecedor_id, :observacao, :criado_por)
                    RETURNING id
                """),
                {
                    "client_id": str(body.client_id), "data": body.data, "fornecedor_id": body.fornecedor_id,
                    "observacao": body.observacao, "criado_por": usuario.nome,
                },
            ).mappings().first()
            for item in body.itens:
                db.execute(
                    text("""
                        INSERT INTO chegada_racao_item (chegada_id, tipo_racao_id, quantidade_sacos)
                        VALUES (:chegada_id, :tipo_racao_id, :quantidade_sacos)
                    """),
                    {"chegada_id": nova["id"], **item.model_dump()},
                )
            db.commit()
            chegada_id = nova["id"]
        except DBAPIError as exc:
            db.rollback()
            raise HTTPException(422, f"fornecedor_id/tipo_racao_id inválido: {exc.orig}") from exc
    else:
        chegada_id = existente["id"]

    row = db.execute(
        text("""
            SELECT c.id, c.data, c.fornecedor_id, f.nome AS fornecedor_nome, c.observacao
            FROM chegada_racao c JOIN fornecedor_racao f ON f.id = c.fornecedor_id
            WHERE c.id = :id
        """),
        {"id": chegada_id},
    ).mappings().first()
    itens = db.execute(
        text("""
            SELECT i.tipo_racao_id, t.codigo AS tipo_racao_codigo, i.quantidade_sacos
            FROM chegada_racao_item i JOIN tipo_racao t ON t.id = i.tipo_racao_id
            WHERE i.chegada_id = :id
        """),
        {"id": chegada_id},
    ).mappings().all()
    return ChegadaRacaoOut(
        id=row["id"], data=row["data"], fornecedor_id=row["fornecedor_id"], fornecedor_nome=row["fornecedor_nome"],
        observacao=row["observacao"],
        itens=[
            ChegadaRacaoItemOut(
                tipo_racao_id=i["tipo_racao_id"], tipo_racao_codigo=i["tipo_racao_codigo"],
                quantidade_sacos=float(i["quantidade_sacos"]),
            )
            for i in itens
        ],
    )
