from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..schemas import LeituraProducaoItemOut, LeituraProducaoOut, ProducaoIn, ProducaoOut, UsuarioOut
from ..vision import ler_ficha

router = APIRouter(prefix="/producao", tags=["producao"])

_COLUNAS = "id, client_id, data, produto_id, quantidade_embalagens, quantidade_kg, lote_id, data_despesca, criado_em"

_SCHEMA_LEITURA = {
    "type": "object",
    "properties": {
        "data": {"type": "string"},
        "tanque_origem": {"type": "string"},
        "data_despesca": {"type": "string"},
        "itens": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "produto_nome": {"type": "string"},
                    "caixas_fechadas": {"type": "number"},
                    "pacotes_soltos": {"type": "number"},
                    "quantidade_un": {"type": "number"},
                    "peso_total_kg": {"type": "number"},
                },
                "required": ["produto_nome"],
            },
        },
    },
    "required": ["itens"],
}


@router.post("", response_model=ProducaoOut, status_code=201)
def criar_producao(body: ProducaoIn, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user)):
    try:
        produto = db.execute(
            text("SELECT kg_digitado, fator_kg FROM produto WHERE id = :id"),
            {"id": body.produto_id},
        ).mappings().first()
    except DBAPIError as exc:
        # ex.: produto_id fora da faixa do smallint — entrada inválida, não
        # erro de servidor
        db.rollback()
        raise HTTPException(422, "produto_id inválido") from exc
    if produto is None:
        raise HTTPException(422, "produto_id inválido")

    # regra R1: produto com fator de conversão exige bandejas; produto com
    # Kg digitado (ex.: tilápia limpa) exige o Kg direto
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
        # placeholder quando convertido por trigger; valor real quando kg_digitado
        "quantidade_kg": body.quantidade_kg if body.quantidade_kg is not None else 0,
        "lote_id": body.lote_id,
        "data_despesca": body.data_despesca,
        "criado_por": usuario.nome,
    }

    try:
        row = db.execute(
            text(f"""
                INSERT INTO producao (client_id, data, produto_id, quantidade_embalagens,
                                       quantidade_kg, lote_id, data_despesca, criado_por)
                VALUES (:client_id, :data, :produto_id, :quantidade_embalagens,
                        :quantidade_kg, :lote_id, :data_despesca, :criado_por)
                ON CONFLICT (client_id) DO NOTHING
                RETURNING {_COLUNAS}
            """),
            payload,
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"lote_id inválido ou dado fora das regras: {exc.orig}") from exc

    if row is None:
        row = db.execute(
            text(f"SELECT {_COLUNAS} FROM producao WHERE client_id = :cid"),
            {"cid": str(body.client_id)},
        ).mappings().first()
    return ProducaoOut(**row)


@router.post("/ler-foto", response_model=LeituraProducaoOut)
def ler_foto_producao(
    foto: UploadFile = File(...), db: Session = Depends(get_db), _usuario: UsuarioOut = Depends(get_current_user),
):
    """Lê a foto da ficha de produção preenchida à mão — só devolve o que
    leu, não grava nada. O lançamento de verdade é o POST /producao
    normal, um por produto, feito pela tela de conferência."""
    produtos = db.execute(
        text("SELECT nome FROM produto WHERE ativo AND nome NOT ILIKE '%suja%' ORDER BY nome")
    ).scalars().all()
    prompt = (
        "Você está lendo uma ficha impressa de produção de pescado, preenchida à mão pelo pessoal do frigorífico. "
        f"Os produtos possíveis são: {', '.join(produtos)}. Pra filé (qualquer embalagem) e postas, a contagem é "
        "por caixa fechada (filé = 8 pacotes por caixa, postas = 6 pacotes por caixa) e a ficha tem dois campos "
        "por produto: 'Caixas fechadas' e 'Pacotes soltos' (sobra de caixa incompleta, comum no fim do turno). "
        "Pra 'Tilápia limpa', a ficha tem 'Quantidade (un)' e 'Peso total (Kg)', preenchidos separadamente — não "
        "confunda com caixas. Também tem campos escritos à mão no topo: 'Data', 'Tanque de origem' e 'Data da "
        "despesca'. Se um número estiver ilegível ou o campo estiver em branco, não inclua esse valor — prefira "
        "omitir a arriscar um valor errado."
    )
    bruto = ler_ficha(foto.file.read(), foto.content_type or "image/jpeg", prompt, _SCHEMA_LEITURA)

    def num(v: object) -> float | None:
        return None if v is None else float(v)  # type: ignore[arg-type]

    itens = [
        LeituraProducaoItemOut(
            produto_nome=str(i.get("produto_nome", "")).strip(),
            caixas_fechadas=num(i.get("caixas_fechadas")),
            pacotes_soltos=num(i.get("pacotes_soltos")),
            quantidade_un=num(i.get("quantidade_un")),
            peso_total_kg=num(i.get("peso_total_kg")),
        )
        for i in bruto.get("itens", [])
    ]
    return LeituraProducaoOut(
        data_lida=bruto.get("data"), tanque_origem=bruto.get("tanque_origem"),
        data_despesca=bruto.get("data_despesca"), itens=itens,
    )
