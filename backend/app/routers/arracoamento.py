from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..schemas import (
    ArracoamentoDetalheOut,
    ArracoamentoEditarIn,
    ArracoamentoIn,
    ArracoamentoOut,
    LeituraArracoamentoLinhaOut,
    LeituraArracoamentoOut,
    UsuarioOut,
)
from ..vision import ler_ficha

router = APIRouter(prefix="/arracoamento", tags=["arracoamento"])
_COLUNAS = "id, client_id, lote_id, data, trato, sacos, tipo_racao_id, criado_em"

_HORARIO_CAMPO = {"08:30": "h0830", "10:30": "h1030", "12:00": "h1200", "15:30": "h1530"}

_SCHEMA_LEITURA = {
    "type": "object",
    "properties": {
        "data": {"type": "string"},
        "linhas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "tanque": {"type": "string"},
                    "tipo_racao_texto": {"type": "string"},
                    "h0830": {"type": "number"},
                    "h1030": {"type": "number"},
                    "h1200": {"type": "number"},
                    "h1530": {"type": "number"},
                },
                "required": ["tanque"],
            },
        },
    },
    "required": ["linhas"],
}


def _linha(r) -> ArracoamentoOut:
    d = dict(r)
    d["trato"] = d["trato"].strftime("%H:%M") if d["trato"] is not None else None
    return ArracoamentoOut(**d)


@router.post("", response_model=ArracoamentoOut, status_code=201)
def criar_arracoamento(
    body: ArracoamentoIn, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user),
):
    try:
        row = db.execute(
            text(f"""
                INSERT INTO arracoamento (client_id, lote_id, data, trato, sacos, tipo_racao_id, criado_por)
                VALUES (:client_id, :lote_id, :data, :trato, :sacos, :tipo_racao_id, :criado_por)
                ON CONFLICT (client_id) DO NOTHING
                RETURNING {_COLUNAS}
            """),
            {**body.model_dump(), "criado_por": usuario.nome},
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"lote_id inválido ou dado fora das regras: {exc.orig}") from exc

    if row is None:
        row = db.execute(
            text(f"SELECT {_COLUNAS} FROM arracoamento WHERE client_id = :cid"),
            {"cid": str(body.client_id)},
        ).mappings().first()
        if row is None:
            raise HTTPException(422, "já existe um lançamento para este lote, data e trato")
    return _linha(row)


@router.post("/ler-foto", response_model=LeituraArracoamentoOut)
def ler_foto_arracoamento(
    foto: UploadFile = File(...), db: Session = Depends(get_db), _usuario: UsuarioOut = Depends(get_current_user),
):
    """Lê a foto da ficha de arraçoamento preenchida à mão — só devolve o
    que leu, não grava nada. O lançamento de verdade continua sendo o
    POST /arracoamento normal, um por tanque/horário, feito pela tela de
    conferência depois que o operador confirma os valores."""
    viveiros = db.execute(text("SELECT codigo FROM viveiro WHERE ativo ORDER BY codigo")).scalars().all()
    prompt = (
        "Você está lendo uma ficha impressa de arraçoamento de peixes, preenchida à mão. A tabela tem uma coluna "
        "'Tanque' (os códigos possíveis são: " + ", ".join(viveiros) + "), uma coluna 'Ração' (código do tipo de "
        "ração usado naquele tanque, ex.: 30AR, 32AP, 36AP) e colunas de horário (08:30, 10:30, 12:00, 15:30) — "
        "cada célula de horário tem um número de sacos (pode ter vírgula decimal, ex: 2,5) ou está em branco "
        "(nesse caso não inclua esse horário no resultado). Também tem um campo escrito à mão no topo da ficha: "
        "'Data'. Se um número estiver ilegível, prefira omitir a arriscar um valor errado."
    )
    bruto = ler_ficha(foto.file.read(), foto.content_type or "image/jpeg", prompt, _SCHEMA_LEITURA)

    linhas = []
    for linha in bruto.get("linhas", []):
        valores = {
            horario: float(linha[campo]) for horario, campo in _HORARIO_CAMPO.items() if linha.get(campo) is not None
        }
        if valores:
            linhas.append(LeituraArracoamentoLinhaOut(
                tanque=str(linha.get("tanque", "")).strip(),
                tipo_racao_texto=linha.get("tipo_racao_texto"),
                valores=valores,
            ))

    return LeituraArracoamentoOut(data_lida=bruto.get("data"), linhas=linhas)


@router.patch("/{arracoamento_id}", response_model=ArracoamentoOut)
def editar_arracoamento(
    arracoamento_id: int, body: ArracoamentoEditarIn, db: Session = Depends(get_db),
    _usuario: UsuarioOut = Depends(get_current_user),
):
    """Corrige data, sacos ou tipo de ração de um lançamento já feito. Não
    mexe em lote/trato — pra reatribuir a outro tanque, exclua e lance
    de novo."""
    try:
        row = db.execute(
            text(f"""
                UPDATE arracoamento SET data = :data, sacos = :sacos, tipo_racao_id = :tipo_racao_id
                WHERE id = :id AND excluido_em IS NULL
                RETURNING {_COLUNAS}
            """),
            {"id": arracoamento_id, **body.model_dump()},
        ).mappings().first()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"dado fora das regras: {exc.orig}") from exc
    if row is None:
        raise HTTPException(404, "lançamento não encontrado (ou excluído — restaure antes de editar)")
    return _linha(row)


@router.delete("/{arracoamento_id}", response_model=ArracoamentoOut)
def excluir_arracoamento(
    arracoamento_id: int, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user),
):
    row = db.execute(
        text(f"""
            UPDATE arracoamento SET excluido_em = now(), excluido_por = :quem
            WHERE id = :id AND excluido_em IS NULL
            RETURNING {_COLUNAS}
        """),
        {"id": arracoamento_id, "quem": usuario.nome},
    ).mappings().first()
    db.commit()
    if row is None:
        raise HTTPException(404, "lançamento não encontrado (ou já excluído)")
    return _linha(row)


@router.post("/{arracoamento_id}/restaurar", response_model=ArracoamentoOut)
def restaurar_arracoamento(
    arracoamento_id: int, db: Session = Depends(get_db), _usuario: UsuarioOut = Depends(get_current_user),
):
    row = db.execute(
        text(f"""
            UPDATE arracoamento SET excluido_em = NULL, excluido_por = NULL
            WHERE id = :id AND excluido_em IS NOT NULL
            RETURNING {_COLUNAS}
        """),
        {"id": arracoamento_id},
    ).mappings().first()
    db.commit()
    if row is None:
        raise HTTPException(404, "lançamento não encontrado (ou não está excluído)")
    return _linha(row)
