"""Chama TODOS os endpoints GET (sem parâmetro de rota) com o banco já populado
pelos testes de fluxo. Nenhum pode responder 500: pega coluna removida, SQL
quebrado e erro de schema de resposta em qualquer tela."""
from app.main import app


def _rotas_get():
    return sorted(
        r.path for r in app.routes
        if hasattr(r, "methods") and "GET" in r.methods and "{" not in r.path
        and not r.path.startswith(("/docs", "/redoc", "/openapi"))
    )


def test_nenhum_get_responde_500(api):
    falhas = []
    for rota in _rotas_get():
        resp = api.get(rota)
        if resp.status_code >= 500:
            falhas.append(f"{rota} -> {resp.status_code}")
    assert not falhas, falhas


def test_health_detalhado(api):
    r = api.get("/health/detalhado")
    assert r.status_code == 200 and r.json()["status"] == "ok", r.text
