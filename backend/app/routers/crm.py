"""CRM: clientes que pararam de comprar (recompra), prospecção e agenda de ações."""
from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, timedelta
from statistics import mean

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..schemas import UsuarioOut
from .clientes import _exigir_nome_novo
from .credito import _SQL as _SQL_CREDITO, _linha as _linha_credito

router = APIRouter(prefix="/crm", tags=["crm"])

# clientes "genéricos" (varejo no balcão) não têm ritmo de compra próprio
_GENERICOS = {"varejo", "consumidor final"}
ETAPAS_PROSPECCAO = ["Novo", "Contato feito", "Proposta enviada", "Negociação"]
FASE_PERDIDO = "Perdido"


def _norm(s: str) -> str:
    return " ".join(s.lower().split())


# --------------------------------------------------------------------------- recompra

@router.get("/recompra")
def clientes_sem_comprar(
    modo: str = Query(default="relativo", pattern="^(relativo|fixo)$",
                      description="relativo = X dias é o intervalo médio entre pedidos × fator; fixo = X dias iguais pra todos"),
    fator: float = Query(default=1.5, ge=1.0, le=10.0, description="1,5 = 50% acima do intervalo médio entre os últimos pedidos"),
    dias_fixos: int = Query(default=45, ge=1, le=730),
    pedidos_do_intervalo: int = Query(default=5, ge=2, le=12, description="quantos intervalos recentes entram na média"),
    min_pedidos: int = Query(default=3, ge=2, le=20, description="abaixo disso o histórico é curto e vale o prazo padrão"),
    dias_padrao: int = Query(default=60, ge=7, le=365, description="prazo usado quando o cliente tem poucos pedidos"),
    abc_a: float = Query(default=0.8, gt=0, lt=1, description="curva A = clientes que somam até essa fatia do faturamento de 12 meses"),
    abc_b: float = Query(default=0.95, gt=0, lt=1, description="curva B = até essa fatia acumulada; o resto é C"),
    db: Session = Depends(get_db),
):
    """Por cliente: último pedido, intervalo médio entre os últimos pedidos e há quantos dias ele não compra,
    comparado ao limite X. 'Pedido' = um dia de compra do cliente (várias linhas no mesmo dia contam uma vez).
    Traz também a curva ABC (faturamento de 12 meses) e a situação de crédito/cobrança de cada cliente."""
    return _calcular_recompra(db, modo, fator, dias_fixos, pedidos_do_intervalo, min_pedidos, dias_padrao, abc_a, abc_b)


