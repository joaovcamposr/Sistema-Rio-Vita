from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth import get_current_user
from .config import get_settings
from .routers import (
    ajustes_estoque,
    analise_agua,
    arracoamento,
    auth,
    biometria,
    clientes,
    despesas,
    despescas,
    expedicoes,
    lotes,
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

app = FastAPI(
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
app.include_router(biometria.router, dependencies=_exige_login)
app.include_router(arracoamento.router, dependencies=_exige_login)
app.include_router(analise_agua.router, dependencies=_exige_login)
app.include_router(clientes.router, dependencies=_exige_login)
app.include_router(vendas.router, dependencies=_exige_login)
app.include_router(vendedores.router, dependencies=_exige_login)
app.include_router(expedicoes.router, dependencies=_exige_login)
app.include_router(despesas.router, dependencies=_exige_login)
app.include_router(paineis.router, dependencies=_exige_login)
app.include_router(parametros.router, dependencies=_exige_login)
app.include_router(ajustes_estoque.router, dependencies=_exige_login)
app.include_router(racao.router, dependencies=_exige_login)


@app.get("/health")
async def health():
    """O app do celular usa isso para decidir se está online antes de tentar
    sincronizar a fila de lançamentos pendentes."""
    return {"status": "ok"}
