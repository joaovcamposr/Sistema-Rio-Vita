import logging
import traceback
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from . import migrar, rotinas
from .auth import get_current_user
from .config import get_settings
from .db import get_engine
from .routers import (
    admin,
    ajustes_estoque,
    analise_agua,
    arracoamento,
    auth,
    biometria,
    clientes,
    despesas,
    despescas,
    expedicoes,
    interacoes,
    lembretes,
    lotes,
    metas_abate,
    paineis,
    parametros,
    producao,
    produtos,
    racao,
    vendas,
    vendedores,
    viveiros,
)

settings = get_settings()
log = logging.getLogger("api")


@asynccontextmanager
async def _ciclo_de_vida(_app: FastAPI):
    rotinas.iniciar()
    yield


app = FastAPI(
    lifespan=_ciclo_de_vida,
    title="Rio Vita — API de Gestão Operacional",
    description="Substitui a planilha de controle. Financeiro, fiscal e contábil continuam no Omie.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# /auth/login fica público (senão ninguém consegue logar); os outros
# endpoints de /auth (me, criar usuário) já exigem login dentro do próprio
# router. Todo o resto do sistema exige um usuário autenticado.
app.include_router(auth.router)

_exige_login = [Depends(get_current_user)]
app.include_router(viveiros.router, dependencies=_exige_login)
app.include_router(produtos.router, dependencies=_exige_login)
app.include_router(despescas.router, dependencies=_exige_login)
app.include_router(producao.router, dependencies=_exige_login)
app.include_router(lotes.router, dependencies=_exige_login)
app.include_router(metas_abate.router, dependencies=_exige_login)
app.include_router(biometria.router, dependencies=_exige_login)
app.include_router(arracoamento.router, dependencies=_exige_login)
app.include_router(analise_agua.router, dependencies=_exige_login)
app.include_router(clientes.router, dependencies=_exige_login)
app.include_router(interacoes.router, dependencies=_exige_login)
app.include_router(lembretes.router, dependencies=_exige_login)
app.include_router(vendas.router, dependencies=_exige_login)
app.include_router(vendedores.router, dependencies=_exige_login)
app.include_router(expedicoes.router, dependencies=_exige_login)
app.include_router(despesas.router, dependencies=_exige_login)
app.include_router(paineis.router, dependencies=_exige_login)
app.include_router(parametros.router, dependencies=_exige_login)
app.include_router(ajustes_estoque.router, dependencies=_exige_login)
app.include_router(racao.router, dependencies=_exige_login)
app.include_router(admin.router, dependencies=_exige_login)


@app.get("/health")
async def health():
    """O app do celular usa isso para decidir se está online antes de tentar
    sincronizar a fila de lançamentos pendentes."""
    return {"status": "ok"}


def _registrar_erro(request: Request, exc: Exception) -> None:
    """Grava a exceção em erro_log. Nunca pode lançar: é chamada de dentro do
    tratador de erros."""
    try:
        usuario = None
        try:
            with get_engine().connect() as conn:
                usuario = conn.execute(text("SELECT NULLIF(current_setting('app.usuario', true), '')")).scalar()
        except Exception:
            pass
        with get_engine().begin() as conn:
            conn.execute(
                text("""INSERT INTO erro_log (metodo, rota, usuario, tipo, mensagem, traceback)
                        VALUES (:m, :r, :u, :t, :msg, :tb)"""),
                {
                    "m": request.method, "r": request.url.path, "u": usuario, "t": type(exc).__name__,
                    "msg": str(exc)[:2000],
                    "tb": "".join(traceback.format_exception(exc))[-8000:],
                },
            )
    except Exception:
        log.exception("não foi possível gravar o erro em erro_log")


@app.exception_handler(Exception)
async def erro_interno(request: Request, exc: Exception):
    """Todo erro não tratado vira uma resposta 500 normal (com cabeçalhos CORS)
    e fica registrado. Sem isto o navegador mostra "Failed to fetch" — o 500
    gerado pelo servidor fica fora do middleware de CORS."""
    log.exception("erro não tratado em %s %s", request.method, request.url.path)
    _registrar_erro(request, exc)
    resposta = JSONResponse({"detail": "erro interno do servidor"}, status_code=500)
    origem = request.headers.get("origin")
    if origem and origem in settings.cors_origins:
        resposta.headers["Access-Control-Allow-Origin"] = origem
        resposta.headers["Vary"] = "Origin"
    return resposta


@app.get("/health/detalhado")
def health_detalhado():
    """Para monitoramento externo. 200 = tudo certo; 503 = banco fora do ar,
    migração pendente ou rajada de erros internos nos últimos 15 minutos.
    Não expõe nenhum dado de negócio."""
    problemas: list[str] = []
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
            aplicadas = set(conn.execute(text("SELECT nome FROM schema_migration")).scalars().all())
            pendentes = [a.name for a in migrar.listar_arquivos() if a.name not in aplicadas]
            if pendentes:
                problemas.append(f"migrações pendentes: {len(pendentes)}")
            erros = conn.execute(text("""
                SELECT count(*) FROM erro_log
                WHERE quando > now() - interval '15 minutes' AND tipo <> 'aviso'
            """)).scalar_one()
            if erros >= 5:
                problemas.append(f"{erros} erros internos nos últimos 15 minutos")
    except Exception as e:  # banco inacessível, tabela ausente, etc.
        problemas.append(f"banco: {type(e).__name__}")
    corpo = {"status": "ok" if not problemas else "problema", "problemas": problemas}
    return JSONResponse(corpo, status_code=200 if not problemas else 503)