def _calcular_recompra(
    db: Session, modo: str, fator: float, dias_fixos: int, pedidos_do_intervalo: int, min_pedidos: int,
    dias_padrao: int, abc_a: float = 0.8, abc_b: float = 0.95,
) -> dict:
    hoje = date.today()
    linhas = db.execute(text("""
        SELECT v.cliente_id, v.data, SUM(v.valor_total) AS valor, SUM(v.quantidade_kg) AS kg
        FROM venda v
        WHERE v.excluido_em IS NULL AND v.cliente_id IS NOT NULL AND v.valor_total > 0
        GROUP BY v.cliente_id, v.data
    """)).mappings().all()
    por_cliente: dict[int, list[tuple[date, float, float]]] = defaultdict(list)
    for r in linhas:
        por_cliente[r["cliente_id"]].append((r["data"], float(r["valor"]), float(r["kg"])))

    clientes = {
        r["id"]: r for r in db.execute(text("""
            SELECT c.id, c.nome, c.cidade, c.contato, c.temperatura, c.proxima_acao, c.proxima_acao_data, c.fase,
                   c.limite_recompra_dias, c.endereco, vd.nome AS vendedor_cadastro
            FROM cliente c LEFT JOIN vendedor vd ON vd.id = c.vendedor_id
            WHERE c.ativo AND c.e_cliente
        """)).mappings().all()
    }
    produtos_por_cliente: dict[int, list[tuple[str, float]]] = defaultdict(list)
    for r in db.execute(text("""
        SELECT v.cliente_id, pr.nome, SUM(v.valor_total) AS valor
        FROM venda v JOIN produto pr ON pr.id = v.produto_id
        WHERE v.excluido_em IS NULL AND v.cliente_id IS NOT NULL AND v.data >= :de
        GROUP BY v.cliente_id, pr.nome ORDER BY SUM(v.valor_total) DESC
    """), {"de": hoje - timedelta(days=365)}).mappings().all():
        produtos_por_cliente[r["cliente_id"]].append((r["nome"], float(r["valor"])))
    vendedor_mais_frequente = {
        r["cliente_id"]: r["vendedor"] for r in db.execute(text("""
            SELECT DISTINCT ON (cliente_id) cliente_id, vendedor FROM (
              SELECT cliente_id, vendedor, count(*) n FROM venda
              WHERE excluido_em IS NULL AND cliente_id IS NOT NULL AND vendedor IS NOT NULL GROUP BY cliente_id, vendedor
            ) t ORDER BY cliente_id, n DESC
        """)).mappings().all()
    }
    ultimo_contato = {
        r["cliente_id"]: r["ultimo"] for r in db.execute(text(
            "SELECT cliente_id, MAX(data) AS ultimo FROM interacao_cliente WHERE excluido_em IS NULL GROUP BY cliente_id"
        )).mappings().all()
    }

    credito = {r["id"]: _linha_credito(r) for r in db.execute(text(_SQL_CREDITO.format(filtro="")), {"hoje": hoje}).mappings().all()}

    saida = []
    for cid, pedidos in por_cliente.items():
        c = clientes.get(cid)
        if c is None or _norm(c["nome"]) in _GENERICOS:
            continue
        pedidos.sort(key=lambda p: p[0], reverse=True)           # mais recente primeiro
        datas = [p[0] for p in pedidos]
        ultima = datas[0]
        recentes = datas[: pedidos_do_intervalo + 1]
        intervalos = [(recentes[i] - recentes[i + 1]).days for i in range(len(recentes) - 1)]
        historico_curto = len(datas) < min_pedidos or not intervalos
        intervalo_medio = mean(intervalos) if intervalos and not historico_curto else None

        if modo == "fixo":
            limite_auto = dias_fixos
        elif intervalo_medio is not None:
            limite_auto = max(1, math.ceil(intervalo_medio * fator))
        else:
            limite_auto = dias_padrao
        # ajuste manual por cliente vale no lugar do cálculo automático
        manual = c["limite_recompra_dias"]
        limite = manual if manual else limite_auto
        dias_sem = (hoje - ultima).days
        base = limite if (modo == "fixo" or intervalo_medio is None) else min(intervalo_medio, limite)
        if dias_sem <= base:
            situacao = "em_dia"
        elif dias_sem <= limite:
            situacao = "atencao"
        elif dias_sem <= max(180, limite * 3):
            situacao = "atrasado"
        else:
            situacao = "inativo"

        ult5 = pedidos[:5]
        ticket = mean(p[1] for p in ult5)
        valor_90d = sum(p[1] for p in pedidos if (hoje - p[0]).days <= 90)
        valor_12m = sum(p[1] for p in pedidos if (hoje - p[0]).days <= 365)
        potencial_mensal = ticket * 30 / intervalo_medio if intervalo_medio else (valor_12m / 12 if valor_12m else None)
        tops = produtos_por_cliente.get(cid, [])[:2]
        saida.append({
            "cliente_id": cid, "nome": c["nome"], "cidade": c["cidade"], "telefone": c["contato"],
            "vendedor": vendedor_mais_frequente.get(cid) or c["vendedor_cadastro"],
            "pedidos": len(datas), "ultima_compra": ultima, "dias_sem_comprar": dias_sem,
            "intervalo_medio_dias": round(intervalo_medio, 1) if intervalo_medio is not None else None,
            "limite_dias": limite, "limite_automatico_dias": limite_auto, "limite_manual": bool(manual),
            "dias_de_atraso": max(0, dias_sem - limite),
            "proxima_compra_prevista": (ultima + timedelta(days=round(intervalo_medio))) if intervalo_medio else None,
            "historico_curto": historico_curto, "situacao": situacao,
            "ticket_medio": round(ticket, 2), "valor_90d": round(valor_90d, 2), "valor_12m": round(valor_12m, 2),
            "potencial_mensal": round(potencial_mensal, 2) if potencial_mensal else None,
            "produtos_principais": [t[0] for t in tops],
            "ultimo_contato": ultimo_contato.get(cid), "temperatura": c["temperatura"],
            "proxima_acao": c["proxima_acao"], "proxima_acao_data": c["proxima_acao_data"],
            "em_aberto": credito.get(cid, {}).get("em_aberto", 0.0), "vencido": credito.get(cid, {}).get("vencido", 0.0),
            "maior_atraso_pagamento_dias": credito.get(cid, {}).get("maior_atraso_dias"),
            "limite_credito": credito.get(cid, {}).get("limite_credito"), "status_credito": credito.get(cid, {}).get("status"),
            "endereco": c["endereco"],
        })
    # mais valioso e mais atrasado primeiro
    ordem = {"atrasado": 0, "atencao": 1, "inativo": 2, "em_dia": 3}
    saida.sort(key=lambda x: (ordem[x["situacao"]], -(x["potencial_mensal"] or 0)))
    resumo = {s: sum(1 for x in saida if x["situacao"] == s) for s in ("em_dia", "atencao", "atrasado", "inativo")}
    resumo["potencial_mensal_em_risco"] = round(sum((x["potencial_mensal"] or 0) for x in saida if x["situacao"] in ("atencao", "atrasado")), 2)
    # curva ABC pelo faturamento dos últimos 12 meses (Pareto): A = quem soma até abc_a, B = até abc_b, C = o resto
    base_abc = sorted((x for x in saida if x["valor_12m"] > 0), key=lambda x: -x["valor_12m"])
    total_12m = sum(x["valor_12m"] for x in base_abc)
    acumulado = 0.0
    for x in base_abc:
        antes = acumulado / total_12m if total_12m else 1.0
        x["curva"] = "A" if antes < abc_a else "B" if antes < abc_b else "C"
        x["participacao_12m"] = x["valor_12m"] / total_12m if total_12m else 0.0
        acumulado += x["valor_12m"]
        x["participacao_acumulada"] = acumulado / total_12m if total_12m else 0.0
    for x in saida:
        x.setdefault("curva", "-")
        x.setdefault("participacao_12m", 0.0)
        x.setdefault("participacao_acumulada", 1.0)
    abc = {}
    for k in ("A", "B", "C", "-"):
        grupo = [x for x in saida if x["curva"] == k]
        abc[k] = {
            "clientes": len(grupo), "valor_12m": round(sum(x["valor_12m"] for x in grupo), 2),
            "participacao": round(sum(x["valor_12m"] for x in grupo) / total_12m, 4) if total_12m else 0.0,
            "em_risco": sum(1 for x in grupo if x["situacao"] in ("atencao", "atrasado")),
            "potencial_mensal_em_risco": round(sum((x["potencial_mensal"] or 0) for x in grupo if x["situacao"] in ("atencao", "atrasado")), 2),
            "vencido": round(sum(x["vencido"] for x in grupo), 2),
        }
    return {
        "parametros": {"modo": modo, "fator": fator, "dias_fixos": dias_fixos, "pedidos_do_intervalo": pedidos_do_intervalo,
                       "min_pedidos": min_pedidos, "dias_padrao": dias_padrao, "abc_a": abc_a, "abc_b": abc_b},
        "resumo": resumo, "abc": abc, "total_12m": round(total_12m, 2), "clientes": saida,
    }


