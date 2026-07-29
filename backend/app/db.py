"""
Engine do SQLAlchemy, usada apenas para pool de conexões e para rodar SQL
explícito (text()) — sem ORM. As regras de negócio já vivem no banco
(triggers, views, constraints); a API não deve reimplementá-las.

Síncrona de propósito: o volume de lançamentos da Rio Vita é pequeno (poucos
usuários, alguns milhares de registros por mês). O FastAPI roda rotas
síncronas em threadpool automaticamente, então não se perde concorrência —
e evita-se toda uma classe de armadilhas de driver assíncrono por Postgres.
"""
import threading
from collections.abc import Generator

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from .config import get_settings

_engine: Engine | None = None
_session_maker: sessionmaker[Session] | None = None
# só usado em teste local (DB_SSL_DISABLED) — ver get_db()
_lock_serializa_teste_local = threading.Lock()


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        settings = get_settings()
        connect_args = {"sslmode": "disable"} if settings.db_ssl_disabled else {}
        engine_kwargs = {"pool_pre_ping": True, "connect_args": connect_args}
        if settings.db_ssl_disabled:
            # servidor de teste local (pglite-socket) não suporta múltiplas
            # conexões físicas simultâneas, e também não recupera bem uma
            # conexão reaproveitada após ROLLBACK — troca por uma conexão
            # nova e descartável a cada requisição (NullPool), serializadas
            # pelo lock abaixo. Postgres de verdade não tem nenhuma dessas
            # limitações; nunca ative DB_SSL_DISABLED fora de teste local.
            engine_kwargs["poolclass"] = NullPool
        _engine = create_engine(settings.database_url, **engine_kwargs)
    return _engine


def get_session_maker() -> sessionmaker[Session]:
    global _session_maker
    if _session_maker is None:
        _session_maker = sessionmaker(get_engine(), expire_on_commit=False)
    return _session_maker


def get_db() -> Generator[Session, None, None]:
    if get_settings().db_ssl_disabled:
        # o servidor de teste local (pglite-socket) quebra permanentemente se
        # duas requisições tentam conectar ao mesmo tempo — a corrida ocorre
        # na aceitação da conexão TCP, antes mesmo do pool do SQLAlchemy.
        # Serializa tudo aqui só neste modo. Postgres de verdade não precisa
        # disso: nunca ative DB_SSL_DISABLED em produção.
        with _lock_serializa_teste_local:
            with get_session_maker()() as session:
                yield session
    else:
        with get_session_maker()() as session:
            yield session
