from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas import LoteAtual, ViveiroAtivoIn, ViveiroAtivoOut, ViveiroOut
from .paineis import _chave_ordem_viveiro

router = APIRouter(prefix="/viveiros", tags=["viveiros"])

_QUERY = text("""
    SELECT v.id, v.codigo, v.tipo, v.area_m2,
           l.id AS lote_id, l.codigo AS lote_codigo, l.fase AS lote_fase,
           l.data_inicio AS lote_data_inicio, l.quantidade_inicial AS lote_quantidade_inicial,
           l.peso_medio_inicial_g AS lote_peso_medio_inicial_g,
           s.saldo_un
    FROM viveiro v
    LEFT JOIN lote l ON l.viveiro_id = v.id AND l.data_fim IS NULL
    LEFT JOIN vw_saldo_lote s ON s.lote_id = l.id
    WHERE v.ativo
""")


@router.get("", response_model=list[ViveiroOut])
def listar_viveiros(db: Session = Depends(get_db)):
    rows = db.execute(_QUERY).mappings().all()
    # ordem natural (PE1..PE5, depois 1, 2, ..., 24, DEC por último) — não a
    # ordem alfabética do texto, que colocaria '10' antes de '2'
    rows = sorted(rows, key=lambda r: _chave_ordem_viveiro(r["codigo"]))
    out = []
    for r in rows:
        lote_atual = None
        if r["lote_id"] is not None:
            lote_atual = LoteAtual(
                id=r["lote_id"], codigo=r["lote_codigo"], fase=r["lote_fase"],
                saldo_un=r["saldo_un"], data_inicio=r["lote_data_inicio"],
                quantidade_inicial=r["lote_quantidade_inicial"],
                peso_medio_inicial_g=float(r["lote_peso_medio_inicial_g"]),
            )
        out.append(ViveiroOut(
            id=r["id"], codigo=r["codigo"], tipo=r["tipo"],
            area_m2=float(r["area_m2"]), lote_atual=lote_atual,
        ))
    return out


@router.get("/todos", response_model=list[ViveiroAtivoOut])
def listar_viveiros_todos(db: Session = Depends(get_db)):
    """Ativos e inativos — só pra tela de seleção. Os demais endpoints de
    viveiro (e os painéis) continuam só considerando os ativos."""
    rows = db.execute(text("SELECT id, codigo, tipo, ativo FROM viveiro")).mappings().all()
    rows = sorted(rows, key=lambda r: _chave_ordem_viveiro(r["codigo"]))
    return [ViveiroAtivoOut(id=r["id"], codigo=r["codigo"], tipo=r["tipo"], ativo=r["ativo"]) for r in rows]


@router.patch("/{viveiro_id}/ativo", response_model=ViveiroAtivoOut)
def atualizar_ativo(viveiro_id: int, body: ViveiroAtivoIn, db: Session = Depends(get_db)):
    row = db.execute(
        text("UPDATE viveiro SET ativo = :ativo WHERE id = :id RETURNING id, codigo, tipo, ativo"),
        {"ativo": body.ativo, "id": viveiro_id},
    ).mappings().first()
    if row is None:
        raise HTTPException(404, "viveiro não encontrado")
    db.commit()
    return ViveiroAtivoOut(id=row["id"], codigo=row["codigo"], tipo=row["tipo"], ativo=row["ativo"])