class LimiteRecompraIn(BaseModel):
    dias: int | None = Field(default=None, ge=1, le=730)     # None = volta ao automático


@router.patch("/clientes/{cliente_id}/limite-recompra")
def definir_limite_recompra(
    cliente_id: int, body: LimiteRecompraIn, db: Session = Depends(get_db), _u: UsuarioOut = Depends(get_current_user),
):
    """Ajusta, só para esse cliente, depois de quantos dias sem comprar ele entra em atraso. `dias` nulo = automático."""
    r = db.execute(text("UPDATE cliente SET limite_recompra_dias = :d WHERE id = :id AND ativo RETURNING id"),
                   {"d": body.dias, "id": cliente_id}).first()
    db.commit()
    if r is None:
        raise HTTPException(404, "cliente não encontrado")
    return {"ok": True, "limite_recompra_dias": body.dias}


# --------------------------------------------------------------------------- prospecção

@router.get("/prospeccao")
def prospeccao(db: Session = Depends(get_db)):
    """Prospectos (cliente com e_cliente = false) por etapa do funil, com o último contato e a próxima ação."""
    hoje = date.today()
    rows = db.execute(text("""
        SELECT c.id, c.nome, c.cidade, c.contato, c.ramo, c.origem, c.fase, c.temperatura, c.proxima_acao, c.proxima_acao_data,
               c.volume_estimado_kg_mes, c.fornecedor_atual, c.preco_concorrente, c.motivo, c.motivo_perda, c.observacoes,
               vd.nome AS vendedor_nome,
               (SELECT MAX(i.data) FROM interacao_cliente i WHERE i.cliente_id = c.id AND i.excluido_em IS NULL) AS ultimo_contato,
               (SELECT COUNT(*) FROM interacao_cliente i WHERE i.cliente_id = c.id AND i.excluido_em IS NULL) AS contatos
        FROM cliente c LEFT JOIN vendedor vd ON vd.id = c.vendedor_id
        WHERE c.ativo AND NOT c.e_cliente
        ORDER BY c.proxima_acao_data NULLS LAST, c.nome
    """)).mappings().all()
    prospectos = []
    for r in rows:
        d = dict(r)
        fase = d["fase"] if d["fase"] in ETAPAS_PROSPECCAO or d["fase"] == FASE_PERDIDO else "Novo"
        d["fase"] = fase
        d["dias_sem_contato"] = (hoje - d["ultimo_contato"]).days if d["ultimo_contato"] else None
        d["acao_atrasada"] = bool(d["proxima_acao_data"] and d["proxima_acao_data"] < hoje)
        d["volume_estimado_kg_mes"] = float(d["volume_estimado_kg_mes"]) if d["volume_estimado_kg_mes"] is not None else None
        d["preco_concorrente"] = float(d["preco_concorrente"]) if d["preco_concorrente"] is not None else None
        prospectos.append(d)
    por_etapa = {e: sum(1 for p in prospectos if p["fase"] == e) for e in [*ETAPAS_PROSPECCAO, FASE_PERDIDO]}
    ganhos_90d = db.execute(text("""
        SELECT COUNT(*) FROM (
          SELECT c.id FROM cliente c JOIN venda v ON v.cliente_id = c.id AND v.excluido_em IS NULL
          WHERE c.e_cliente AND c.ativo GROUP BY c.id HAVING MIN(v.data) >= :de
        ) t
    """), {"de": hoje - timedelta(days=90)}).scalar()
    return {
        "etapas": ETAPAS_PROSPECCAO, "por_etapa": por_etapa, "prospectos": prospectos,
        "novos_clientes_90d": ganhos_90d,
        "volume_estimado_kg_mes": round(sum(p["volume_estimado_kg_mes"] or 0 for p in prospectos if p["fase"] != FASE_PERDIDO), 1),
    }


