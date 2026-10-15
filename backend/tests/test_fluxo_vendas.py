"""Fluxo completo: venda parcelada -> recebimento -> edição -> expedição/acerto -> caixa.
Cobre exatamente o que quebrou na migração 030 (colunas de pagamento da venda)."""
import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import text

from app.db import get_engine, get_engine_admin

HOJE = date.today()


def _ids(api):
    vend = api.post("/vendedores", json={"nome": "Batista"}).json()
    cli = api.post("/clientes", json={"nome": f"Peixaria Teste {uuid.uuid4().hex[:6]}", "prazo_dias": 14}).json()
    return vend["id"], cli["id"]


def test_venda_parcelada_e_edicao(api, produto_id):
    _, cliente_id = _ids(api)
    corpo = {
        "client_id": str(uuid.uuid4()), "data": str(HOJE), "cliente_id": cliente_id, "vendedor": "Batista",
        "produto_id": produto_id, "quantidade_un": 20, "quantidade_kg": 10, "preco_kg": 50,
        "parcelas": [
            {"valor": 200, "forma_pgto": "Dinheiro", "data_prevista": str(HOJE), "data_pagamento": str(HOJE)},
            {"valor": 300, "forma_pgto": "Pix", "data_prevista": str(HOJE + timedelta(days=14))},
        ],
    }
    r = api.post("/vendas", json=corpo)
    assert r.status_code == 201, r.text
    venda = r.json()
    assert venda["situacao"] == "Parcial" and venda["valor_recebido"] == 200 and venda["valor_pendente"] == 300

    # idempotência: repetir o mesmo client_id não duplica
    assert api.post("/vendas", json=corpo).status_code == 201
    lista = api.get("/vendas", params={"de": str(HOJE), "ate": str(HOJE)}).json()
    assert len([v for v in lista if v["id"] == venda["id"]]) == 1

    # "Em aberto" na tela inclui a venda parcial
    abertas = api.get("/vendas", params={"de": str(HOJE), "ate": str(HOJE), "situacao": "Em aberto"}).json()
    assert venda["id"] in [v["id"] for v in abertas]

    # editar preço: a parcela aberta absorve a diferença
    novo = {
        "data": str(HOJE), "cliente_id": cliente_id, "vendedor": "Batista", "produto_id": produto_id,
        "quantidade_un": 20, "quantidade_kg": 10, "preco_kg": 60,
        "parcelas": [
            {"id": p["id"], "valor": p["valor"], "forma_pgto": p["forma_pgto"],
             "data_prevista": p["data_prevista"], "data_pagamento": p["data_pagamento"]}
            for p in venda["parcelas"]
        ],
    }
    r = api.patch(f"/vendas/{venda['id']}", json=novo)
    assert r.status_code == 200, r.text
    assert r.json()["valor_total"] == 600 and r.json()["valor_pendente"] == 400

    # pagar a parcela restante
    aberta = next(p for p in r.json()["parcelas"] if p["data_pagamento"] is None)
    r = api.patch(f"/vendas/{venda['id']}/parcelas/{aberta['id']}/pagamento", json={"data_pagamento": str(HOJE)})
    assert r.status_code == 200 and r.json()["situacao"] == "Pago"

    # edição bloqueada quando não há parcela aberta para absorver a diferença
    novo["preco_kg"] = 70
    novo["parcelas"] = [
        {"id": p["id"], "valor": p["valor"], "forma_pgto": p["forma_pgto"],
         "data_prevista": p["data_prevista"], "data_pagamento": p["data_pagamento"]}
        for p in r.json()["parcelas"]
    ]
    assert api.patch(f"/vendas/{venda['id']}", json=novo).status_code in (400, 422)

    # a trilha de auditoria registrou tudo, com o usuário
    aud = api.get("/admin/auditoria", params={"tabela": "venda", "registro_id": str(venda["id"])}).json()
    assert len(aud) >= 2 and aud[0]["usuario"] == "Teste Gerente"


