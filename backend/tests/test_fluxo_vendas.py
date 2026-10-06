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
    cli = api.post("/clientes", json={"nome": "Peixaria Teste", "prazo_dias": 14}).json()
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