class ProspectoIn(BaseModel):
    nome: str = Field(min_length=1)
    contato: str | None = None
    cidade: str | None = None
    ramo: str | None = None
    origem: str | None = None
    vendedor_id: int | None = None
    volume_estimado_kg_mes: float | None = Field(default=None, ge=0)
    fornecedor_atual: str | None = None
    preco_concorrente: float | None = Field(default=None, ge=0)
    temperatura: str | None = None
    motivo: str | None = None                 # interesse / observação inicial
    proxima_acao: str | None = None
    proxima_acao_data: date | None = None


@router.post("/prospectos", status_code=201)
def criar_prospecto(
    body: ProspectoIn, forcar: bool = Query(default=False), db: Session = Depends(get_db),
    usuario: UsuarioOut = Depends(get_current_user),
):
    if not forcar:
        _exigir_nome_novo(db, body.nome)
    try:
        novo = db.execute(text("""
            INSERT INTO cliente (nome, contato, cidade, ramo, origem, vendedor_id, volume_estimado_kg_mes, fornecedor_atual,
                                 preco_concorrente, temperatura, motivo, proxima_acao, proxima_acao_data, e_cliente, fase)
            VALUES (:nome, :contato, :cidade, :ramo, :origem, :vendedor_id, :volume_estimado_kg_mes, :fornecedor_atual,
                    :preco_concorrente, :temperatura, :motivo, :proxima_acao, :proxima_acao_data, false, 'Novo')
            RETURNING id
        """), body.model_dump()).scalar_one()
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"dado inválido: {exc.orig}") from exc
    return {"id": novo, "nome": body.nome}