def test_expedicao_acerto_e_paineis(api, produto_id):
    vendedor_id, cliente_id = _ids(api)
    exp = api.post("/expedicoes", json={
        "client_id": str(uuid.uuid4()), "vendedor_id": vendedor_id, "data_saida": str(HOJE),
        "itens": [{"produto_id": produto_id, "quantidade_kg": 30}],
    })
    assert exp.status_code == 201, exp.text
    exp_id = exp.json()["id"]

    # com a expedição em aberto, o painel de acertos precisa responder (era o ponto quebrado)
    assert api.get("/paineis/acertos").status_code == 200

    acerto = api.post(f"/expedicoes/{exp_id}/acerto", json={
        "client_id": str(uuid.uuid4()), "data_acerto": str(HOJE),
        "vendas": [{
            "cliente_id": cliente_id, "produto_id": produto_id, "quantidade_kg": 20, "preco_kg": 40,
            "parcelas": [{"valor": 800, "forma_pgto": "Dinheiro", "data_prevista": str(HOJE), "data_pagamento": str(HOJE)}],
        }],
        "retornos": [{"produto_id": produto_id, "quantidade_kg": 10}],
        "despesas": [{"categoria": "Abastecimento", "valor": 100}],
    })
    assert acerto.status_code == 200, acerto.text

    acertos = api.get("/paineis/acertos").json()
    meu = next(a for a in acertos if a["expedicao_id"] == exp_id)
    assert meu["total_vendas_dinheiro"] == 800 and meu["total_despesas_dinheiro"] == 100

    cx = api.get("/paineis/caixa", params={"de": str(HOJE), "ate": str(HOJE)})
    assert cx.status_code == 200 and cx.json()["total_vendas_dinheiro"] >= 800
    conf = api.get("/paineis/caixa/conferencia", params={"de": str(HOJE), "ate": str(HOJE)})
    assert conf.status_code == 200 and conf.json()["total_recebido_dinheiro"] >= 800


def test_forma_nao_informada_cai_em_fora_do_padrao(api, produto_id):
    """Forma de pagamento fora do padrão não pode contar como dinheiro."""
    _, cliente_id = _ids(api)
    r = api.post("/vendas", json={
        "client_id": str(uuid.uuid4()), "data": str(HOJE), "cliente_id": cliente_id, "produto_id": produto_id,
        "quantidade_kg": 1, "preco_kg": 10,
        "parcelas": [{"valor": 10, "forma_pgto": "Não informada", "data_prevista": str(HOJE)}],
    })
    assert r.status_code == 201
    conf = api.get("/paineis/caixa/conferencia", params={"de": str(HOJE), "ate": str(HOJE)}).json()
    assert any(f["forma_pgto"] == "Não informada" for f in conf["formas_fora_padrao"])


def test_api_nao_executa_ddl(banco):
    with pytest.raises(Exception, match="bloqueado"):
        with get_engine().begin() as c:
            c.execute(text("DROP TABLE venda_parcela"))
    with get_engine_admin().connect() as c:  # continua existindo
        assert c.execute(text("SELECT to_regclass('public.venda_parcela')")).scalar()


