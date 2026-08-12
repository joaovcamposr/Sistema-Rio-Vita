"""
Painéis gerenciais — somente leitura. Nenhum endpoint aqui grava dado;
tudo é derivado das mesmas tabelas que os módulos operacionais alimentam.
"""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas import (
    AbateOut,
    AcertoDiferencaOut,
    AcertoResumoOut,
    AguaPontoOut,
    AguaViveiroOut,
    ArracoamentoDetalheOut,
    ArracoamentoPrevistoDiaOut,
    CaixaDiaOut,
    CaixaResumoOut,
    ComercialResumoOut,
    ComercialSerieBucketOut,
    ComercialSerieOut,
    DashboardOut,
    DespescaDetalheOut,
    DespescaPreviaOut,
    EstoqueItemOut,
    EventoProjetadoOut,
    ExpedicaoAbertaOut,
    HistoricoLoteOut,
    ItemRepicagemOut,
    LoteAtual,
    MisturaOut,
    MortalidadeLoteOut,
    MortalidadeResumoOut,
    NivelDespescaOut,
    NivelRepicagemOut,
    PainelViveiroOut,
    PontoHistoricoLoteOut,
    EstoqueRacaoOut,
    EstoqueRacaoTipoOut,
    ProducaoDetalheOut,
    ProducaoDiaOut,
    ProducaoPorProdutoOut,
    ProducaoResumoOut,
    ProducaoSerieBucketOut,
    ProducaoSerieOut,
    ProjecaoCapacidadeOut,
    RepicagemDetalheOut,
    SerieBucketProdutoOut,
    SerieDiariaOut,
    ProducaoSerieBucketProdutoOut,
    SugestaoRepicagemGeralOut,
    TabelaArracoamentoLinhaOut,
    TratoPrevistoOut,
    UltimaAgua,
    UltimaBiometria,
    VendaClienteProdutoOut,
    VendaPorClienteOut,
    VendaPorProdutoOut,
    ViveiroAlertaOut,
)

router = APIRouter(prefix="/paineis", tags=["paineis"])

# Semana da curva de crescimento em que o peso final ultrapassa 800g — o
# mesmo limite fixo (26) usado pela aba "Programação de abate" da planilha
# original para todos os viveiros.
SEMANA_LIMITE_ABATE = 26

_BUCKET_SQL = {
    "dia": "to_char(%s, 'YYYY-MM-DD')",
    "mes": "to_char(%s, 'YYYY-MM')",
    "ano": "to_char(%s, 'YYYY')",
}
_DIAS_PADRAO_POR_GRANULARIDADE = {"dia": 30, "mes": 365, "ano": 365 * 3}


def _f(v) -> float | None:
    return float(v) if v is not None else None


def _bucket_expr(granularidade: str, coluna: str) -> str:
    if granularidade not in _BUCKET_SQL:
        raise HTTPException(422, "granularidade deve ser dia, mes ou ano")
    return _BUCKET_SQL[granularidade] % coluna


def _periodo_padrao(de: date | None, ate: date | None, granularidade: str) -> tuple[date, date]:
    ate = ate or date.today()
    de = de or (ate - timedelta(days=_DIAS_PADRAO_POR_GRANULARIDADE.get(granularidade, 30)))
    return de, ate


def _carregar_curva(db: Session) -> list[dict]:
    rows = db.execute(text("SELECT semana, peso_final_g FROM tabela_crescimento ORDER BY semana")).mappings().all()
    return [{"semana": r["semana"], "peso_final_g": float(r["peso_final_g"])} for r in rows]


def _semana_para_peso(curva: list[dict], peso: float) -> int:
    """Primeira semana da curva cujo peso final já alcança `peso` — mesma
    regra usada pela Programação de abate da planilha original."""
    for c in curva:
        if c["peso_final_g"] >= peso:
            return c["semana"]
    return curva[-1]["semana"]


def _peso_para_semana(curva: list[dict], semana: int) -> float:
    semana = max(curva[0]["semana"], min(semana, curva[-1]["semana"]))
    for c in curva:
        if c["semana"] == semana:
            return c["peso_final_g"]
    return curva[-1]["peso_final_g"]


def _buscar_parametro(db: Session, chave: str, padrao: float) -> float:
    row = db.execute(text("SELECT valor FROM parametro WHERE chave = :chave"), {"chave": chave}).scalar()
    return float(row) if row is not None else padrao


def _limites_densidade(db: Session) -> dict[str, float]:
    """Pré-engorda e engorda têm limites de densidade próprios — peixe
    jovem e adulto toleram cargas bem diferentes por m²."""
    return {
        "pre_engorda": _buscar_parametro(db, "limite_densidade_pre_engorda_kg_m2", 2.5),
        "engorda": _buscar_parametro(db, "limite_densidade_engorda_kg_m2", 2.5),
    }


def _limite_de(limites: dict[str, float], tipo: str) -> float:
    return limites.get(tipo, 2.5)


def _chave_ordem_viveiro(codigo: str) -> tuple:
    """PE1..PE5 primeiro, depois os numéricos em ordem crescente (1, 2,
    ..., 11.1, 11.2, 12.1, ..., 24), com DEC por último — não a ordem
    alfabética do texto (que colocaria '10' antes de '2')."""
    if codigo.startswith("PE"):
        return (0, int(codigo[2:]), 0)
    if codigo == "DEC":
        return (2, 0, 0)
    partes = codigo.split(".")
    principal = int(partes[0])
    sub = int(partes[1]) if len(partes) > 1 else 0
    return (1, principal, sub)