class ContatoIn(BaseModel):
    cliente_id: int
    tipo: str = "WhatsApp"                    # Ligação, Visita, WhatsApp, E-mail, Outro
    descricao: str = Field(min_length=1)
    data: date | None = None
    vendedor_id: int | None = None
    # atualizações opcionais do funil, na mesma gravação
    fase: str | None = None
    temperatura: str | None = None
    proxima_acao: str | None = None
    proxima_acao_data: date | None = None
    limpar_proxima_acao: bool = False


@router.post("/contato", status_code=201)
def registrar_contato(body: ContatoIn, db: Session = Depends(get_db), usuario: UsuarioOut = Depends(get_current_user)):
    """Registra um contato (ligação, visita, WhatsApp...) e, de uma vez, atualiza etapa, temperatura e próxima ação."""
    existe = db.execute(text("SELECT e_cliente FROM cliente WHERE id = :i AND ativo"), {"i": body.cliente_id}).first()
    if existe is None:
        raise HTTPException(404, "cliente não encontrado")
    try:
        db.execute(text("""
            INSERT INTO interacao_cliente (cliente_id, data, tipo, descricao, vendedor_id, criado_por)
            VALUES (:c, :d, :t, :desc, :v, :quem)
        """), {"c": body.cliente_id, "d": body.data or date.today(), "t": body.tipo, "desc": body.descricao.strip(),
               "v": body.vendedor_id, "quem": usuario.nome})
        sets, params = [], {"id": body.cliente_id}
        if body.fase is not None:
            sets.append("fase = :fase"); params["fase"] = body.fase
        if body.temperatura is not None:
            sets.append("temperatura = :temperatura"); params["temperatura"] = body.temperatura
        if body.limpar_proxima_acao:
            sets.append("proxima_acao = NULL, proxima_acao_data = NULL")
        elif body.proxima_acao is not None or body.proxima_acao_data is not None:
            sets.append("proxima_acao = :pa, proxima_acao_data = :pad")
            params["pa"], params["pad"] = body.proxima_acao, body.proxima_acao_data
        if sets:
            db.execute(text(f"UPDATE cliente SET {', '.join(sets)} WHERE id = :id"), params)
        db.commit()
    except DBAPIError as exc:
        db.rollback()
        raise HTTPException(422, f"dado inválido: {exc.orig}") from exc
    return {"ok": True}


class FunilIn(BaseModel):
    fase: str | None = None
    temperatura: str | None = None
    proxima_acao: str | None = None
    proxima_acao_data: date | None = None
    motivo_perda: str | None = None
    volume_estimado_kg_mes: float | None = Field(default=None, ge=0)
    converter_em_cliente: bool = False