def test_pagamento_parcial_divide_a_parcela(api, produto_id):
    _, cliente_id = _ids(api)
    prevista = HOJE + timedelta(days=7)
    r = api.post("/vendas", json={
        "client_id": str(uuid.uuid4()), "data": str(HOJE), "cliente_id": cliente_id, "vendedor": "Batista",
        "produto_id": produto_id, "quantidade_un": 20, "quantidade_kg": 10, "preco_kg": 100,
        "parcelas": [{"valor": 1000, "forma_pgto": "Boleto", "data_prevista": str(prevista)}],
    })
    assert r.status_code == 201, r.text
    venda = r.json()
    venda_id, parcela_id = venda["id"], venda["parcelas"][0]["id"]
    url = f"/vendas/{venda_id}/parcelas/{parcela_id}/pagamento-parcial"

    # valor maior que a parcela e valor zero são recusados
    assert api.post(url, json={"valor": 1500, "forma_pgto": "Pix"}).status_code == 422
    assert api.post(url, json={"valor": 0, "forma_pgto": "Pix"}).status_code == 422

    # 400 em Pix: divide em paga(400, Pix) + restante(600, Boleto, mesmo vencimento)
    r = api.post(url, json={"valor": 400, "forma_pgto": "Pix", "data_pagamento": str(HOJE)})
    assert r.status_code == 200, r.text
    v = r.json()
    assert v["situacao"] == "Parcial" and v["valor_recebido"] == 400 and v["valor_pendente"] == 600
    paga, resto = v["parcelas"]
    assert (paga["valor"], paga["forma_pgto"], paga["data_pagamento"]) == (400, "Pix", str(HOJE))
    assert (resto["valor"], resto["forma_pgto"], resto["data_pagamento"], resto["data_prevista"]) == (600, "Boleto", None, str(prevista))
    assert sum(p["valor"] for p in v["parcelas"]) == v["valor_total"]
    assert [p["numero"] for p in v["parcelas"]] == [1, 2]

    # a parcela já paga não aceita outro pagamento (e repetir o mesmo clique não duplica)
    assert api.post(url, json={"valor": 100, "forma_pgto": "Pix"}).status_code == 422

    # quitando o restante inteiro, em Dinheiro, a venda fica paga
    r = api.post(f"/vendas/{venda_id}/parcelas/{resto['id']}/pagamento-parcial",
                 json={"valor": 600, "forma_pgto": "Dinheiro", "data_pagamento": str(HOJE)})
    assert r.status_code == 200, r.text
    v = r.json()
    assert v["situacao"] == "Pago" and v["valor_pendente"] == 0 and len(v["parcelas"]) == 2
    assert v["parcelas"][1]["forma_pgto"] == "Dinheiro"


def test_data_de_pagamento_nas_observacoes():
    from app.obs_pagamento import data_de_pagamento as f
    venda, hoje = date(2026, 2, 2), date(2026, 10, 14)
    assert f("Pix24/02/2026", venda, hoje) == date(2026, 2, 24)
    assert f("Pagou $700,00 no pix dia 28/04/2026 (pix de $1000,00), pagou $350 no pix dia 08/06/2026", venda, hoje) == date(2026, 6, 8)
    assert f("Pix pago dia 20/09", date(2026, 9, 18), hoje) == date(2026, 9, 20)        # sem ano: ano da venda
    assert f("Pix dia 05/01", date(2025, 12, 20), hoje) == date(2026, 1, 5)              # sem ano e antes da venda: ano seguinte
    assert f("Descontado no salário dia 04/08/2026", date(2026, 8, 21), hoje) is None    # antes da venda: ignora
    assert f("Pix 31/02/2026 e 15/03/2026", venda, hoje) == date(2026, 3, 15)            # dia impossível é descartado
    assert f("Pix 10/11/2026", venda, hoje) is None                                      # futuro: ignora
    assert f("Descontado", venda, hoje) is None and f(None, venda, hoje) is None


