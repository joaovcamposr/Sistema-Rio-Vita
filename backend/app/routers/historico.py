"""Históricos de lançamentos que não tinham lista própria (água, povoamento,
expedição, acerto) — mostram o que foi lançado e por quem."""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db

router = APIRouter(prefix="/historico", tags=["historico"])


def _periodo(de: date | None, ate: date | None) -> tuple[date, date]:
    ate = ate or date.today()
    return de or (ate - timedelta(days=30)), ate


@router.get("/agua")
def historico_agua(de: date | None = Query(default=None), ate: date | None = Query(default=None), db: Session = Depends(get_db)):
    de, ate = _periodo(de, ate)
    rows = db.execute(text("""
        SELECT a.id, a.data, v.codigo AS viveiro_codigo, a.oxigenio, a.temperatura_c, a.amonia, a.ph, a.nitrito, a.nitrato,
               a.criado_em, a.criado_por
        FROM analise_agua a JOIN viveiro v ON v.id = a.viveiro_id
        WHERE a.data BETWEEN :de AND :ate ORDER BY a.data DESC, a.id DESC
    """), {"de": de, "ate": ate}).mappings().all()
    return [dict(r) for r in rows]


@router.get("/povoamento")
def historico_povoamento(de: date | None = Query(default=None), ate: date | None = Query(default=None), db: Session = Depends(get_db)):
    """Lotes povoados direto no tanque (os que vieram de repicagem aparecem em Repicagem)."""
    de, ate = _periodo(de, ate)
    rows = db.execute(text("""
        SELECT l.id, l.codigo, v.codigo AS viveiro_codigo, l.data_inicio AS data, l.quantidade_inicial,
               l.peso_medio_inicial_g, l.observacao, l.criado_em, l.criado_por
        FROM lote l JOIN viveiro v ON v.id = l.viveiro_id
        WHERE l.data_inicio BETWEEN :de AND :ate
          AND NOT EXISTS (SELECT 1 FROM lote_origem o WHERE o.lote_id = l.id)
        ORDER BY l.data_inicio DESC, l.id DESC
    """), {"de": de, "ate": ate}).mappings().all()
    return [dict(r) for r in rows]


@router.get("/expedicao")
def historico_expedicao(de: date | None = Query(default=None), ate: date | None = Query(default=None), db: Session = Depends(get_db)):
    """Saídas de expedição (pela data de saída), com o que levou."""
    de, ate = _periodo(de, ate)
    rows = db.execute(text("""
        SELECT e.id, vd.nome AS vendedor_nome, e.data_saida AS data, e.data_acerto, e.observacao, e.criado_em, e.criado_por,
               COALESCE((
                 SELECT string_agg(pr.nome || ' ' || COALESCE(i.quantidade_embalagens::text || ' un', i.quantidade_kg::text || ' kg'), ' · ' ORDER BY pr.nome)
                 FROM expedicao_item i JOIN produto pr ON pr.id = i.produto_id WHERE i.expedicao_id = e.id
               ), '') AS itens
        FROM expedicao e JOIN vendedor vd ON vd.id = e.vendedor_id
        WHERE e.data_saida BETWEEN :de AND :ate ORDER BY e.data_saida DESC, e.id DESC
    """), {"de": de, "ate": ate}).mappings().all()
    return [dict(r) for r in rows]


@router.get("/acerto")
def historico_acerto(de: date | None = Query(default=None), ate: date | None = Query(default=None), db: Session = Depends(get_db)):
    """Acertos de expedição (pela data do acerto), com as vendas que geraram e quem as lançou."""
    de, ate = _periodo(de, ate)
    rows = db.execute(text("""
        SELECT e.id, vd.nome AS vendedor_nome, e.data_acerto AS data, e.data_saida,
               (SELECT count(*) FROM venda v WHERE v.expedicao_id = e.id AND v.excluido_em IS NULL) AS vendas,
               (SELECT COALESCE(SUM(v.valor_total), 0) FROM venda v WHERE v.expedicao_id = e.id AND v.excluido_em IS NULL) AS valor_vendas,
               (SELECT string_agg(DISTINCT v.criado_por, ', ') FROM venda v WHERE v.expedicao_id = e.id AND v.excluido_em IS NULL) AS criado_por,
               (SELECT max(v.criado_em) FROM venda v WHERE v.expedicao_id = e.id AND v.excluido_em IS NULL) AS criado_em
        FROM expedicao e JOIN vendedor vd ON vd.id = e.vendedor_id
        WHERE e.data_acerto BETWEEN :de AND :ate ORDER BY e.data_acerto DESC, e.id DESC
    """), {"de": de, "ate": ate}).mappings().all()
    return [{**dict(r), "valor_vendas": float(r["valor_vendas"])} for r in rows]
