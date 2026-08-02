"""
Configuração via variáveis de ambiente — nenhum valor específico de provedor
fica hardcoded aqui, para que trocar de nuvem seja só trocar o .env.
"""
import os
from functools import lru_cache


def _normalizar_database_url(bruta: str) -> str:
    """Provedores gerenciados (Railway, Render, etc.) costumam injetar
    DATABASE_URL no formato "postgresql://" puro, sem indicar o driver — o
    SQLAlchemy então tentaria psycopg2 (não instalado aqui). Força o mesmo
    driver psycopg 3 usado localmente, sem exigir que ninguém edite a
    variável de ambiente gerada automaticamente pela plataforma."""
    if bruta.startswith("postgresql://"):
        return "postgresql+psycopg://" + bruta[len("postgresql://"):]
    return bruta


class Settings:
    # string de conexão padrão do Postgres (funciona com qualquer provedor:
    # Supabase, Neon, RDS, um servidor próprio, etc.). Driver psycopg 3, que
    # suporta modo assíncrono nativamente.
    database_url: str = _normalizar_database_url(os.environ.get(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:postgres@127.0.0.1:55432/postgres",
    ))
    # origens liberadas para o frontend chamar a API (CORS)
    cors_origins: list[str] = [
        o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()
    ]
    env: str = os.environ.get("APP_ENV", "development")
    # deixa o driver decidir por padrão (funciona com qualquer Postgres real
    # em nuvem); só desliga explicitamente para testes locais contra
    # servidores minimalistas que não implementam o handshake SSL completo
    db_ssl_disabled: bool = os.environ.get("DB_SSL_DISABLED", "false").lower() == "true"
    # assina os tokens de login — troque por um valor único e secreto antes
    # de colocar em produção (o padrão aqui só serve pra rodar local)
    jwt_secret: str = os.environ.get("JWT_SECRET", "dev-secret-troque-em-producao")
    jwt_dias_validade: int = int(os.environ.get("JWT_DIAS_VALIDADE", "30"))
    # leitura das fichas fotografadas (arraçoamento/produção) via Gemini —
    # sem a chave, os endpoints de leitura ficam indisponíveis (422), mas o
    # resto do sistema funciona normalmente
    gemini_api_key: str | None = os.environ.get("GEMINI_API_KEY")
    gemini_model: str = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")


@lru_cache
def get_settings() -> Settings:
    return Settings()