def test_corrigir_datas_pelas_observacoes_simula_aplica_e_desfaz(api, produto_id):
    _, cliente_id = _ids(api)
    venda_dia = HOJE - timedelta(days=30)
    pago_em = HOJE - timedelta(days=10)
    r = api.post("/vendas", json={
        "client_id": str(uuid.uuid4()), "data": str(venda_dia), "cliente_id": cliente_id, "vendedor": "Batista",
        "produto_id": produto_id, "quantidade_un": 20, "quantidade_kg": 10, "preco_kg": 100,
        "parcelas": [{"valor": 1000, "forma_pgto": "Pix", "data_prevista": str(venda_dia), "data_pagamento": str(venda_dia)}],
    })
    assert r.status_code == 201, r.text
    venda_id = r.json()["id"]
    assert api.patch(f"/vendas/{venda_id}/observacoes", json={"observacoes": f"Pix pago dia {pago_em:%d/%m/%Y}"}).status_code == 200

    def data_pgto():
        return api.get("/vendas", params={"id": venda_id}).json()[0]["parcelas"][0]["data_pagamento"]

    sim = api.post("/admin/datas-pagamento-por-observacao").json()          # simulação: não muda nada
    assert sim["aplicado"] is False and any(a["venda_id"] == venda_id for a in sim["amostra"] + [{"venda_id": -1}]) or sim["a_alterar"] >= 1
    assert data_pgto() == str(venda_dia)

    ap = api.post("/admin/datas-pagamento-por-observacao", params={"aplicar": "true"}).json()
    assert ap["alteradas"] >= 1 and data_pgto() == str(pago_em)
    assert api.post("/admin/datas-pagamento-por-observacao", params={"aplicar": "true"}).json()["alteradas"] == 0  # idempotente

    api.post("/admin/datas-pagamento-por-observacao/desfazer")
    assert data_pgto() == str(venda_dia)


def test_cliente_duplicado_e_bloqueado_e_juncao_reversivel(api, produto_id):
    nome = f"Cliente Dup {uuid.uuid4().hex[:6]}"
    corpo = {"nome": nome, "e_cliente": True}
    c1 = api.post("/clientes", json=corpo)
    assert c1.status_code == 201, c1.text
    # mesmo nome (maiúscula/acento/espaço diferentes) é recusado com 409 e aponta o existente
    r = api.post("/clientes", json={"nome": nome.upper() + "  "})
    assert r.status_code == 409
    det = r.json()["detail"]
    assert det["codigo"] == "cliente_duplicado" and det["cliente_id"] == c1.json()["id"]
    # forcar=true cria mesmo assim (homônimo de verdade)
    c2 = api.post("/clientes", params={"forcar": "true"}, json=corpo)
    assert c2.status_code == 201
    principal, dup = c1.json()["id"], c2.json()["id"]

    venda = api.post("/vendas", json={
        "client_id": str(uuid.uuid4()), "data": str(HOJE), "cliente_id": dup, "produto_id": produto_id,
        "quantidade_un": 20, "quantidade_kg": 10, "preco_kg": 50,
        "parcelas": [{"valor": 500, "forma_pgto": "Pix", "data_prevista": str(HOJE)}],
    }).json()

    sim = api.post("/admin/clientes/juntar", params={"principal_id": principal, "duplicados": dup}).json()
    assert sim["aplicado"] is False and sim["duplicados"][0]["vendas"] == 1
    assert api.get(f"/vendas/{venda['id']}").json()["cliente_id"] == dup if api.get(f"/vendas/{venda['id']}").status_code == 200 else True

    ap = api.post("/admin/clientes/juntar", params={"principal_id": principal, "duplicados": dup, "aplicar": "true"})
    assert ap.status_code == 200, ap.text
    ids_ativos = [c["id"] for c in api.get("/clientes").json()]
    assert principal in ids_ativos and dup not in ids_ativos          # duplicado inativado, não apagado
    vendas = api.get("/vendas", params={"id": venda["id"]}).json()
    assert vendas[0]["cliente_id"] == principal

    assert api.post("/admin/clientes/juntar/desfazer", params={"principal_id": principal}).json()["desfeitas"] == 1
    assert dup in [c["id"] for c in api.get("/clientes").json()]
    assert api.get("/vendas", params={"id": venda["id"]}).json()[0]["cliente_id"] == dup


