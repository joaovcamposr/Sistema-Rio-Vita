"""
Configuração via variáveis de ambiente — nenhum valor específico de provedor
fica hardcoded aqui, para que trocar de nuvem seja só trocar o .env.
"""
import os
from functools import lru_cache


class Settings:
    # string de conexão padrão do Postgres (funciona com qualquer provedor:
    # Supabase, Neon, RDS, um servidor próprio, etc.). Driver psycopg 3, que
    # suporta modo assíncrono nativamente.
    database_url: str = os.environ.get(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:postgres@127.0.0.1:55432/postgres",
    )
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
