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

import re

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from .config import get_settings

_engine: Engine | None = None
_engine_admin: Engine | None = None
_session_maker: sessionmaker[Session] | None = None
# só usado em teste local (DB_SSL_DISABLED) — ver get_db()
_lock_serializa_teste_local = threading.Lock()


# A API nunca altera esquema: só migrações (app.migrar) e restauração de
# backup fazem DDL, e usam get_engine_admin(). Se algum código da API tentar
# DROP/ALTER/CREATE/TRUNCATE/GRANT, a execução é recusada aqui — uma trava a
# mais contra um erro de programação virar perda de dados.
_DDL = re.compile(r"^\s*(DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|VACUUM|REINDEX)\b", re.IGNORECASE)


def _bloquear_ddl(conn, cursor, statement, parameters, context, executemany):
    if _DDL.match(statement):
        raise RuntimeError(f"comando de esquema bloqueado na API: {statement[:60]!r}")


def _criar_engine(com_trava: bool) -> Engine:
    settings = get_settings()
    # prepare_threshold=None: o PGlite de teste não aceita o auto-prepare do psycopg 3
    connect_args = {"sslmode": "disable", "prepare_threshold": None} if settings.db_ssl_disabled else {}
    engine_kwargs = {"pool_pre_ping": True, "connect_args": connect_args}
    if settings.db_ssl_disabled:
        # servidor de teste local (pglite-socket) não suporta múltiplas
        # conexões físicas simultâneas, e também não recupera bem uma
        # conexão reaproveitada após ROLLBACK — troca por uma conexão
        # nova e descartável a cada requisição (NullPool), serializadas
        # pelo lock abaixo. Postgres de verdade não tem nenhuma dessas
        # limitações; nunca ative DB_SSL_DISABLED fora de teste local.
        engine_kwargs["poolclass"] = NullPool
    engine = create_engine(settings.database_url, **engine_kwargs)
    if com_trava:
        event.listen(engine, "before_cursor_execute", _bloquear_ddl)
    return engine


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = _criar_engine(com_trava=True)
    return _engine


def get_engine_admin() -> Engine:
    """Só para app.migrar e restauração de backup — sem a trava de DDL."""
    global _engine_admin
    if _engine_admin is None:
        _engine_admin = _criar_engine(com_trava=False)
    return _engine_admin


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