@router.patch("/clientes/{cliente_id}/funil")
def atualizar_funil(cliente_id: int, body: FunilIn, db: Session = Depends(get_db), _u: UsuarioOut = Depends(get_current_user)):
    """Muda etapa/temperatura/próxima ação de um prospecto; também marca como perdido (com motivo) ou converte em cliente."""
    dados = body.model_dump(exclude_unset=True)
    converter = dados.pop("converter_em_cliente", False)
    if converter:
        dados.update({"fase": "Cliente ativo"})
    sets = [f"{k} = :{k}" for k in dados]
    params = {**dados, "id": cliente_id}
    if converter:
        sets.append("e_cliente = true")
    if dados.get("fase") and dados["fase"] != FASE_PERDIDO and not converter:
        sets.append("motivo_perda = NULL")
    if not sets:
        return {"ok": True}
    r = db.execute(text(f"UPDATE cliente SET {', '.join(sets)} WHERE id = :id AND ativo RETURNING id"), params).first()
    db.commit()
    if r is None:
        raise HTTPException(404, "cliente não encontrado")
    return {"ok": True}


# --------------------------------------------------------------------------- agenda

@router.get("/agenda")
def agenda(ate: date | None = Query(default=None), db: Session = Depends(get_db)):
    """Ações marcadas (próxima ação com data) até a data — atrasadas e de hoje, de prospectos e de clientes."""
    limite = ate or date.today()
    rows = db.execute(text("""
        SELECT c.id AS cliente_id, c.nome, c.e_cliente, c.fase, c.temperatura, c.contato, c.proxima_acao, c.proxima_acao_data,
               vd.nome AS vendedor_nome
        FROM cliente c LEFT JOIN vendedor vd ON vd.id = c.vendedor_id
        WHERE c.ativo AND c.proxima_acao_data IS NOT NULL AND c.proxima_acao_data <= :limite
          AND COALESCE(c.fase, '') <> :perdido
        ORDER BY c.proxima_acao_data, c.nome
    """), {"limite": limite, "perdido": FASE_PERDIDO}).mappings().all()
    hoje = date.today()
    return [{**dict(r), "atrasada": r["proxima_acao_data"] < hoje} for r in rows]


# --------------------------------------------------------------------------- cobrança (crédito + recompra)

_PADRAO = dict(modo="relativo", fator=1.5, dias_fixos=45, pedidos_do_intervalo=5, min_pedidos=3, dias_padrao=60)