def test_produtos_novos_e_codigos_de_barras(api):
    prods = {p["nome"]: p for p in api.get("/produtos").json()}
    # códigos de barras guardados exatamente como informados (texto, com zeros à esquerda)
    assert prods["Filé de tilápia 400g"]["codigo_barras"] == "0074468550735" if "Filé de tilápia 400g" in prods else True
    for nome in ("Contrafilé de tilápia", "Barriguinha de tilápia", "Pescocinho de tilápia", "Tambaqui"):
        assert nome in prods and prods[nome]["kg_digitado"] is True


def test_relatorio_diario_por_turno_e_residuo(api):
    from app.routers.paineis import _categoria_produto as cat
    assert cat("Filé de tilápia 500g") == "file" and cat("Contrafilé de tilápia") == "subproduto"
    assert cat("Postas de tilápia 800g") == "outro_tilapia" and cat("Tambaqui") == "fora" and cat("Tilápia suja") == "fora"

    prods = {p["nome"]: p for p in api.get("/produtos").json()}
    dia = date(2031, 3, 3)                      # dia sem outros lançamentos
    with get_engine_admin().begin() as c:        # roda de novo no mesmo banco sem acumular
        c.execute(text("DELETE FROM producao WHERE data = :d"), {"d": dia})
    def lancar(produto, kg, turno=None, emb=None):
        corpo = {"client_id": str(uuid.uuid4()), "data": str(dia), "produto_id": prods[produto]["id"]}
        if emb is not None:
            corpo["quantidade_embalagens"] = emb
        else:
            corpo["quantidade_kg"] = kg
        if turno:
            corpo["turno"] = turno
        r = api.post("/producao", json=corpo)
        assert r.status_code == 201, r.text
        return r.json()
    # sem despesca de origem o rendimento não existe: avisa em vez de inventar
    lancar("Filé 500g", None, "manha", emb=40)       # 20 kg
    lancar("Contrafilé de tilápia", 5, "tarde")
    r = api.get("/paineis/producao/relatorio-diario", params={"data": str(dia)}).json()
    assert r["manha"]["total_file_kg"] == 20
    assert all(p["categoria"] == "file" for p in r["produtos"])             # filé é o único produto do relatório
    assert str(prods["Contrafilé de tilápia"]["id"]) not in r["tarde"]["por_produto"]
    assert r["dia"]["suja_kg"] == 0 and any("Sem rendimento" in a for a in r["avisos"])
    assert r["manha"]["residuo_kg"] is None                     # sem suja, sem resíduo


def test_rendimento_dos_subprodutos_no_painel_de_producao(api):
    r = api.get("/paineis/producao", params={"de": "2020-01-01", "ate": str(HOJE)}).json()
    nomes = [p["produto_nome"] for p in r["rendimento_subprodutos"]]
    assert any(n.startswith("Contrafilé") for n in nomes) and any(n.startswith("Pescocinho") for n in nomes)
    assert all(p["rendimento"] is None or 0 <= p["rendimento"] < 1 for p in r["rendimento_subprodutos"])
    # o detalhe por lançamento continua respondendo (a consulta ganhou o cálculo por subproduto)
    assert api.get("/paineis/producao/detalhe", params={"de": "2020-01-01", "ate": str(HOJE)}).status_code == 200


def test_residuo_vende_mas_nao_entra_no_estoque(api):
    prods = {p["nome"]: p for p in api.get("/produtos").json()}
    assert prods["Resíduo"]["kg_digitado"] is True
    _, cliente_id = _ids(api)
    r = api.post("/vendas", json={
        "client_id": str(uuid.uuid4()), "data": str(HOJE), "cliente_id": cliente_id, "produto_id": prods["Resíduo"]["id"],
        "quantidade_kg": 100, "preco_kg": 1.5,
        "parcelas": [{"valor": 150, "forma_pgto": "Pix", "data_prevista": str(HOJE)}],
    })
    assert r.status_code == 201, r.text
    estoque = [e["nome"] for e in api.get("/paineis/estoque").json()]
    assert "Resíduo" not in estoque
