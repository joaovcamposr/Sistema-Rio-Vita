"""
Testes de integração: rodam contra um Postgres de verdade (DATABASE_URL), que
é preparado do zero pelo próprio executor de migrações — então toda execução
também prova que as 30+ migrações aplicam limpas num banco vazio.

Local: aponte DATABASE_URL para um banco DESCARTÁVEL (nunca o de produção).
"""
import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

os.environ.setdefault("ROTINAS_DESLIGADAS", "1")

from app import migrar  # noqa: E402
from app.auth import criar_token, hash_senha  # noqa: E402
from app.db import get_engine_admin  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def banco():
    url = os.environ.get("DATABASE_URL", "")
    assert "railway" not in url and "rlwy" not in url, "recusando rodar testes contra um banco da Railway"
    assert migrar.aplicar() == 0
    with get_engine_admin().begin() as c:
        c.execute(text("""
            INSERT INTO produto (nome, unidade_embalagem, fator_kg, kg_digitado)
            VALUES ('Filé 500g', 'pacote', 0.5, false), ('Tilápia limpa', NULL, NULL, true)
            ON CONFLICT (nome) DO NOTHING
        """))
    yield


@pytest.fixture(scope="session")
def api(banco):
    with get_engine_admin().begin() as c:
        uid = c.execute(text("""
            INSERT INTO usuario (nome, email, senha_hash, papel)
            VALUES ('Teste Gerente', :e, :h, 'gerente') RETURNING id
        """), {"e": f"teste-{uuid.uuid4().hex[:6]}@riovita.test", "h": hash_senha("x")}).scalar()
    cliente = TestClient(app, raise_server_exceptions=False)
    cliente.headers["Authorization"] = f"Bearer {criar_token(uid)}"
    return cliente


@pytest.fixture(scope="session")
def produto_id(banco):
    with get_engine_admin().connect() as c:
        return c.execute(text("SELECT id FROM produto WHERE nome = 'Filé 500g'")).scalar_one()