def _calcular_indicadores_lote(
    curva: list[dict], hoje: date, data_inicio: date, quantidade_inicial: int, peso_medio_inicial_g: float,
    data_biometria: date, peso_biometria_g: float, saldo_un: int, area_m2: float, racao_acumulada_kg: float | None,
) -> dict:
    """Reconstrói o que a planilha fazia à mão: projeta o peso de hoje a
    partir da última biometria + curva de crescimento, compara com o peso
    que a curva prometia partindo do peso de entrada do lote nesse viveiro,
    e deriva densidade em biomassa e conversão alimentar a partir dessa
    projeção.

    A idade do lote (data_inicio) é a data em que ele entrou NESSE viveiro,
    não o nascimento do peixe — lotes de engorda chegam com peixe já
    grande, transferido da pré-engorda. Por isso o "esperado pela idade"
    parte do peso inicial do lote na curva, não da semana 1 (peixe
    recém-nascido); do contrário, todo lote de engorda apareceria com peso
    esperado absurdamente baixo.
    """
    semana_maxima = curva[-1]["semana"]

    semana_biometria = _semana_para_peso(curva, peso_biometria_g)
    semanas_decorridas = max(0, (hoje - data_biometria).days // 7)
    semana_projetada = min(semana_biometria + semanas_decorridas, semana_maxima)
    peso_estimado_hoje_g = _peso_para_semana(curva, semana_projetada)

    idade_semanas = max(1, min((hoje - data_inicio).days // 7, semana_maxima))

    semana_inicial = _semana_para_peso(curva, peso_medio_inicial_g)
    semanas_desde_inicio = max(0, (hoje - data_inicio).days // 7)
    semana_esperada = min(semana_inicial + semanas_desde_inicio, semana_maxima)
    peso_esperado_pela_idade_g = _peso_para_semana(curva, semana_esperada)

    if semana_projetada < semana_esperada:
        cor = "vermelho"
    elif semana_projetada > semana_esperada:
        cor = "verde"
    else:
        cor = "amarelo"

    biomassa_atual_kg = saldo_un * peso_estimado_hoje_g / 1000
    biomassa_inicial_kg = quantidade_inicial * peso_medio_inicial_g / 1000
    ganho_biomassa_kg = biomassa_atual_kg - biomassa_inicial_kg
    densidade_kg_m2 = biomassa_atual_kg / area_m2 if area_m2 else None
    conversao_alimentar = (
        racao_acumulada_kg / ganho_biomassa_kg if racao_acumulada_kg and ganho_biomassa_kg > 0 else None
    )

    return {
        "idade_semanas": idade_semanas,
        "peso_estimado_hoje_g": peso_estimado_hoje_g,
        "peso_esperado_pela_idade_g": peso_esperado_pela_idade_g,
        "cor_crescimento": cor,
        "densidade_kg_m2": densidade_kg_m2,
        "conversao_alimentar": conversao_alimentar,
        "biomassa_atual_kg": biomassa_atual_kg,
        "ganho_biomassa_kg": ganho_biomassa_kg,
    }


@router.get("/viveiros", response_model=list[PainelViveiroOut])
def painel_viveiros(db: Session = Depends(get_db)):
    curva = _carregar_curva(db)
    rows = db.execute(text("""
        SELECT v.id, v.codigo, v.tipo, v.area_m2,
               l.id AS lote_id, l.codigo AS lote_codigo, l.fase AS lote_fase,
               l.data_inicio AS lote_data_inicio, l.quantidade_inicial, l.peso_medio_inicial_g,
               s.saldo_un,
               b.data AS biometria_data, b.peso_medio_g AS biometria_peso,
               a.data AS agua_data, a.oxigenio, a.temperatura_c, a.amonia,
               a.ph, a.nitrito, a.nitrato, r.sacos_total
        FROM viveiro v
        LEFT JOIN lote l ON l.viveiro_id = v.id AND l.data_fim IS NULL
        LEFT JOIN vw_saldo_lote s ON s.lote_id = l.id
        LEFT JOIN LATERAL (
          SELECT data, peso_medio_g FROM biometria
          WHERE lote_id = l.id ORDER BY data DESC LIMIT 1
        ) b ON true
        LEFT JOIN LATERAL (
          SELECT data, oxigenio, temperatura_c, amonia, ph, nitrito, nitrato
          FROM analise_agua WHERE viveiro_id = v.id ORDER BY data DESC LIMIT 1
        ) a ON true
        LEFT JOIN LATERAL (
          SELECT SUM(sacos) * 25 AS sacos_total FROM arracoamento WHERE lote_id = l.id AND excluido_em IS NULL
        ) r ON true
        WHERE v.ativo
    """)).mappings().all()
    rows = sorted(rows, key=lambda r: _chave_ordem_viveiro(r["codigo"]))

    hoje = date.today()
    out = []
    for r in rows:
        lote_atual = None
        idade_dias = None
        indicadores: dict = {}
        if r["lote_id"] is not None:
            lote_atual = LoteAtual(
                id=r["lote_id"], codigo=r["lote_codigo"], fase=r["lote_fase"], saldo_un=r["saldo_un"],
                data_inicio=r["lote_data_inicio"], quantidade_inicial=r["quantidade_inicial"],
                peso_medio_inicial_g=float(r["peso_medio_inicial_g"]),
            )
            idade_dias = (hoje - r["lote_data_inicio"]).days
            data_biometria = r["biometria_data"] or r["lote_data_inicio"]
            peso_biometria = float(r["biometria_peso"]) if r["biometria_peso"] is not None else float(r["peso_medio_inicial_g"])
            indicadores = _calcular_indicadores_lote(
                curva, hoje, r["lote_data_inicio"], r["quantidade_inicial"], float(r["peso_medio_inicial_g"]),
                data_biometria, peso_biometria, r["saldo_un"], float(r["area_m2"]), _f(r["sacos_total"]),
            )
        ultima_biometria = None
        if r["biometria_data"] is not None:
            ultima_biometria = UltimaBiometria(
                data=r["biometria_data"], peso_medio_g=float(r["biometria_peso"]),
                dias_atras=(hoje - r["biometria_data"]).days,
            )
        ultima_agua = None
        if r["agua_data"] is not None:
            ultima_agua = UltimaAgua(
                data=r["agua_data"], oxigenio=_f(r["oxigenio"]), temperatura_c=_f(r["temperatura_c"]),
                amonia=_f(r["amonia"]), ph=_f(r["ph"]), nitrito=_f(r["nitrito"]), nitrato=_f(r["nitrato"]),
            )
        out.append(PainelViveiroOut(
            id=r["id"], codigo=r["codigo"], tipo=r["tipo"], area_m2=float(r["area_m2"]),
            lote_atual=lote_atual, data_inicio_lote=r["lote_data_inicio"], idade_dias=idade_dias,
            idade_semanas=indicadores.get("idade_semanas"),
            peso_estimado_hoje_g=indicadores.get("peso_estimado_hoje_g"),
            peso_esperado_pela_idade_g=indicadores.get("peso_esperado_pela_idade_g"),
            cor_crescimento=indicadores.get("cor_crescimento"),
            densidade_kg_m2=indicadores.get("densidade_kg_m2"),
            conversao_alimentar=indicadores.get("conversao_alimentar"),
            biomassa_atual_kg=indicadores.get("biomassa_atual_kg"),
            ganho_biomassa_kg=indicadores.get("ganho_biomassa_kg"),
            racao_acumulada_kg=_f(r["sacos_total"]),
            ultima_biometria=ultima_biometria, ultima_agua=ultima_agua,
        ))
    return out


@router.get("/abate", response_model=list[AbateOut])
def painel_abate(db: Session = Depends(get_db)):
    curva = _carregar_curva(db)

    rows = db.execute(text("""
        SELECT l.id, l.codigo, l.fase, v.codigo AS viveiro_codigo, s.saldo_un,
               COALESCE(b.data, l.data_inicio) AS data_biometria,
               COALESCE(b.peso_medio_g, l.peso_medio_inicial_g) AS peso_medio_g
        FROM lote l
        JOIN viveiro v ON v.id = l.viveiro_id
        JOIN vw_saldo_lote s ON s.lote_id = l.id
        LEFT JOIN LATERAL (
          SELECT data, peso_medio_g FROM biometria
          WHERE lote_id = l.id ORDER BY data DESC LIMIT 1
        ) b ON true
        WHERE l.data_fim IS NULL
        ORDER BY v.codigo
    """)).mappings().all()

    hoje = date.today()
    out = []
    for r in rows:
        peso = float(r["peso_medio_g"])
        semana_atual = _semana_para_peso(curva, peso)
        pronto = semana_atual >= SEMANA_LIMITE_ABATE
        previsao = None if pronto else hoje + timedelta(weeks=SEMANA_LIMITE_ABATE - semana_atual)
        out.append(AbateOut(
            lote_id=r["id"], lote_codigo=r["codigo"], fase=r["fase"], viveiro_codigo=r["viveiro_codigo"],
            quantidade_un=r["saldo_un"], peso_medio_g=peso, data_biometria=r["data_biometria"],
            semana_atual=semana_atual, semana_limite=SEMANA_LIMITE_ABATE,
            previsao_abate=previsao, pronto=pronto,
        ))

    out.sort(key=lambda a: (0 if a.pronto else 1, a.previsao_abate or hoje))
    return out


def _rendimento_por_destino(db: Session, de: date, ate: date, like_padrao: str, destino: str) -> float | None:
    """Mesmo racional do rendimento de filé: por lote+data de despesca,
    quanto do peso despescado (naquele destino) virou produto acabado
    daquela família — evita contar o mesmo peso despescado mais de uma
    vez quando há mais de um produto por lote/data."""
    return db.execute(text("""
        SELECT SUM(kg_produto) / NULLIF(SUM(kg_desp), 0) AS rendimento
        FROM (
          SELECT p.lote_id, p.data_despesca,
                 SUM(p.quantidade_kg) FILTER (WHERE pr.nome LIKE :like_padrao) AS kg_produto,
                 MAX(d.kg_desp) AS kg_desp
          FROM producao p
          JOIN produto pr ON pr.id = p.produto_id
          JOIN LATERAL (
            SELECT SUM(peso_total_kg) AS kg_desp FROM despesca
            WHERE lote_id = p.lote_id AND data = p.data_despesca AND destino = :destino AND excluido_em IS NULL
          ) d ON true
          WHERE p.data_despesca BETWEEN :de AND :ate
          GROUP BY p.lote_id, p.data_despesca
        ) batch
    """), {"de": de, "ate": ate, "like_padrao": like_padrao, "destino": destino}).scalar()


@router.get("/producao/detalhe", response_model=list[ProducaoDetalheOut])
def painel_producao_detalhe(
    de: date | None = Query(default=None),
    ate: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Uma linha por lançamento de produção, com o rendimento e a despesca
    de origem — rendimento é por família de produto (Filé, Postas, Tilápia
    limpa), cada uma contra o peso despescado do seu próprio destino;
    linhas da mesma família e mesmo lote/data de despesca compartilham o
    valor (é uma conta do lote, não da linha), mas famílias diferentes já
    não têm mais o mesmo número."""
    ate = ate or date.today()
    de = de or (ate - timedelta(days=30))
    rows = db.execute(text("""
        SELECT d.data, pr.nome AS produto_nome, d.quantidade_kg,
               l.codigo AS lote_codigo, v.codigo AS viveiro_codigo,
               d.data_despesca, d.peso_medio_suja_g, d.rendimento
        FROM vw_producao_detalhe d
        JOIN produto pr ON pr.id = d.produto_id
        LEFT JOIN lote l ON l.id = d.lote_id
        LEFT JOIN viveiro v ON v.id = l.viveiro_id
        WHERE d.data BETWEEN :de AND :ate
        ORDER BY d.data DESC, d.id DESC
    """), {"de": de, "ate": ate}).mappings().all()
    return [ProducaoDetalheOut(**r) for r in rows]


@router.get("/despesca", response_model=list[DespescaDetalheOut])
def painel_despesca(
    de: date | None = Query(default=None),
    ate: date | None = Query(default=None),
    excluidos: bool = Query(default=False, description="true = só as excluídas (tela de restaurar)"),
    db: Session = Depends(get_db),
):
    """Uma linha por lançamento de despesca — tela de conferência, com
    opção de corrigir cada lançamento (PATCH /despescas/{id})."""
    ate = ate or date.today()
    de = de or (ate - timedelta(days=30))
    rows = db.execute(text(f"""
        SELECT d.id, d.data, d.destino, d.quantidade_un, d.peso_medio_g, d.peso_total_kg,
               d.lote_id, l.codigo AS lote_codigo, v.codigo AS viveiro_codigo, d.criado_em,
               d.excluido_em, d.excluido_por
        FROM despesca d
        JOIN lote l ON l.id = d.lote_id
        JOIN viveiro v ON v.id = l.viveiro_id
        WHERE d.data BETWEEN :de AND :ate
          AND {"d.excluido_em IS NOT NULL" if excluidos else "d.excluido_em IS NULL"}
        ORDER BY d.data DESC, d.id DESC
    """), {"de": de, "ate": ate}).mappings().all()
    return [DespescaDetalheOut(**r) for r in rows]


@router.get("/repicagem", response_model=list[RepicagemDetalheOut])
def painel_repicagem(
    de: date | None = Query(default=None),
    ate: date | None = Query(default=None),
    excluidos: bool = Query(default=False, description="true = só as excluídas (tela de restaurar)"),
    db: Session = Depends(get_db),
):
    """Uma linha por repicagem já lançada — tela de conferência, com
    opção de corrigir cada lançamento (PATCH /repicagens/{lote_id}/{lote_origem_id})."""
    ate = ate or date.today()
    de = de or (ate - timedelta(days=30))
    rows = db.execute(text(f"""
        SELECT o.lote_id, o.lote_origem_id, o.data, o.quantidade, o.peso_medio_g,
               ld.codigo AS lote_destino_codigo, vd.codigo AS viveiro_destino_codigo,
               lo.codigo AS lote_origem_codigo, vo.codigo AS viveiro_origem_codigo,
               (lo.data_fim IS NOT NULL) AS lote_origem_fechado,
               o.excluido_em, o.excluido_por
        FROM lote_origem o
        JOIN lote ld ON ld.id = o.lote_id
        JOIN viveiro vd ON vd.id = ld.viveiro_id
        JOIN lote lo ON lo.id = o.lote_origem_id
        JOIN viveiro vo ON vo.id = lo.viveiro_id
        WHERE o.data BETWEEN :de AND :ate
          AND {"o.excluido_em IS NOT NULL" if excluidos else "o.excluido_em IS NULL"}
        ORDER BY o.data DESC, o.lote_id DESC
    """), {"de": de, "ate": ate}).mappings().all()
    return [RepicagemDetalheOut(**r) for r in rows]


@router.get("/arracoamento", response_model=list[ArracoamentoDetalheOut])
def painel_arracoamento(
    de: date | None = Query(default=None),
    ate: date | None = Query(default=None),
    excluidos: bool = Query(default=False, description="true = só os excluídos (tela de restaurar)"),
    db: Session = Depends(get_db),
):
    """Uma linha por lançamento de arraçoamento — tela de conferência, com
    opção de corrigir cada lançamento (PATCH /arracoamento/{id})."""
    ate = ate or date.today()
    de = de or (ate - timedelta(days=30))
    rows = db.execute(text(f"""
        SELECT a.id, a.data, to_char(a.trato, 'HH24:MI') AS trato, a.sacos, a.tipo_racao_id, t.codigo AS tipo_racao_codigo,
               a.lote_id, l.codigo AS lote_codigo, v.codigo AS viveiro_codigo, a.criado_em,
               a.excluido_em, a.excluido_por
        FROM arracoamento a
        JOIN lote l ON l.id = a.lote_id
        JOIN viveiro v ON v.id = l.viveiro_id
        LEFT JOIN tipo_racao t ON t.id = a.tipo_racao_id
        WHERE a.data BETWEEN :de AND :ate
          AND {"a.excluido_em IS NOT NULL" if excluidos else "a.excluido_em IS NULL"}
        ORDER BY a.data DESC, a.id DESC
    """), {"de": de, "ate": ate}).mappings().all()
    return [ArracoamentoDetalheOut(**r) for r in rows]


@router.get("/producao", response_model=ProducaoResumoOut)
def painel_producao(
    de: date | None = Query(default=None),
    ate: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ate = ate or date.today()
    de = de or (ate - timedelta(days=30))

    por_produto = db.execute(text("""
        SELECT p.produto_id, pr.nome AS produto_nome, SUM(p.quantidade_kg) AS quantidade_kg
        FROM producao p JOIN produto pr ON pr.id = p.produto_id
        WHERE p.data BETWEEN :de AND :ate
        GROUP BY p.produto_id, pr.nome
        ORDER BY pr.nome
    """), {"de": de, "ate": ate}).mappings().all()

    peso_sujo = db.execute(text("""
        SELECT SUM(quantidade_un * peso_medio_g) / NULLIF(SUM(quantidade_un), 0) AS peso_medio_suja_g
        FROM despesca WHERE data BETWEEN :de AND :ate AND excluido_em IS NULL
    """), {"de": de, "ate": ate}).mappings().first()

    familias = db.execute(text("""
        SELECT
          COALESCE(SUM(quantidade_kg) FILTER (WHERE pr.nome LIKE 'Filé%'), 0) AS file_kg,
          COALESCE(SUM(quantidade_kg) FILTER (WHERE pr.nome LIKE 'Postas%'), 0) AS postas_kg,
          COALESCE(SUM(quantidade_kg) FILTER (WHERE pr.nome LIKE 'Tilápia limpa%'), 0) AS limpa_kg
        FROM producao p JOIN produto pr ON pr.id = p.produto_id
        WHERE p.data BETWEEN :de AND :ate
    """), {"de": de, "ate": ate}).mappings().first()

    rendimento_file = _rendimento_por_destino(db, de, ate, "Filé%", "file")
    rendimento_postas = _rendimento_por_destino(db, de, ate, "Postas%", "postas")
    rendimento_limpa = _rendimento_por_destino(db, de, ate, "Tilápia limpa%", "inteira_limpa")

    return ProducaoResumoOut(
        de=de, ate=ate,
        por_produto=[
            ProducaoPorProdutoOut(produto_id=r["produto_id"], produto_nome=r["produto_nome"],
                                   quantidade_kg=float(r["quantidade_kg"]))
            for r in por_produto
        ],
        produzido_file_kg=float(familias["file_kg"]),
        produzido_postas_kg=float(familias["postas_kg"]),
        produzido_tilapia_limpa_kg=float(familias["limpa_kg"]),
        peso_medio_suja_ponderado_g=_f(peso_sujo["peso_medio_suja_g"]),
        rendimento_medio_ponderado_file=_f(rendimento_file),
        rendimento_medio_ponderado_postas=_f(rendimento_postas),
        rendimento_medio_ponderado_tilapia_limpa=_f(rendimento_limpa),
    )


@router.get("/estoque", response_model=list[EstoqueItemOut])
def painel_estoque(
    de: date | None = Query(default=None),
    ate: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    # estoque é, por natureza, um saldo acumulado — o período aqui filtra
    # os MOVIMENTOS (produção/venda/ajuste) considerados no cálculo, não
    # troca o conceito de saldo. Sem filtro, cobre todo o histórico.
    ate = ate or date.today()
    de = de or date(2020, 1, 1)

    rows = db.execute(text("""
        SELECT pr.id, pr.nome, pr.fator_kg,
               COALESCE(prod.embalagens, 0) AS produzido_un, COALESCE(prod.kg, 0) AS produzido_kg,
               COALESCE(vend.un, 0) AS vendido_un, COALESCE(vend.kg, 0) AS vendido_kg,
               COALESCE(transito.embalagens, 0) AS em_transito_un, COALESCE(transito.kg, 0) AS em_transito_kg,
               COALESCE(ajuste.embalagens, 0) AS ajustado_un, COALESCE(ajuste.kg, 0) AS ajustado_kg
        FROM produto pr
        LEFT JOIN (
          SELECT produto_id, SUM(quantidade_embalagens) AS embalagens, SUM(quantidade_kg) AS kg
          FROM producao WHERE data BETWEEN :de AND :ate GROUP BY produto_id
        ) prod ON prod.produto_id = pr.id
        LEFT JOIN (
          SELECT produto_id, SUM(quantidade_un) AS un, SUM(quantidade_kg) AS kg
          FROM venda WHERE data BETWEEN :de AND :ate AND excluido_em IS NULL GROUP BY produto_id
        ) vend ON vend.produto_id = pr.id
        LEFT JOIN (
          SELECT ei.produto_id, SUM(ei.quantidade_embalagens) AS embalagens, SUM(ei.quantidade_kg) AS kg
          FROM expedicao_item ei JOIN expedicao ex ON ex.id = ei.expedicao_id
          WHERE ex.data_acerto IS NULL
          GROUP BY ei.produto_id
        ) transito ON transito.produto_id = pr.id
        LEFT JOIN (
          SELECT produto_id, SUM(quantidade_embalagens) AS embalagens, SUM(quantidade_kg) AS kg
          FROM ajuste_estoque WHERE data BETWEEN :de AND :ate GROUP BY produto_id
        ) ajuste ON ajuste.produto_id = pr.id
        -- Tilápia suja não passa por Produção (vai direto da despesca pra
        -- venda), então "produzido - vendido" não representa estoque real
        -- pra ela — fica de fora desse painel
        WHERE pr.ativo AND pr.nome NOT ILIKE '%suja%'
        ORDER BY pr.nome
    """), {"de": de, "ate": ate}).mappings().all()

    out = []
    for r in rows:
        # "un" existe pra todo produto (contagem real de embalagens ou, no
        # caso de Kg digitado como Tilápia limpa, de peixes) — só não tem
        # fator_kg fixo pra converter em Kg automaticamente
        produzido_un = _f(r["produzido_un"])
        vendido_un = _f(r["vendido_un"])
        em_transito_un = _f(r["em_transito_un"])
        ajustado_un = _f(r["ajustado_un"])
        saldo_un = produzido_un - vendido_un - em_transito_un - ajustado_un
        out.append(EstoqueItemOut(
            id=r["id"], nome=r["nome"], fator_kg=_f(r["fator_kg"]),
            produzido_un=produzido_un, vendido_un=vendido_un,
            em_transito_un=em_transito_un, ajustado_un=ajustado_un, saldo_un=saldo_un,
            produzido_kg=float(r["produzido_kg"]), vendido_kg=float(r["vendido_kg"]),
            em_transito_kg=float(r["em_transito_kg"]), ajustado_kg=float(r["ajustado_kg"]),
            saldo_kg=float(r["produzido_kg"]) - float(r["vendido_kg"])
                     - float(r["em_transito_kg"]) - float(r["ajustado_kg"]),
        ))
    return out


@router.get("/mortalidade", response_model=MortalidadeResumoOut)
def painel_mortalidade(db: Session = Depends(get_db)):
    """Um lote fechado só sai do viveiro por despesca (engorda) ou por
    repicagem (pré-engorda) — ambas contabilizadas em vw_saldo_lote. O que
    sobra no saldo depois de fechado é peixe que nunca foi contado na
    saída: mortalidade da fase (ver Etapa 1, pedido do usuário)."""
    rows = db.execute(text("""
        SELECT l.id, l.codigo, l.fase, v.codigo AS viveiro_codigo, l.data_inicio, l.data_fim,
               l.quantidade_inicial, s.saldo_un
        FROM lote l
        JOIN viveiro v ON v.id = l.viveiro_id
        JOIN vw_saldo_lote s ON s.lote_id = l.id
        WHERE l.data_fim IS NOT NULL
        ORDER BY l.data_fim DESC
    """)).mappings().all()

    lotes = []
    somas = {"pre_engorda": [0, 0], "engorda": [0, 0]}
    for r in rows:
        perdida = r["saldo_un"]
        inicial = r["quantidade_inicial"]
        taxa = perdida / inicial if inicial else 0.0
        somas[r["fase"]][0] += perdida
        somas[r["fase"]][1] += inicial
        lotes.append(MortalidadeLoteOut(
            lote_id=r["id"], lote_codigo=r["codigo"], fase=r["fase"], viveiro_codigo=r["viveiro_codigo"],
            data_inicio=r["data_inicio"], data_fim=r["data_fim"],
            dias=(r["data_fim"] - r["data_inicio"]).days,
            quantidade_inicial=inicial, quantidade_perdida=perdida, taxa=taxa,
        ))

    def media(fase: str) -> float | None:
        perdida, inicial = somas[fase]
        return perdida / inicial if inicial else None

    return MortalidadeResumoOut(
        taxa_media_pre_engorda=media("pre_engorda"), taxa_media_engorda=media("engorda"), lotes=lotes,
    )


@router.get("/comercial", response_model=ComercialResumoOut)
def painel_comercial(
    de: date | None = Query(default=None),
    ate: date | None = Query(default=None),
    vendedor: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ate = ate or date.today()
    de = de or (ate - timedelta(days=30))
    params = {"de": de, "ate": ate, "vendedor": vendedor}
    filtro_vendedor = "AND (CAST(:vendedor AS text) IS NULL OR v.vendedor = :vendedor) AND v.excluido_em IS NULL"

    por_produto = db.execute(text(f"""
        SELECT v.produto_id, pr.nome AS produto_nome,
               SUM(v.quantidade_kg) AS quantidade_kg, SUM(v.valor_total) AS valor_total
        FROM venda v JOIN produto pr ON pr.id = v.produto_id
        WHERE v.data BETWEEN :de AND :ate {filtro_vendedor}
        GROUP BY v.produto_id, pr.nome ORDER BY pr.nome
    """), params).mappings().all()

    por_cliente = db.execute(text(f"""
        SELECT v.cliente_id, COALESCE(c.nome, 'Consumidor final') AS cliente_nome,
               SUM(v.quantidade_kg) AS quantidade_kg, SUM(v.valor_total) AS valor_total
        FROM venda v LEFT JOIN cliente c ON c.id = v.cliente_id
        WHERE v.data BETWEEN :de AND :ate {filtro_vendedor}
        GROUP BY v.cliente_id, c.nome ORDER BY valor_total DESC
    """), params).mappings().all()

    por_cliente_file = db.execute(text(f"""
        SELECT v.cliente_id, SUM(v.quantidade_kg) AS kg, SUM(v.valor_total) AS valor
        FROM venda v JOIN produto pr ON pr.id = v.produto_id
        WHERE v.data BETWEEN :de AND :ate AND pr.nome LIKE 'Filé%' {filtro_vendedor}
        GROUP BY v.cliente_id
    """), params).mappings().all()
    file_por_cliente = {r["cliente_id"]: (float(r["kg"]), float(r["valor"])) for r in por_cliente_file}

    por_cliente_produto = db.execute(text(f"""
        SELECT v.cliente_id, v.produto_id, pr.nome AS produto_nome,
               SUM(v.quantidade_kg) AS quantidade_kg, SUM(v.valor_total) AS valor_total
        FROM venda v JOIN produto pr ON pr.id = v.produto_id
        WHERE v.data BETWEEN :de AND :ate {filtro_vendedor}
        GROUP BY v.cliente_id, v.produto_id, pr.nome
    """), params).mappings().all()
    produtos_por_cliente: dict[int | None, list[VendaClienteProdutoOut]] = {}
    for r in por_cliente_produto:
        kg = float(r["quantidade_kg"])
        if kg <= 0:
            continue
        produtos_por_cliente.setdefault(r["cliente_id"], []).append(VendaClienteProdutoOut(
            produto_id=r["produto_id"], produto_nome=r["produto_nome"],
            quantidade_kg=kg, valor_total=float(r["valor_total"]),
            preco_medio_ponderado=float(r["valor_total"]) / kg,
        ))

    totais = db.execute(text(f"""
        SELECT COALESCE(SUM(quantidade_kg), 0) AS kg, COALESCE(SUM(valor_total), 0) AS valor
        FROM venda v WHERE data BETWEEN :de AND :ate {filtro_vendedor}
    """), params).mappings().first()

    file_totais = db.execute(text(f"""
        SELECT COALESCE(SUM(v.quantidade_kg), 0) AS kg, COALESCE(SUM(v.valor_total), 0) AS valor
        FROM venda v JOIN produto pr ON pr.id = v.produto_id
        WHERE v.data BETWEEN :de AND :ate AND pr.nome LIKE 'Filé%' {filtro_vendedor}
    """), params).mappings().first()
    file_kg = float(file_totais["kg"])
    file_preco_medio_ponderado = float(file_totais["valor"]) / file_kg if file_kg > 0 else None

    return ComercialResumoOut(
        de=de, ate=ate,
        quantidade_kg_total=float(totais["kg"]), valor_total=float(totais["valor"]),
        por_produto=[
            VendaPorProdutoOut(produto_id=r["produto_id"], produto_nome=r["produto_nome"],
                                quantidade_kg=float(r["quantidade_kg"]), valor_total=float(r["valor_total"]))
            for r in por_produto
        ],
        por_cliente=[
            VendaPorClienteOut(
                cliente_id=r["cliente_id"], cliente_nome=r["cliente_nome"],
                quantidade_kg=float(r["quantidade_kg"]), valor_total=float(r["valor_total"]),
                preco_medio_ponderado_file=(
                    file_por_cliente[r["cliente_id"]][1] / file_por_cliente[r["cliente_id"]][0]
                    if r["cliente_id"] in file_por_cliente and file_por_cliente[r["cliente_id"]][0] > 0
                    else None
                ),
                por_produto=produtos_por_cliente.get(r["cliente_id"], []),
            )
            for r in por_cliente
        ],
        file_kg_total=file_kg, file_preco_medio_ponderado=file_preco_medio_ponderado,
    )


@router.get("/comercial/serie", response_model=ComercialSerieOut)
def painel_comercial_serie(
    granularidade: str = Query(default="dia"),
    de: date | None = Query(default=None),
    ate: date | None = Query(default=None),
    cliente_id: int | None = Query(default=None),
    vendedor: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Alimenta os gráficos de volume vendido, faturamento e preço médio
    ponderado por produto — cada um quebrado por dia/mês/ano, com filtro
    opcional por cliente e por vendedor."""
    de, ate = _periodo_padrao(de, ate, granularidade)
    bucket = _bucket_expr(granularidade, "v.data")

    rows = db.execute(text(f"""
        SELECT {bucket} AS bucket, v.produto_id, pr.nome AS produto_nome,
               SUM(v.quantidade_kg) AS quantidade_kg, SUM(v.valor_total) AS valor_total
        FROM venda v JOIN produto pr ON pr.id = v.produto_id
        WHERE v.data BETWEEN :de AND :ate
          AND (CAST(:cliente_id AS bigint) IS NULL OR v.cliente_id = :cliente_id)
          AND (CAST(:vendedor AS text) IS NULL OR v.vendedor = :vendedor)
          AND v.excluido_em IS NULL
        GROUP BY bucket, v.produto_id, pr.nome
        ORDER BY bucket, pr.nome
    """), {"de": de, "ate": ate, "cliente_id": cliente_id, "vendedor": vendedor}).mappings().all()

    por_bucket: dict[str, list[SerieBucketProdutoOut]] = {}
    for r in rows:
        kg = float(r["quantidade_kg"])
        valor = float(r["valor_total"])
        por_bucket.setdefault(r["bucket"], []).append(SerieBucketProdutoOut(
            produto_id=r["produto_id"], produto_nome=r["produto_nome"],
            quantidade_kg=kg, valor_total=valor,
            preco_medio_ponderado=(valor / kg) if kg else None,
        ))

    return ComercialSerieOut(
        de=de, ate=ate, granularidade=granularidade,
        buckets=[ComercialSerieBucketOut(bucket=b, por_produto=itens) for b, itens in sorted(por_bucket.items())],
    )


@router.get("/producao/serie", response_model=ProducaoSerieOut)
def painel_producao_serie(
    granularidade: str = Query(default="dia"),
    de: date | None = Query(default=None),
    ate: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Alimenta os gráficos de produção por produto, rendimento ponderado e
    peso sujo ponderado — cada um quebrado por dia/mês/ano. Rendimento e
    peso sujo não são quebrados por produto (são medidos no nível do lote
    despescado, não por embalagem de produto final)."""
    de, ate = _periodo_padrao(de, ate, granularidade)

    bucket_producao = _bucket_expr(granularidade, "p.data")
    producao_rows = db.execute(text(f"""
        SELECT {bucket_producao} AS bucket, p.produto_id, pr.nome AS produto_nome,
               SUM(p.quantidade_kg) AS quantidade_kg
        FROM producao p JOIN produto pr ON pr.id = p.produto_id
        WHERE p.data BETWEEN :de AND :ate
        GROUP BY bucket, p.produto_id, pr.nome
        ORDER BY bucket, pr.nome
    """), {"de": de, "ate": ate}).mappings().all()

    bucket_despesca = _bucket_expr(granularidade, "data")
    peso_sujo_rows = db.execute(text(f"""
        SELECT {bucket_despesca} AS bucket,
               SUM(quantidade_un * peso_medio_g) / NULLIF(SUM(quantidade_un), 0) AS peso_medio_suja_g
        FROM despesca WHERE data BETWEEN :de AND :ate AND excluido_em IS NULL
        GROUP BY bucket
    """), {"de": de, "ate": ate}).mappings().all()

    bucket_batch = _bucket_expr(granularidade, "p.data_despesca")
    rendimento_rows = db.execute(text(f"""
        SELECT bucket, SUM(kg_file) / NULLIF(SUM(kg_desp), 0) AS rendimento
        FROM (
          SELECT {bucket_batch} AS bucket, p.lote_id, p.data_despesca,
                 SUM(p.quantidade_kg) FILTER (WHERE pr.nome LIKE 'Filé%') AS kg_file,
                 MAX(d.kg_desp) AS kg_desp
          FROM producao p
          JOIN produto pr ON pr.id = p.produto_id
          JOIN LATERAL (
            SELECT SUM(peso_total_kg) AS kg_desp FROM despesca
            WHERE lote_id = p.lote_id AND data = p.data_despesca AND destino = 'file' AND excluido_em IS NULL
          ) d ON true
          WHERE p.data_despesca BETWEEN :de AND :ate
          GROUP BY bucket, p.lote_id, p.data_despesca
        ) batch
        GROUP BY bucket
    """), {"de": de, "ate": ate}).mappings().all()

    por_produto: dict[str, list[ProducaoSerieBucketProdutoOut]] = {}
    for r in producao_rows:
        por_produto.setdefault(r["bucket"], []).append(ProducaoSerieBucketProdutoOut(
            produto_id=r["produto_id"], produto_nome=r["produto_nome"], quantidade_kg=float(r["quantidade_kg"]),
        ))
    peso_sujo_por_bucket = {r["bucket"]: _f(r["peso_medio_suja_g"]) for r in peso_sujo_rows}
    rendimento_por_bucket = {r["bucket"]: _f(r["rendimento"]) for r in rendimento_rows}

    todos_buckets = sorted(set(por_produto) | set(peso_sujo_por_bucket) | set(rendimento_por_bucket))
    return ProducaoSerieOut(
        de=de, ate=ate, granularidade=granularidade,
        buckets=[
            ProducaoSerieBucketOut(
                bucket=b, por_produto=por_produto.get(b, []),
                rendimento_medio_ponderado=rendimento_por_bucket.get(b),
                peso_medio_suja_ponderado_g=peso_sujo_por_bucket.get(b),
            )
            for b in todos_buckets
        ],
    )


@router.get("/agua", response_model=list[AguaViveiroOut])
def painel_agua(dias: int = Query(default=60, ge=1, le=365), db: Session = Depends(get_db)):
    desde = date.today() - timedelta(days=dias)
    rows = db.execute(text("""
        SELECT v.id AS viveiro_id, v.codigo AS viveiro_codigo,
               a.data, a.oxigenio, a.temperatura_c, a.amonia, a.ph, a.nitrito, a.nitrato
        FROM viveiro v
        JOIN analise_agua a ON a.viveiro_id = v.id
        WHERE v.ativo AND a.data >= :desde
        ORDER BY v.codigo, a.data
    """), {"desde": desde}).mappings().all()

    por_viveiro: dict[int, AguaViveiroOut] = {}
    for r in rows:
        vid = r["viveiro_id"]
        if vid not in por_viveiro:
            por_viveiro[vid] = AguaViveiroOut(viveiro_id=vid, viveiro_codigo=r["viveiro_codigo"], serie=[])
        por_viveiro[vid].serie.append(AguaPontoOut(
            data=r["data"], oxigenio=_f(r["oxigenio"]), temperatura_c=_f(r["temperatura_c"]),
            amonia=_f(r["amonia"]), ph=_f(r["ph"]), nitrito=_f(r["nitrito"]), nitrato=_f(r["nitrato"]),
        ))
    return list(por_viveiro.values())


@router.get("/caixa", response_model=CaixaResumoOut)
def painel_caixa(
    de: date | None = Query(default=None),
    ate: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Conferência operacional do dinheiro — não é fluxo de caixa completo
    (isso continua no Omie): só o que já está registrado aqui como venda ou
    despesa em dinheiro."""
    ate = ate or date.today()
    de = de or (ate - timedelta(days=30))

    dias = db.execute(text("""
        SELECT dia, vendas_dinheiro, despesas_dinheiro, saldo FROM vw_caixa_dia
        WHERE dia BETWEEN :de AND :ate ORDER BY dia
    """), {"de": de, "ate": ate}).mappings().all()

    abertas = db.execute(text("""
        SELECT e.id, v.nome AS vendedor_nome, e.data_saida
        FROM expedicao e JOIN vendedor v ON v.id = e.vendedor_id
        WHERE e.data_acerto IS NULL
        ORDER BY e.data_saida
    """)).mappings().all()

    hoje = date.today()
    total_vendas = sum(float(d["vendas_dinheiro"]) for d in dias)
    total_despesas = sum(float(d["despesas_dinheiro"]) for d in dias)

    return CaixaResumoOut(
        de=de, ate=ate,
        total_vendas_dinheiro=total_vendas, total_despesas_dinheiro=total_despesas,
        saldo=total_vendas - total_despesas,
        dias=[
            CaixaDiaOut(dia=d["dia"], vendas_dinheiro=float(d["vendas_dinheiro"]),
                        despesas_dinheiro=float(d["despesas_dinheiro"]), saldo=float(d["saldo"]))
            for d in dias
        ],
        expedicoes_abertas=[
            ExpedicaoAbertaOut(id=a["id"], vendedor_nome=a["vendedor_nome"], data_saida=a["data_saida"],
                                dias_em_aberto=(hoje - a["data_saida"]).days)
            for a in abertas
        ],
    )


@router.get("/acertos", response_model=list[AcertoResumoOut])
def painel_acertos(
    de: date | None = Query(default=None),
    ate: date | None = Query(default=None),
    vendedor_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Relatório das expedições já acertadas — mesma conta de diferenças
    (expedido × vendido × retornado) e totais em dinheiro do acerto ao
    vivo (POST /expedicoes/{id}/acerto), pra conferência histórica."""
    ate = ate or date.today()
    de = de or (ate - timedelta(days=30))

    expedicoes = db.execute(text("""
        SELECT e.id, v.nome AS vendedor_nome, e.data_saida, e.data_acerto
        FROM expedicao e JOIN vendedor v ON v.id = e.vendedor_id
        WHERE e.data_acerto BETWEEN :de AND :ate
          AND (CAST(:vendedor_id AS smallint) IS NULL OR e.vendedor_id = :vendedor_id)
        ORDER BY e.data_acerto DESC, e.id DESC
    """), {"de": de, "ate": ate, "vendedor_id": vendedor_id}).mappings().all()

    out = []
    for e in expedicoes:
        diferencas = db.execute(text("""
            SELECT ei.produto_id, p.nome AS produto_nome, ei.quantidade_kg AS expedida,
                   COALESCE(v.kg, 0) AS vendida, COALESCE(r.kg, 0) AS retornada
            FROM expedicao_item ei
            JOIN produto p ON p.id = ei.produto_id
            LEFT JOIN (
              SELECT produto_id, SUM(quantidade_kg) AS kg FROM venda
              WHERE expedicao_id = :id AND excluido_em IS NULL GROUP BY produto_id
            ) v ON v.produto_id = ei.produto_id
            LEFT JOIN (
              SELECT produto_id, SUM(quantidade_kg) AS kg FROM expedicao_retorno
              WHERE expedicao_id = :id GROUP BY produto_id
            ) r ON r.produto_id = ei.produto_id
            WHERE ei.expedicao_id = :id
            ORDER BY p.nome
        """), {"id": e["id"]}).mappings().all()

        totais = db.execute(text("""
            SELECT
              COALESCE((SELECT SUM(valor_total) FROM venda WHERE expedicao_id = :id AND forma_pgto = 'Dinheiro' AND excluido_em IS NULL), 0)
                AS vendas_dinheiro,
              COALESCE((SELECT SUM(valor) FROM despesa WHERE expedicao_id = :id AND forma_pgto = 'Dinheiro'), 0)
                AS despesas_dinheiro
        """), {"id": e["id"]}).mappings().first()
        vendas_dinheiro = float(totais["vendas_dinheiro"])
        despesas_dinheiro = float(totais["despesas_dinheiro"])

        out.append(AcertoResumoOut(
            expedicao_id=e["id"], vendedor_nome=e["vendedor_nome"],
            data_saida=e["data_saida"], data_acerto=e["data_acerto"],
            total_vendas_dinheiro=vendas_dinheiro, total_despesas_dinheiro=despesas_dinheiro,
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
        ))
    return out


@router.get("/dashboard", response_model=DashboardOut)
def painel_dashboard(
    de: date | None = Query(default=None),
    ate: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ate = ate or date.today()
    de = de or (ate - timedelta(days=30))

    # "Produção total" e "por dia trabalhado" no dashboard olham só Filé —
    # é o produto de maior valor/foco comercial, Postas e Tilápia limpa não
    # entram nessa conta (pedido do usuário)
    producao_tot = db.execute(text("""
        SELECT COALESCE(SUM(p.quantidade_kg), 0) AS kg, COUNT(DISTINCT p.data) AS dias
        FROM producao p JOIN produto pr ON pr.id = p.produto_id
        WHERE p.data BETWEEN :de AND :ate AND pr.nome LIKE 'Filé%'
    """), {"de": de, "ate": ate}).mappings().first()

    # "Vendas" no dashboard também olha só Filé, mesmo critério da Produção
    vendas_tot = db.execute(text("""
        SELECT COALESCE(SUM(v.quantidade_kg), 0) AS kg, COALESCE(SUM(v.valor_total), 0) AS valor
        FROM venda v JOIN produto pr ON pr.id = v.produto_id
        WHERE v.data BETWEEN :de AND :ate AND pr.nome LIKE 'Filé%' AND v.excluido_em IS NULL
    """), {"de": de, "ate": ate}).mappings().first()

    serie_rows = db.execute(text("""
        SELECT p.data, SUM(p.quantidade_kg) AS kg
        FROM producao p JOIN produto pr ON pr.id = p.produto_id
        WHERE p.data BETWEEN :de AND :ate AND pr.nome LIKE 'Filé%'
        GROUP BY p.data ORDER BY p.data
    """), {"de": de, "ate": ate}).mappings().all()

    vendas_diarias_rows = db.execute(text("""
        SELECT v.data, SUM(v.quantidade_kg) AS kg, SUM(v.valor_total) AS valor
        FROM venda v JOIN produto pr ON pr.id = v.produto_id
        WHERE v.data BETWEEN :de AND :ate AND pr.nome LIKE 'Filé%' AND v.excluido_em IS NULL
        GROUP BY v.data ORDER BY v.data
    """), {"de": de, "ate": ate}).mappings().all()

    rendimento_diario_rows = db.execute(text("""
        SELECT data_despesca AS data, SUM(kg_file) / NULLIF(SUM(kg_desp), 0) AS rendimento
        FROM (
          SELECT p.lote_id, p.data_despesca,
                 SUM(p.quantidade_kg) FILTER (WHERE pr.nome LIKE 'Filé%') AS kg_file,
                 MAX(d.kg_desp) AS kg_desp
          FROM producao p
          JOIN produto pr ON pr.id = p.produto_id
          JOIN LATERAL (
            SELECT SUM(peso_total_kg) AS kg_desp FROM despesca
            WHERE lote_id = p.lote_id AND data = p.data_despesca AND destino = 'file' AND excluido_em IS NULL
          ) d ON true
          WHERE p.data_despesca BETWEEN :de AND :ate
          GROUP BY p.lote_id, p.data_despesca
        ) batch
        GROUP BY data_despesca ORDER BY data_despesca
    """), {"de": de, "ate": ate}).mappings().all()

    mortalidade_diaria_rows = db.execute(text("""
        SELECT l.data_fim AS data, SUM(l.quantidade_inicial) AS inicial, SUM(s.saldo_un) AS perdida
        FROM lote l JOIN vw_saldo_lote s ON s.lote_id = l.id
        WHERE l.data_fim BETWEEN :de AND :ate
        GROUP BY l.data_fim ORDER BY l.data_fim
    """), {"de": de, "ate": ate}).mappings().all()

    # mesma conta do painel de Produção (por lote+data de despesca, pra
    # não contar o mesmo peso despescado mais de uma vez quando há mais
    # de um produto por lote/data)
    rendimento = db.execute(text("""
        SELECT SUM(kg_file) / NULLIF(SUM(kg_desp), 0) AS rendimento
        FROM (
          SELECT p.lote_id, p.data_despesca,
                 SUM(p.quantidade_kg) FILTER (WHERE pr.nome LIKE 'Filé%') AS kg_file,
                 MAX(d.kg_desp) AS kg_desp
          FROM producao p
          JOIN produto pr ON pr.id = p.produto_id
          JOIN LATERAL (
            SELECT SUM(peso_total_kg) AS kg_desp FROM despesca
            WHERE lote_id = p.lote_id AND data = p.data_despesca AND destino = 'file' AND excluido_em IS NULL
          ) d ON true
          WHERE p.data_despesca BETWEEN :de AND :ate
          GROUP BY p.lote_id, p.data_despesca
        ) batch
    """), {"de": de, "ate": ate}).scalar()

    # reaproveita o mesmo cálculo de biomassa/densidade do painel do
    # viveiro — não duplica a projeção peso×curva de crescimento
    limites = _limites_densidade(db)
    alertas: list[ViveiroAlertaOut] = []
    biomassa_total_kg = 0.0
    soma_racao_kg = 0.0
    soma_ganho_biomassa_kg = 0.0
    for v in painel_viveiros(db):
        if v.lote_atual is None:
            continue
        if v.biomassa_atual_kg is not None:
            biomassa_total_kg += v.biomassa_atual_kg
        if v.racao_acumulada_kg is not None:
            soma_racao_kg += v.racao_acumulada_kg
        if v.ganho_biomassa_kg is not None:
            soma_ganho_biomassa_kg += v.ganho_biomassa_kg
        if v.densidade_kg_m2 is None:
            continue
        limite = _limite_de(limites, v.tipo)
        if v.densidade_kg_m2 >= limite:
            situacao = "acima"
        elif v.densidade_kg_m2 >= limite * 0.7:
            situacao = "proximo"
        else:
            continue
        alertas.append(ViveiroAlertaOut(
            viveiro_codigo=v.codigo, lote_codigo=v.lote_atual.codigo,
            densidade_kg_m2=v.densidade_kg_m2, limite_kg_m2=limite, situacao=situacao,
        ))
    conversao_media_ponderada = (soma_racao_kg / soma_ganho_biomassa_kg) if soma_ganho_biomassa_kg > 0 else None

    # mortalidade média ponderada dos lotes encerrados dentro do período
    # filtrado (mesma regra da Mortalidade por fase, sem separar a fase)
    mortalidade_rows = db.execute(text("""
        SELECT l.quantidade_inicial, s.saldo_un
        FROM lote l JOIN vw_saldo_lote s ON s.lote_id = l.id
        WHERE l.data_fim BETWEEN :de AND :ate
    """), {"de": de, "ate": ate}).mappings().all()
    soma_inicial = sum(r["quantidade_inicial"] for r in mortalidade_rows)
    soma_perdida = sum(r["saldo_un"] for r in mortalidade_rows)
    mortalidade_media_ponderada = (soma_perdida / soma_inicial) if soma_inicial > 0 else None

    dias_trabalhados = producao_tot["dias"]
    producao_total_kg = float(producao_tot["kg"])

    return DashboardOut(
        de=de, ate=ate,
        producao_total_kg=producao_total_kg,
        dias_trabalhados=dias_trabalhados,
        producao_por_dia_kg=(producao_total_kg / dias_trabalhados) if dias_trabalhados else None,
        vendas_kg=float(vendas_tot["kg"]), vendas_valor=float(vendas_tot["valor"]),
        serie_producao_diaria=[ProducaoDiaOut(data=r["data"], quantidade_kg=float(r["kg"])) for r in serie_rows],
        serie_vendas_kg_diaria=[SerieDiariaOut(data=r["data"], valor=float(r["kg"])) for r in vendas_diarias_rows],
        serie_vendas_valor_diaria=[SerieDiariaOut(data=r["data"], valor=float(r["valor"])) for r in vendas_diarias_rows],
        serie_rendimento_diario=[
            SerieDiariaOut(data=r["data"], valor=float(r["rendimento"]) * 100)
            for r in rendimento_diario_rows if r["rendimento"] is not None
        ],
        serie_mortalidade_diaria=[
            SerieDiariaOut(data=r["data"], valor=(float(r["perdida"]) / float(r["inicial"]) * 100) if r["inicial"] else 0.0)
            for r in mortalidade_diaria_rows
        ],
        viveiros_alerta=alertas,
        biomassa_total_kg=biomassa_total_kg,
        conversao_media_ponderada=conversao_media_ponderada,
        mortalidade_media_ponderada=mortalidade_media_ponderada,
        rendimento_medio_ponderado=_f(rendimento),
    )


# ---------- Tabelas informativas ----------

_SLOTS_PRE_ENGORDA = ["08:30", "10:30", "12:00", "15:30"]
_SLOTS_ENGORDA = ["08:30", "12:00", "15:30"]


def _arredondar_saco(v: float) -> float:
    """Arredonda pro múltiplo de 0,5 mais próximo — a primeira casa
    decimal só pode ser 0 ou 5 (ex.: 0,63 -> 0,5; 1,3 -> 1,5)."""
    return round(round(v / 0.5) * 0.5, 1)


def _slots_para_fase(fase: str) -> list[str]:
    """Horários fixos do trato — não vêm mais do tratos_por_dia da tabela
    de arraçoamento (que só define quantidade/tipo de ração por semana),
    e sim da fase do lote: pré-engorda come mais vezes ao dia que engorda."""
    return _SLOTS_PRE_ENGORDA if fase == "pre_engorda" else _SLOTS_ENGORDA


@router.get("/tabela-arracoamento", response_model=list[TabelaArracoamentoLinhaOut])
def tabela_arracoamento_base(db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT * FROM tabela_arracoamento ORDER BY semana")).mappings().all()
    return [
        TabelaArracoamentoLinhaOut(
            semana=r["semana"], peso_inicial_g=float(r["peso_inicial_g"]), peso_final_g=float(r["peso_final_g"]),
            peso_ganho_g=float(r["peso_ganho_g"]), consumo_diario_kg=float(r["consumo_diario_kg"]),
            consumo_semanal_kg=float(r["consumo_semanal_kg"]), consumo_sacos=float(r["consumo_sacos"]),
            pct_proteina=_f(r["pct_proteina"]), tipo_racao=r["tipo_racao"], preco_saco=_f(r["preco_saco"]),
            conversao=_f(r["conversao"]), tratos_por_dia=r["tratos_por_dia"],
        )
        for r in rows
    ]


@router.get("/arracoamento-previsto", response_model=list[ArracoamentoPrevistoDiaOut])
def arracoamento_previsto(
    de: date | None = Query(default=None),
    ate: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Ficha pra impressão: sacos esperados por viveiro/horário, projetando
    o peso (mesma curva do painel do viveiro) e cruzando com o consumo por
    1000 peixes da tabela de arraçoamento. Divide pelos horários certos
    conforme os tratos/dia daquela semana (6 pra peixe jovem, 3 pra peixe
    mais graúdo — não são os 6 horários padrão sempre).

    A ração (quantidade/tipo/tratos) é travada por semana do período — se
    a curva indicaria troca no meio da semana, essa troca só vale a partir
    da semana seguinte, pra não mudar a receita no meio da semana."""
    de = de or date.today()
    ate = ate or (de + timedelta(days=6))

    curva = _carregar_curva(db)
    semana_maxima_curva = curva[-1]["semana"]

    tabela = db.execute(
        text("SELECT semana, consumo_diario_kg, tratos_por_dia FROM tabela_arracoamento ORDER BY semana")
    ).mappings().all()
    tabela_by_semana = {t["semana"]: t for t in tabela}
    semana_maxima_tabela = max(tabela_by_semana)

    rows = db.execute(text("""
        SELECT v.codigo AS viveiro_codigo, l.codigo AS lote_codigo, l.data_inicio AS lote_data_inicio,
               l.peso_medio_inicial_g, l.fase, s.saldo_un,
               b.data AS biometria_data, b.peso_medio_g AS biometria_peso
        FROM viveiro v
        JOIN lote l ON l.viveiro_id = v.id AND l.data_fim IS NULL
        JOIN vw_saldo_lote s ON s.lote_id = l.id
        LEFT JOIN LATERAL (
          SELECT data, peso_medio_g FROM biometria WHERE lote_id = l.id ORDER BY data DESC LIMIT 1
        ) b ON true
        WHERE v.ativo AND s.saldo_un > 0
    """)).mappings().all()
    rows = sorted(rows, key=lambda r: _chave_ordem_viveiro(r["viveiro_codigo"]))

    out = []
    for r in rows:
        data_biometria = r["biometria_data"] or r["lote_data_inicio"]
        peso_biometria = (
            float(r["biometria_peso"]) if r["biometria_peso"] is not None else float(r["peso_medio_inicial_g"])
        )
        semana_biometria = _semana_para_peso(curva, peso_biometria)
        saldo_un = r["saldo_un"]

        # um bloco por semana do período (não um por dia): dentro do
        # mesmo bloco de 7 dias a ração é sempre igual, então só faz
        # sentido uma linha por bloco — a troca (se a curva indicaria
        # uma) só vale a partir do bloco seguinte
        inicio_bloco = de
        while inicio_bloco <= ate:
            fim_bloco = min(inicio_bloco + timedelta(days=6), ate)

            semanas_decorridas = max(0, (inicio_bloco - data_biometria).days // 7)
            semana_projetada = min(semana_biometria + semanas_decorridas, semana_maxima_curva)
            peso_estimado = _peso_para_semana(curva, semana_projetada)

            semana_tabela = min(semana_projetada, semana_maxima_tabela)
            info = tabela_by_semana[semana_tabela]
            kg_dia = float(info["consumo_diario_kg"]) * (saldo_un / 1000)
            sacos_dia = kg_dia / 25
            slots = _slots_para_fase(r["fase"])
            sacos_por_trato = (sacos_dia / len(slots)) if slots else 0.0

            tratos = [TratoPrevistoOut(horario=h, sacos=_arredondar_saco(sacos_por_trato)) for h in slots]
            out.append(ArracoamentoPrevistoDiaOut(
                viveiro_codigo=r["viveiro_codigo"], lote_codigo=r["lote_codigo"],
                periodo_inicio=inicio_bloco, periodo_fim=fim_bloco,
                semana=semana_projetada, saldo_un=saldo_un, peso_estimado_g=peso_estimado,
                tratos=tratos, sacos_total_dia=_arredondar_saco(sum(t.sacos for t in tratos)),
            ))
            inicio_bloco += timedelta(days=7)
    return out


_HORIZONTE_SUGESTAO_DIAS = 30


@router.get("/estoque-racao", response_model=EstoqueRacaoOut)
def painel_estoque_racao(db: Session = Depends(get_db)):
    """Estoque = chegadas - consumo, por tipo (acumulado, não é um
    período). O consumo por dia (pra estimar quando acaba e sugerir
    quanto pedir na próxima carga) usa o mesmo cálculo do arraçoamento
    previsto, atribuído ao tipo que cada lote usou por último."""
    tipos = db.execute(text("""
        SELECT t.id, t.codigo, f.nome AS fornecedor_nome
        FROM tipo_racao t JOIN fornecedor_racao f ON f.id = t.fornecedor_id
        WHERE t.ativo AND f.ativo
        ORDER BY f.nome, t.codigo
    """)).mappings().all()

    chegou_por_tipo = {
        r["tipo_racao_id"]: float(r["chegou"])
        for r in db.execute(text(
            "SELECT tipo_racao_id, SUM(quantidade_sacos) AS chegou FROM chegada_racao_item GROUP BY tipo_racao_id"
        )).mappings().all()
    }
    consumido_por_tipo = {
        r["tipo_racao_id"]: float(r["consumido"])
        for r in db.execute(text(
            "SELECT tipo_racao_id, SUM(sacos) AS consumido FROM arracoamento "
            "WHERE tipo_racao_id IS NOT NULL AND excluido_em IS NULL GROUP BY tipo_racao_id"
        )).mappings().all()
    }

    hoje = date.today()
    previsto_hoje = arracoamento_previsto(de=hoje, ate=hoje, db=db)
    lote_por_codigo = {r["codigo"]: r["id"] for r in db.execute(text("SELECT id, codigo FROM lote")).mappings().all()}
    ultimo_tipo_por_lote = {
        r["lote_id"]: r["tipo_racao_id"]
        for r in db.execute(text("""
            SELECT DISTINCT ON (lote_id) lote_id, tipo_racao_id
            FROM arracoamento WHERE tipo_racao_id IS NOT NULL AND excluido_em IS NULL
            ORDER BY lote_id, data DESC, criado_em DESC
        """)).mappings().all()
    }
    consumo_dia_por_tipo: dict[int, float] = {}
    sacos_sem_tipo_hoje = 0.0
    for p in previsto_hoje:
        lote_id = lote_por_codigo.get(p.lote_codigo)
        tipo_id = ultimo_tipo_por_lote.get(lote_id) if lote_id is not None else None
        if tipo_id is None:
            sacos_sem_tipo_hoje += p.sacos_total_dia
        else:
            consumo_dia_por_tipo[tipo_id] = consumo_dia_por_tipo.get(tipo_id, 0.0) + p.sacos_total_dia

    por_tipo: list[EstoqueRacaoTipoOut] = []
    dias_restantes_candidatos: list[float] = []
    for t in tipos:
        chegou = chegou_por_tipo.get(t["id"], 0.0)
        consumido = consumido_por_tipo.get(t["id"], 0.0)
        saldo = chegou - consumido
        consumo_dia = consumo_dia_por_tipo.get(t["id"])
        dias_restantes = (saldo / consumo_dia) if consumo_dia else None
        if dias_restantes is not None:
            dias_restantes_candidatos.append(dias_restantes)
        sugestao = max(0.0, consumo_dia * _HORIZONTE_SUGESTAO_DIAS - saldo) if consumo_dia else None
        por_tipo.append(EstoqueRacaoTipoOut(
            tipo_racao_id=t["id"], tipo_racao_codigo=t["codigo"], fornecedor_nome=t["fornecedor_nome"],
            chegou_sacos=chegou, consumido_sacos=consumido, saldo_sacos=saldo,
            consumo_sacos_dia=consumo_dia, dias_restantes=dias_restantes,
            sacos_sugeridos_proxima_carga=sugestao,
        ))

    trinta_dias_atras = hoje - timedelta(days=30)
    sacos_sem_tipo_30d = float(db.execute(text(
        "SELECT COALESCE(SUM(sacos), 0) FROM arracoamento WHERE tipo_racao_id IS NULL AND data >= :de AND excluido_em IS NULL"
    ), {"de": trinta_dias_atras}).scalar())

    dias_restantes_total = min(dias_restantes_candidatos) if dias_restantes_candidatos else None
    return EstoqueRacaoOut(
        saldo_total_sacos=sum(p.saldo_sacos for p in por_tipo),
        por_tipo=por_tipo,
        consumo_total_sacos_dia=sum(consumo_dia_por_tipo.values()) + sacos_sem_tipo_hoje,
        dias_restantes_total=dias_restantes_total,
        data_prevista_proxima_carga=(hoje + timedelta(days=dias_restantes_total)) if dias_restantes_total is not None else None,
        sacos_sem_tipo_informado_ultimos_30_dias=sacos_sem_tipo_30d,
    )


def _viveiro_valido_como_destino(tipo_origem: str, tipo_destino: str) -> bool:
    # lote que já passou pra fase de engorda não volta pra um viveiro de
    # pré-engorda (tanque de berçário, pequeno demais pro propósito)
    return not (tipo_destino == "pre_engorda" and tipo_origem == "engorda")


def _agrupar_compat(origens, semana_por_codigo):
    """Agrupa origens em clusters mutuamente compatíveis (semana na curva
    a até 2 de diferença de todo mundo no cluster) — só quem cai no mesmo
    cluster pode dividir tanque de destino ou ser equalizado junto."""
    grupos: list[list] = []
    for o in origens:
        sem_o = semana_por_codigo.get(o.codigo)
        grupo_encontrado = None
        for g in grupos:
            if all(
                sem_o is not None and semana_por_codigo.get(m.codigo) is not None
                and abs(sem_o - semana_por_codigo[m.codigo]) <= 2
                for m in g
            ):
                grupo_encontrado = g
                break
        if grupo_encontrado is not None:
            grupo_encontrado.append(o)
        else:
            grupos.append([o])
    return grupos


def _equalizar_grupo(grupo, orcamento_un: float) -> dict[str, int]:
    """Reparte um orçamento de repicagem entre tanques mutuamente
    compatíveis pra igualar (e minimizar) a densidade resultante — drena
    primeiro quem está com densidade mais alta; quando dois empatam no
    topo, drena os dois juntos, proporcionalmente, até acabar o orçamento
    ou esvaziar todo mundo."""
    un = {o.codigo: float(o.lote_atual.saldo_un) for o in grupo}
    peso_kg = {o.codigo: (o.peso_estimado_hoje_g or 0) / 1000 for o in grupo}
    area = {o.codigo: o.area_m2 for o in grupo}
    remover = {o.codigo: 0.0 for o in grupo}
    codigos = list(un.keys())

    def densidade(cod):
        return (un[cod] * peso_kg[cod] / area[cod]) if area[cod] else 0.0

    restante = float(orcamento_un)
    while restante > 1e-6 and any(un[c] > 1e-6 for c in codigos):
        ativos = [c for c in codigos if un[c] > 1e-6]
        max_d = max(densidade(c) for c in ativos)
        no_topo = [c for c in ativos if abs(densidade(c) - max_d) < 1e-9]
        outras = [densidade(c) for c in ativos if c not in no_topo]
        alvo_d = max(outras) if outras else 0.0

        precisa = {}
        for c in no_topo:
            un_no_alvo = (alvo_d * area[c] / peso_kg[c]) if peso_kg[c] else 0.0
            precisa[c] = max(0.0, un[c] - un_no_alvo)
        total_necessario = sum(precisa.values())

        if total_necessario <= 1e-9:
            break  # já estão todos empatados no fundo (ou zerados)
        if total_necessario <= restante + 1e-9:
            for c in no_topo:
                un[c] -= precisa[c]
                remover[c] += precisa[c]
            restante -= total_necessario
        else:
            for c in no_topo:
                fatia = restante * (precisa[c] / total_necessario)
                un[c] -= fatia
                remover[c] += fatia
            restante = 0.0

    return {c: int(round(v)) for c, v in remover.items()}


def _alocar_repicagem(
    origens, vazios, capacidade_fn, semana_por_codigo, exigir_completo,
    quantidade_desejada: dict[str, int] | None = None,
    capacidade_restante: dict[str, int] | None = None,
    ocupantes_semana: dict[str, list] | None = None,
):
    """Aloca cada origem (na ordem recebida) nos destinos vazios,
    respeitando tipo válido e só misturando lotes de origens diferentes no
    mesmo destino quando a diferença de semana na curva for <= 2. Prefere
    destino ainda sem ocupante (evita mistura) e o de menor sobra (melhor
    encaixe). Se exigir_completo=True e alguma origem não couber inteira,
    devolve None (nível não fecha); senão aloca o quanto der.

    capacidade_restante/ocupantes_semana podem ser passados de fora (e são
    alterados nesse processo) pra encadear várias chamadas compartilhando
    o mesmo estoque de vagas — usado pelo nível 2 pra processar um grupo
    de cada vez sem que um grupo "gaste" a vaga que outro já reservou."""
    if capacidade_restante is None:
        capacidade_restante = {v.codigo: capacidade_fn(v) for v in vazios}
    if ocupantes_semana is None:
        ocupantes_semana = {v.codigo: [] for v in vazios}
    itens = []
    restante: dict[str, int] = {}

    for origem in origens:
        un_pedido = (
            quantidade_desejada.get(origem.codigo, origem.lote_atual.saldo_un)
            if quantidade_desejada is not None else origem.lote_atual.saldo_un
        )
        un_restante = un_pedido
        sem_origem = semana_por_codigo.get(origem.codigo)

        def compativel_com_ocupantes(v, sem_origem=sem_origem):
            ocupantes = ocupantes_semana[v.codigo]
            if not ocupantes or sem_origem is None:
                return not ocupantes
            return all(abs(sem_origem - s) <= 2 for s in ocupantes)

        candidatos_vazios = [
            v for v in vazios
            if not ocupantes_semana[v.codigo]
            and _viveiro_valido_como_destino(origem.tipo, v.tipo)
            and capacidade_restante[v.codigo] > 0
        ]
        candidatos_compat = [
            v for v in vazios
            if ocupantes_semana[v.codigo]
            and compativel_com_ocupantes(v)
            and _viveiro_valido_como_destino(origem.tipo, v.tipo)
            and capacidade_restante[v.codigo] > 0
        ]

        def melhor_encaixe_unico(lista):
            viaveis = [v for v in lista if capacidade_restante[v.codigo] >= un_restante]
            return min(viaveis, key=lambda v: capacidade_restante[v.codigo]) if viaveis else None

        escolhido = melhor_encaixe_unico(candidatos_vazios) or melhor_encaixe_unico(candidatos_compat)
        if escolhido:
            itens.append((origem.codigo, origem.lote_atual.codigo, escolhido.codigo, un_restante))
            capacidade_restante[escolhido.codigo] -= un_restante
            ocupantes_semana[escolhido.codigo].append(sem_origem)
            un_restante = 0
        else:
            ordenados = (
                sorted(candidatos_vazios, key=lambda v: capacidade_restante[v.codigo], reverse=True)
                + sorted(candidatos_compat, key=lambda v: capacidade_restante[v.codigo], reverse=True)
            )
            for v in ordenados:
                if un_restante <= 0:
                    break
                cap = capacidade_restante[v.codigo]
                if cap <= 0:
                    continue
                alocado = min(cap, un_restante)
                itens.append((origem.codigo, origem.lote_atual.codigo, v.codigo, alocado))
                capacidade_restante[v.codigo] -= alocado
                ocupantes_semana[v.codigo].append(sem_origem)
                un_restante -= alocado

        if exigir_completo and un_restante > 0:
            return None
        # restante = quanto do lote INTEIRO ainda fica no tanque de origem
        # (não só o que sobrou do pedido — importa quando o pedido já foi
        # menor que o saldo total, como na equalização do nível 2)
        alocado = un_pedido - un_restante
        restante[origem.codigo] = origem.lote_atual.saldo_un - alocado

    return {"itens": itens, "restante": restante}


def _monta_nivel(resultado, origens_codigos) -> NivelRepicagemOut:
    if resultado is None:
        return NivelRepicagemOut(
            aplicavel=False,
            resumo="Não há tanques vazios suficientes para acomodar todos os lotes acima do limite de uma vez.",
            itens=[], misturas=[], restante_un={c: 0 for c in origens_codigos},
        )
    itens = [
        ItemRepicagemOut(viveiro_origem=o, lote_codigo=l, viveiro_destino=d, un_repicado=un)
        for o, l, d, un in resultado["itens"]
    ]
    por_destino: dict[str, set[str]] = {}
    for item in itens:
        por_destino.setdefault(item.viveiro_destino, set()).add(item.viveiro_origem)
    misturas = [
        MisturaOut(viveiro_destino=destino, origens=sorted(origens))
        for destino, origens in por_destino.items() if len(origens) > 1
    ]
    resolvido = all(v == 0 for v in resultado["restante"].values())
    if resolvido:
        resumo = "Cabe repicar todos os lotes acima do limite nos tanques vazios disponíveis."
    else:
        faltando = ", ".join(c for c, v in resultado["restante"].items() if v > 0)
        resumo = f"Repicagem parcial — ainda ficam peixes acima do limite em: {faltando}."
    return NivelRepicagemOut(
        aplicavel=len(itens) > 0, resumo=resumo, itens=itens, misturas=misturas,
        restante_un=resultado["restante"],
    )


@router.get("/sugestao-repicagem", response_model=SugestaoRepicagemGeralOut)
def sugestao_repicagem(db: Session = Depends(get_db)):
    """3 níveis de sugestão, sempre calculados juntos (só um se aplica de
    fato, mas os 3 são mostrados lado a lado pra comparação):

    Nível 1 — repicagem total: só se algum conjunto de tanques vazios
    comportar TODOS os lotes acima do limite ao mesmo tempo (já pensando
    na densidade quando os peixes chegarem a 800g).
    Nível 2 — repicagem parcial: reduz o quanto der, priorizando o tanque
    mais acima do limite primeiro.
    Nível 3 — se não sobrar tanque vazio nem pra repicagem parcial:
    sugere zerar (despescar) os tanques mais prontos (maior peso, menos
    peixes) e repicar em seguida pra eles, como se já estivessem vazios.

    Em todos os níveis, dois lotes de origem só dividem o mesmo destino se
    a diferença de peso entre eles for de até 2 semanas na curva de
    crescimento — senão a mistura fica marcada como inviável e cada um
    precisa de tanque próprio."""
    limites = _limites_densidade(db)
    curva = _carregar_curva(db)
    viveiros = painel_viveiros(db)

    ativos = [v for v in viveiros if v.lote_atual is not None]
    vazios = [v for v in viveiros if v.lote_atual is None and v.tipo != "decantacao"]

    def capacidade_un(v) -> int:
        return int((v.area_m2 * _limite_de(limites, v.tipo)) // 0.8)

    semana_por_codigo = {
        v.codigo: (_semana_para_peso(curva, v.peso_estimado_hoje_g) if v.peso_estimado_hoje_g else None)
        for v in ativos
    }

    origens = sorted(
        [v for v in ativos if v.densidade_kg_m2 is not None and v.densidade_kg_m2 >= _limite_de(limites, v.tipo)],
        key=lambda v: v.densidade_kg_m2, reverse=True,
    )
    origens_codigos = [o.codigo for o in origens]

    if not origens:
        vazio_nivel = NivelRepicagemOut(
            aplicavel=False, resumo="Nenhum tanque está acima do limite de densidade agora.",
            itens=[], misturas=[], restante_un={},
        )
        return SugestaoRepicagemGeralOut(
            tanques_acima_do_limite=[], nivel_1=vazio_nivel, nivel_2=vazio_nivel,
            nivel_3=NivelDespescaOut(aplicavel=False, resumo=vazio_nivel.resumo, despescar=[], repicagem=vazio_nivel),
        )

    # ---- nível 1: maiores lotes primeiro (mais difíceis de encaixar) ----
    origens_por_tamanho = sorted(origens, key=lambda v: v.lote_atual.saldo_un, reverse=True)
    resultado_1 = _alocar_repicagem(origens_por_tamanho, vazios, capacidade_un, semana_por_codigo, exigir_completo=True)
    nivel_1 = _monta_nivel(resultado_1, origens_codigos)

    # ---- nível 2: agrupa por compatibilidade de peso e equaliza a
    # densidade dentro de cada grupo — quando dois tanques acima do
    # limite têm lote compatível, repica os dois juntos até empatarem na
    # densidade mais baixa possível, em vez de esvaziar um e só depois
    # olhar pro outro. Grupos com pior densidade máxima usam a vaga
    # disponível primeiro. ----
    grupos = _agrupar_compat(origens, semana_por_codigo)
    grupos.sort(key=lambda g: max(v.densidade_kg_m2 for v in g), reverse=True)

    capacidade_restante_2 = {v.codigo: capacidade_un(v) for v in vazios}
    ocupantes_semana_2: dict[str, list] = {v.codigo: [] for v in vazios}
    itens_2 = []
    restante_2: dict[str, int] = {}

    for grupo in grupos:
        destinos_validos_grupo = [
            v for v in vazios if any(_viveiro_valido_como_destino(o.tipo, v.tipo) for o in grupo)
        ]
        orcamento_grupo = sum(capacidade_restante_2[v.codigo] for v in destinos_validos_grupo)
        alvo_por_origem = _equalizar_grupo(grupo, orcamento_grupo)

        resultado_grupo = _alocar_repicagem(
            grupo, vazios, capacidade_un, semana_por_codigo, exigir_completo=False,
            quantidade_desejada=alvo_por_origem,
            capacidade_restante=capacidade_restante_2, ocupantes_semana=ocupantes_semana_2,
        )
        itens_2.extend(resultado_grupo["itens"])
        restante_2.update(resultado_grupo["restante"])

    nivel_2 = _monta_nivel({"itens": itens_2, "restante": restante_2}, origens_codigos)

    # ---- nível 3: zera candidatos prontos (maior peso, menos peixes) até
    # dar pra fechar a repicagem completa com os tanques recém-liberados ----
    candidatos_despesca = [
        v for v in ativos
        if v.codigo not in origens_codigos
        and v.peso_estimado_hoje_g is not None and v.peso_estimado_hoje_g >= 600
    ]
    candidatos_despesca.sort(key=lambda v: (-v.peso_estimado_hoje_g, v.lote_atual.saldo_un))

    escolhidos: list = []
    resultado_3 = resultado_1
    if resultado_1 is None:
        vazios_apos = list(vazios)
        for c in candidatos_despesca:
            escolhidos.append(c)
            vazios_apos = vazios_apos + [c]
            resultado_3 = _alocar_repicagem(origens_por_tamanho, vazios_apos, capacidade_un, semana_por_codigo, exigir_completo=True)
            if resultado_3 is not None:
                break
        else:
            # nem despescando todo mundo fecha — devolve o melhor esforço parcial
            resultado_3 = _alocar_repicagem(origens, vazios_apos, capacidade_un, semana_por_codigo, exigir_completo=False)

    nivel_3_repicagem = _monta_nivel(resultado_3, origens_codigos)
    if resultado_1 is not None:
        nivel_3 = NivelDespescaOut(
            aplicavel=False,
            resumo="Não é necessário zerar nenhum tanque — já cabe repicar tudo nos vazios existentes (nível 1).",
            despescar=[], repicagem=nivel_3_repicagem,
        )
    else:
        despescar = [
            DespescaPreviaOut(
                viveiro_codigo=c.codigo, lote_codigo=c.lote_atual.codigo,
                peso_estimado_g=c.peso_estimado_hoje_g, saldo_un=c.lote_atual.saldo_un,
                capacidade_liberada_un=capacidade_un(c),
            )
            for c in escolhidos
        ]
        if escolhidos and all(v == 0 for v in nivel_3_repicagem.restante_un.values()):
            nomes = ", ".join(c.codigo for c in escolhidos)
            resumo = f"Zerar {nomes} libera espaço suficiente pra repicar tudo em seguida."
        elif escolhidos:
            resumo = "Mesmo zerando os tanques mais prontos, não sobra espaço pra tudo — veja a repicagem parcial resultante."
        else:
            resumo = "Não há nenhum tanque pronto (>= 600g) disponível pra zerar agora."
        nivel_3 = NivelDespescaOut(aplicavel=len(escolhidos) > 0, resumo=resumo, despescar=despescar, repicagem=nivel_3_repicagem)

    return SugestaoRepicagemGeralOut(
        tanques_acima_do_limite=origens_codigos, nivel_1=nivel_1, nivel_2=nivel_2, nivel_3=nivel_3,
    )


class _DestinoProjetado:
    """Objeto leve com a mesma forma que `_alocar_repicagem` espera de um
    tanque (origem ou destino) — usado pra simular tanques que ainda não
    existem como vazios reais hoje (foram despescados ou ativados só na
    simulação futura)."""

    def __init__(self, codigo: str, tipo: str, area_m2: float, lote_atual=None):
        self.codigo = codigo
        self.tipo = tipo
        self.area_m2 = float(area_m2)
        self.lote_atual = lote_atual


@router.get("/projecao-capacidade", response_model=ProjecaoCapacidadeOut)
def projecao_capacidade(db: Session = Depends(get_db)):
    """Projeta, tanque a tanque, quando cada lote ativo (que hoje ainda
    não está acima do limite) vai estourar a densidade no futuro, e
    simula em ordem cronológica a mesma prioridade da sugestão de agora
    — repicar primeiro, despescar (>= 600g) depois, e só por último
    ativar tanque inativo (em ordem numérica crescente) — só que
    aplicada à frente no tempo, pra dar antecedência pra preparar um
    tanque. Lotes que chegam à idade de abate (semana 26) sem estourar o
    limite são considerados despescados/retirados e saem da simulação."""
    limites = _limites_densidade(db)
    curva = _carregar_curva(db)
    semana_maxima_curva = curva[-1]["semana"]
    viveiros = painel_viveiros(db)

    todos_db = db.execute(text("SELECT codigo, tipo, area_m2, ativo FROM viveiro")).mappings().all()
    info_por_codigo = {r["codigo"]: r for r in todos_db}
    codigos_inativos_ordenados = sorted(
        (r["codigo"] for r in todos_db if not r["ativo"] and r["tipo"] != "decantacao"),
        key=_chave_ordem_viveiro,
    )

    ativos = [v for v in viveiros if v.lote_atual is not None]
    vazios_reais = [v for v in viveiros if v.lote_atual is None and v.tipo != "decantacao"]

    def capacidade_un(v) -> int:
        return int((v.area_m2 * _limite_de(limites, v.tipo)) // 0.8)

    def semana_atual_de(v):
        return _semana_para_peso(curva, v.peso_estimado_hoje_g) if v.peso_estimado_hoje_g else None

    def semana_estouro(v) -> int | None:
        """Semanas a partir de hoje até a densidade estourar o limite, ou
        None se o lote chega à idade de abate antes disso (é despescado
        e sai da simulação sem precisar de tanque novo)."""
        limite = _limite_de(limites, v.tipo)
        if v.densidade_kg_m2 is not None and v.densidade_kg_m2 >= limite:
            return None  # já é caso da sugestão de agora, não é "futuro"
        sem_atual = semana_atual_de(v)
        if sem_atual is None or v.lote_atual is None:
            return None
        saldo_un = v.lote_atual.saldo_un
        for w in range(0, SEMANA_LIMITE_ABATE - sem_atual + 1):
            sem_futura = sem_atual + w
            if sem_futura >= SEMANA_LIMITE_ABATE:
                return None
            peso_futuro_g = _peso_para_semana(curva, sem_futura)
            densidade_futura = saldo_un * peso_futuro_g / 1000 / v.area_m2
            if densidade_futura >= limite:
                return w
        return None

    def semana_600g(v) -> int | None:
        if v.peso_estimado_hoje_g is not None and v.peso_estimado_hoje_g >= 600:
            return 0
        sem_atual = semana_atual_de(v)
        if sem_atual is None:
            return None
        for w in range(0, semana_maxima_curva - sem_atual + 1):
            if _peso_para_semana(curva, sem_atual + w) >= 600:
                return w
        return None

    eventos_brutos = sorted(
        ((semana_estouro(v), v) for v in ativos),
        key=lambda item: item[0] if item[0] is not None else 10**9,
    )
    eventos_brutos = [(w, v) for w, v in eventos_brutos if w is not None]

    semana_600_por_codigo = {v.codigo: semana_600g(v) for v in ativos}
    semana_atual_por_codigo = {v.codigo: semana_atual_de(v) for v in ativos}

    # estado compartilhado (persiste e vai sendo consumido conforme os
    # eventos são resolvidos em ordem cronológica)
    vazios_dinamico: list = list(vazios_reais)
    codigos_no_pool = {v.codigo for v in vazios_reais}
    capacidade_restante: dict[str, int] = {v.codigo: capacidade_un(v) for v in vazios_reais}
    ocupantes_semana: dict[str, list] = {v.codigo: [] for v in vazios_reais}
    semana_por_codigo_global: dict[str, int | None] = dict(semana_atual_por_codigo)

    def _adicionar_ao_pool(codigo: str, tipo: str, area_m2: float):
        obj = _DestinoProjetado(codigo, tipo, area_m2)
        vazios_dinamico.append(obj)
        codigos_no_pool.add(codigo)
        capacidade_restante[codigo] = capacidade_un(obj)
        ocupantes_semana[codigo] = []
        return obj

    resolvidos_antecipadamente: set[str] = set()
    tanques_ativados_total: list[str] = []
    eventos_saida: list[EventoProjetadoOut] = []

    def _tentar(origem_proj):
        """Tenta alocar em cima de CÓPIAS de capacidade_restante/
        ocupantes_semana — `_alocar_repicagem` muta esses dicts mesmo
        quando falha (aloca parcialmente antes de descobrir que não
        fecha), e como aqui eles são compartilhados entre eventos, uma
        tentativa fracassada não pode "gastar" vaga de verdade — só
        confirma (copia de volta) o que foi alocado quando dá certo."""
        cap_copia = dict(capacidade_restante)
        ocup_copia = {k: list(v) for k, v in ocupantes_semana.items()}
        resultado = _alocar_repicagem(
            [origem_proj], vazios_dinamico, capacidade_un, semana_por_codigo_global, exigir_completo=True,
            capacidade_restante=cap_copia, ocupantes_semana=ocup_copia,
        )
        if resultado is not None:
            capacidade_restante.clear()
            capacidade_restante.update(cap_copia)
            ocupantes_semana.clear()
            ocupantes_semana.update(ocup_copia)
        return resultado

    for w, origem in eventos_brutos:
        if origem.codigo in resolvidos_antecipadamente:
            continue

        sem_origem_no_evento = min((semana_atual_por_codigo[origem.codigo] or 0) + w, semana_maxima_curva)
        semana_por_codigo_global[origem.codigo] = sem_origem_no_evento
        origem_proj = _DestinoProjetado(origem.codigo, origem.tipo, origem.area_m2, origem.lote_atual)

        resultado = _tentar(origem_proj)
        resolvido_com = "repicagem"
        tanques_ativados_neste_evento: list[str] = []
        tanques_despescados_neste_evento: list[str] = []

        if resultado is None:
            # tenta despesca: candidatos já maduros (>= 600g) até a semana
            # w, ainda não usados, priorizando maior peso projetado e
            # menor quantidade de peixes — mesma regra do nível 3 de hoje
            candidatos = []
            for c in ativos:
                if c.codigo == origem.codigo or c.codigo in codigos_no_pool or c.codigo in resolvidos_antecipadamente:
                    continue
                sem600 = semana_600_por_codigo.get(c.codigo)
                if sem600 is None or sem600 > w:
                    continue
                sem_c_no_evento = min((semana_atual_por_codigo[c.codigo] or 0) + w, semana_maxima_curva)
                peso_c_no_evento = _peso_para_semana(curva, sem_c_no_evento)
                candidatos.append((c, peso_c_no_evento))
            candidatos.sort(key=lambda item: (-item[1], item[0].lote_atual.saldo_un))

            for c, _peso in candidatos:
                _adicionar_ao_pool(c.codigo, c.tipo, c.area_m2)
                resolvidos_antecipadamente.add(c.codigo)
                resolvido_com = "despesca"
                tanques_despescados_neste_evento.append(c.codigo)
                resultado = _tentar(origem_proj)
                if resultado is not None:
                    break

        if resultado is None:
            # último recurso: ativar tanques hoje inativos, em ordem
            # numérica crescente
            for cod in codigos_inativos_ordenados:
                if cod in codigos_no_pool:
                    continue
                info = info_por_codigo[cod]
                _adicionar_ao_pool(cod, info["tipo"], float(info["area_m2"]))
                tanques_ativados_neste_evento.append(cod)
                if cod not in tanques_ativados_total:
                    tanques_ativados_total.append(cod)
                resolvido_com = "ativacao"
                resultado = _tentar(origem_proj)
                if resultado is not None:
                    break

        if resultado is not None and origem.codigo not in codigos_no_pool:
            # o lote de origem inteiro foi repicado pra fora — o tanque
            # dele mesmo fica vazio e passa a valer como destino pra
            # eventos futuros também
            _adicionar_ao_pool(origem.codigo, origem.tipo, origem.area_m2)

        data_prevista = date.today() + timedelta(weeks=w)
        resolvido = resultado is not None
        if not resolvido:
            detalhe = "Mesmo repicando, despescando tanques prontos e ativando todos os tanques inativos disponíveis, ainda não fecha a conta — vai faltar espaço."
        elif resolvido_com == "repicagem":
            detalhe = "Cabe repicar direto nos tanques vazios que já existirão nessa altura."
        elif resolvido_com == "despesca":
            detalhe = f"Só cabe se despescar antes o(s) tanque(s) que já estarão prontos (>= 600g) nessa altura: {', '.join(tanques_despescados_neste_evento)}."
        else:
            detalhe = f"Só cabe ativando o(s) tanque(s) hoje inativo(s): {', '.join(tanques_ativados_neste_evento)}."

        eventos_saida.append(EventoProjetadoOut(
            viveiro_codigo=origem.codigo, lote_codigo=origem.lote_atual.codigo,
            semanas_a_partir_de_hoje=w, data_prevista=data_prevista,
            resolvido=resolvido, resolvido_com=resolvido_com, detalhe=detalhe,
            tanques_a_despescar=tanques_despescados_neste_evento,
            tanques_a_ativar=tanques_ativados_neste_evento,
        ))

    return ProjecaoCapacidadeOut(
        horizonte_semanas=SEMANA_LIMITE_ABATE,
        eventos=eventos_saida,
        algum_precisa_ativar_tanque=any(e.tanques_a_ativar for e in eventos_saida),
    )


@router.get("/viveiros/{viveiro_id}/historico-lote", response_model=HistoricoLoteOut)
def historico_lote(viveiro_id: int, db: Session = Depends(get_db)):
    """Histórico de crescimento do lote ativo desse viveiro: povoamento +
    cada biometria lançada desde então, comparando o peso real com o
    esperado pela curva (mesma regra do peso_esperado_pela_idade_g do
    painel — parte do peso de entrada do lote nesse viveiro, projetado
    pela idade em semanas) e a conversão alimentar realizada em cada
    intervalo entre biometrias contra a esperada pela tabela de
    arraçoamento no mesmo intervalo de tempo."""
    lote = db.execute(text("""
        SELECT l.id, l.codigo AS lote_codigo, l.data_inicio, l.quantidade_inicial,
               l.peso_medio_inicial_g, v.codigo AS viveiro_codigo, v.area_m2
        FROM lote l JOIN viveiro v ON v.id = l.viveiro_id
        WHERE v.id = :viveiro_id AND l.data_fim IS NULL
    """), {"viveiro_id": viveiro_id}).mappings().first()
    if lote is None:
        raise HTTPException(404, "Nenhum lote ativo nesse viveiro.")

    curva = _carregar_curva(db)
    semana_maxima = curva[-1]["semana"]
    tabela = db.execute(text("SELECT semana, consumo_semanal_kg FROM tabela_arracoamento ORDER BY semana")).mappings().all()
    consumo_por_semana = {t["semana"]: float(t["consumo_semanal_kg"]) for t in tabela}
    semana_maxima_tabela = max(consumo_por_semana)

    biometrias = db.execute(text("""
        SELECT data, peso_medio_g FROM biometria WHERE lote_id = :lote_id ORDER BY data
    """), {"lote_id": lote["id"]}).mappings().all()

    # busca despesca/repicagem/arraçoamento inteiros de uma vez e soma em
    # Python por ponto — em vez de repetir a mesma consulta uma vez por
    # ponto, o que faz o pglite quebrar (ele não sustenta bem os
    # "prepared statements" que o psycopg cria sozinho pra texto de query
    # repetido)
    despesca_rows = db.execute(
        text("SELECT data, quantidade_un FROM despesca WHERE lote_id = :l AND excluido_em IS NULL"), {"l": lote["id"]},
    ).mappings().all()
    origem_rows = db.execute(
        text("SELECT data, quantidade FROM lote_origem WHERE lote_origem_id = :l AND excluido_em IS NULL"), {"l": lote["id"]},
    ).mappings().all()
    arracoamento_rows = db.execute(
        text("SELECT data, sacos FROM arracoamento WHERE lote_id = :l AND excluido_em IS NULL"), {"l": lote["id"]},
    ).mappings().all()

    area_m2 = float(lote["area_m2"])
    quantidade_inicial = lote["quantidade_inicial"]
    data_inicio = lote["data_inicio"]
    peso_inicial_g = float(lote["peso_medio_inicial_g"])
    semana_inicial = _semana_para_peso(curva, peso_inicial_g)

    def semana_esperada_em(data_ponto: date) -> int:
        semanas = max(0, (data_ponto - data_inicio).days // 7)
        return min(semana_inicial + semanas, semana_maxima)

    def saldo_ate(data_referencia: date) -> int:
        # mesma regra da vw_saldo_lote, só que avaliada numa data
        # específica em vez de "até hoje" — só despesca e repicagem de
        # saída reduzem o saldo, então dá pra reconstruir o saldo em
        # qualquer data passada
        despescado = sum(r["quantidade_un"] for r in despesca_rows if r["data"] <= data_referencia)
        repicado = sum(r["quantidade"] for r in origem_rows if r["data"] <= data_referencia)
        return quantidade_inicial - despescado - repicado

    def racao_intervalo_kg(data_de: date, data_ate: date) -> float:
        sacos = sum(float(r["sacos"]) for r in arracoamento_rows if data_de < r["data"] <= data_ate)
        return sacos * 25

    # ponto zero = povoamento (entrada do lote nesse viveiro), depois uma
    # linha por biometria lançada
    linha = [{"data": data_inicio, "peso_real_g": peso_inicial_g}]
    linha += [{"data": b["data"], "peso_real_g": float(b["peso_medio_g"])} for b in biometrias]

    pontos = []
    anterior = None
    for p in linha:
        semana_esp = semana_esperada_em(p["data"])
        peso_esperado_g = _peso_para_semana(curva, semana_esp)
        saldo_un = saldo_ate(p["data"])
        densidade_kg_m2 = (saldo_un * p["peso_real_g"] / 1000 / area_m2) if area_m2 else None
        biomassa_kg = saldo_un * p["peso_real_g"] / 1000

        conversao_realizada = None
        conversao_esperada = None
        if anterior is not None:
            ganho_real_kg = biomassa_kg - anterior["biomassa_kg"]
            if ganho_real_kg > 0:
                conversao_realizada = racao_intervalo_kg(anterior["data"], p["data"]) / ganho_real_kg

            if semana_esp > anterior["semana_esp"]:
                consumo_semanal_total = sum(
                    consumo_por_semana.get(min(s, semana_maxima_tabela), 0.0)
                    for s in range(anterior["semana_esp"] + 1, semana_esp + 1)
                )
                ganho_esperado_g = peso_esperado_g - anterior["peso_esperado_g"]
                if ganho_esperado_g > 0:
                    conversao_esperada = consumo_semanal_total / ganho_esperado_g

        pontos.append(PontoHistoricoLoteOut(
            data=p["data"], peso_real_g=p["peso_real_g"], peso_esperado_g=peso_esperado_g,
            saldo_un=saldo_un, densidade_kg_m2=densidade_kg_m2,
            conversao_realizada_intervalo=conversao_realizada, conversao_esperada_intervalo=conversao_esperada,
        ))
        anterior = {
            "data": p["data"], "biomassa_kg": biomassa_kg,
            "semana_esp": semana_esp, "peso_esperado_g": peso_esperado_g,
        }

    return HistoricoLoteOut(
        viveiro_codigo=lote["viveiro_codigo"], lote_codigo=lote["lote_codigo"],
        area_m2=area_m2, data_inicio=data_inicio, pontos=pontos,
    )