@router.get("/cobranca")
def cobranca(db: Session = Depends(get_db)):
    """Quem está devendo (vencido) ou vence nos próximos 3 dias, com a situação de recompra e a curva ABC do cliente —
    para cobrar sabendo o que ele vale e se ainda está comprando."""
    hoje = date.today()
    rec = {c["cliente_id"]: c for c in _calcular_recompra(db, **_PADRAO)["clientes"]}
    cred = [_linha_credito(r) for r in db.execute(text(_SQL_CREDITO.format(filtro="")), {"hoje": hoje}).mappings().all()]
    prox = {
        r["cliente_id"]: float(r["valor"]) for r in db.execute(text("""
            SELECT v.cliente_id, SUM(vp.valor) AS valor
            FROM venda v JOIN venda_parcela vp ON vp.venda_id = v.id
            WHERE v.excluido_em IS NULL AND vp.excluido_em IS NULL AND vp.data_pagamento IS NULL
              AND vp.data_prevista BETWEEN :hoje AND :ate AND v.cliente_id IS NOT NULL
            GROUP BY v.cliente_id
        """), {"hoje": hoje, "ate": hoje + timedelta(days=3)}).mappings().all()
    }
    extra = {
        r["id"]: r for r in db.execute(text("""
            SELECT c.id, c.contato, c.proxima_acao, c.proxima_acao_data,
                   (SELECT MAX(i.data) FROM interacao_cliente i WHERE i.cliente_id = c.id AND i.excluido_em IS NULL AND i.tipo = 'Cobrança') AS ultima_cobranca
            FROM cliente c WHERE c.ativo
        """)).mappings().all()
    }
    saida = []
    for c in cred:
        a_vencer_3d = prox.get(c["cliente_id"], 0.0)
        if c["vencido"] <= 0 and a_vencer_3d <= 0:
            continue
        r = rec.get(c["cliente_id"], {})
        e = extra.get(c["cliente_id"], {})
        saida.append({
            **c, "a_vencer_3d": a_vencer_3d, "telefone": e.get("contato"), "proxima_acao": e.get("proxima_acao"),
            "proxima_acao_data": e.get("proxima_acao_data"), "ultima_cobranca": e.get("ultima_cobranca"),
            "situacao_recompra": r.get("situacao"), "dias_sem_comprar": r.get("dias_sem_comprar"), "curva": r.get("curva", "-"),
            "potencial_mensal": r.get("potencial_mensal"),
        })
    saida.sort(key=lambda x: (-x["vencido"], -x["a_vencer_3d"]))
    faixas = db.execute(text("""
        SELECT
          COALESCE(SUM(vp.valor) FILTER (WHERE :hoje - vp.data_prevista BETWEEN 1 AND 30), 0) AS f1,
          COALESCE(SUM(vp.valor) FILTER (WHERE :hoje - vp.data_prevista BETWEEN 31 AND 60), 0) AS f2,
          COALESCE(SUM(vp.valor) FILTER (WHERE :hoje - vp.data_prevista BETWEEN 61 AND 90), 0) AS f3,
          COALESCE(SUM(vp.valor) FILTER (WHERE :hoje - vp.data_prevista > 90), 0) AS f4
        FROM venda v JOIN venda_parcela vp ON vp.venda_id = v.id
        WHERE v.excluido_em IS NULL AND vp.excluido_em IS NULL AND vp.data_pagamento IS NULL AND vp.data_prevista < :hoje
    """), {"hoje": hoje}).mappings().first()
    return {
        "resumo": {
            "vencido": round(sum(x["vencido"] for x in saida), 2), "clientes_vencidos": sum(1 for x in saida if x["vencido"] > 0),
            "a_vencer_3d": round(sum(x["a_vencer_3d"] for x in saida), 2),
            "faixas": {"1-30": float(faixas["f1"]), "31-60": float(faixas["f2"]), "61-90": float(faixas["f3"]), "90+": float(faixas["f4"])},
            "vencido_de_clientes_curva_a": round(sum(x["vencido"] for x in saida if x["curva"] == "A"), 2),
        },
        "clientes": saida,
    }


@router.get("/cobranca/{cliente_id}/parcelas")
def parcelas_em_aberto(cliente_id: int, db: Session = Depends(get_db)):
    hoje = date.today()
    rows = db.execute(text("""
        SELECT v.id AS venda_id, v.data AS data_venda, pr.nome AS produto, vp.valor, vp.forma_pgto, vp.data_prevista
        FROM venda v JOIN venda_parcela vp ON vp.venda_id = v.id JOIN produto pr ON pr.id = v.produto_id
        WHERE v.cliente_id = :c AND v.excluido_em IS NULL AND vp.excluido_em IS NULL AND vp.data_pagamento IS NULL
        ORDER BY vp.data_prevista, v.id
    """), {"c": cliente_id}).mappings().all()
    return [{**dict(r), "valor": float(r["valor"]), "dias_de_atraso": max(0, (hoje - r["data_prevista"]).days)} for r in rows]


# --------------------------------------------------------------------------- rota de visitas

@router.get("/rota")
def rota_de_visitas(vendedor: str | None = Query(default=None), db: Session = Depends(get_db)):
    """Paradas agrupadas por cidade para planejar a semana: clientes a reativar (recompra atrasada/atenção), cobranças,
    prospectos em aberto e ações já marcadas. Cada parada traz os motivos pelos quais vale a visita."""
    hoje = date.today()
    paradas: dict[tuple[str, int], dict] = {}

    def parada(tipo: str, cid: int, nome: str, cidade: str | None, endereco: str | None, telefone: str | None, vend: str | None) -> dict:
        return paradas.setdefault((tipo, cid), {
            "cliente_id": cid, "tipo": tipo, "nome": nome, "cidade": (cidade or "").strip() or None, "endereco": endereco,
            "telefone": telefone, "vendedor": vend, "motivos": [], "potencial_mensal": 0.0, "vencido": 0.0,
            "volume_estimado_kg_mes": None, "curva": "-",
        })

    for c in _calcular_recompra(db, **_PADRAO)["clientes"]:
        if c["situacao"] in ("atrasado", "atencao"):
            p = parada("cliente", c["cliente_id"], c["nome"], c["cidade"], c["endereco"], c["telefone"], c["vendedor"])
            p["motivos"].append(f"Recompra: {c['dias_sem_comprar']} d sem comprar (limite {c['limite_dias']} d)")
            p["potencial_mensal"] = c["potencial_mensal"] or 0.0
            p["curva"] = c["curva"]
        if c["vencido"] > 0:
            p = parada("cliente", c["cliente_id"], c["nome"], c["cidade"], c["endereco"], c["telefone"], c["vendedor"])
            p["motivos"].append(f"Cobrança: {c['vencido']:.2f} vencido".replace(".", ","))
            p["vencido"] = c["vencido"]
            p["curva"] = c["curva"]
    for r in db.execute(text("""
        SELECT c.id, c.nome, c.cidade, c.endereco, c.contato, c.fase, c.volume_estimado_kg_mes, vd.nome AS vendedor
        FROM cliente c LEFT JOIN vendedor vd ON vd.id = c.vendedor_id
        WHERE c.ativo AND NOT c.e_cliente AND COALESCE(c.fase, '') <> :perdido
    """), {"perdido": FASE_PERDIDO}).mappings().all():
        p = parada("prospecto", r["id"], r["nome"], r["cidade"], r["endereco"], r["contato"], r["vendedor"])
        p["motivos"].append(f"Prospecção: {r['fase'] or 'Novo'}")
        p["volume_estimado_kg_mes"] = float(r["volume_estimado_kg_mes"]) if r["volume_estimado_kg_mes"] is not None else None
    for r in db.execute(text("""
        SELECT c.id, c.nome, c.cidade, c.endereco, c.contato, c.e_cliente, c.proxima_acao, c.proxima_acao_data, vd.nome AS vendedor
        FROM cliente c LEFT JOIN vendedor vd ON vd.id = c.vendedor_id
        WHERE c.ativo AND c.proxima_acao_data IS NOT NULL AND c.proxima_acao_data <= :ate AND COALESCE(c.fase, '') <> :perdido
    """), {"ate": hoje + timedelta(days=7), "perdido": FASE_PERDIDO}).mappings().all():
        p = parada("cliente" if r["e_cliente"] else "prospecto", r["id"], r["nome"], r["cidade"], r["endereco"], r["contato"], r["vendedor"])
        p["motivos"].append(f"Ação marcada {r['proxima_acao_data']:%d/%m}: {r['proxima_acao'] or '—'}")

    lista = [p for p in paradas.values() if not vendedor or (p["vendedor"] or "").lower() == vendedor.lower()]
    cidades: dict[str, dict] = {}
    for p in lista:
        chave = p["cidade"] or "Sem cidade"
        c = cidades.setdefault(chave, {"cidade": chave, "paradas": [], "potencial_mensal": 0.0, "vencido": 0.0, "prospectos": 0})
        c["paradas"].append(p)
        c["potencial_mensal"] += p["potencial_mensal"]
        c["vencido"] += p["vencido"]
        c["prospectos"] += 1 if p["tipo"] == "prospecto" else 0
    for c in cidades.values():
        c["paradas"].sort(key=lambda p: -(p["potencial_mensal"] + p["vencido"]))
        c["potencial_mensal"] = round(c["potencial_mensal"], 2)
        c["vencido"] = round(c["vencido"], 2)
    ordenadas = sorted(cidades.values(), key=lambda c: (c["cidade"] == "Sem cidade", -(c["potencial_mensal"] + c["vencido"]), -len(c["paradas"])))
    vendedores = sorted({p["vendedor"] for p in paradas.values() if p["vendedor"]})
    return {"cidades": ordenadas, "vendedores": vendedores, "total_paradas": len(lista)}
