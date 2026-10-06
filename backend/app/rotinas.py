"""
Rotinas em segundo plano da API.

Snapshot diário: todo dia, a partir das 03:00 (Brasília), copia as tabelas de
negócio para um schema `dia_AAAAMMDD` dentro do próprio banco e mantém os 7
últimos. Protege contra erro lógico (edição/exclusão errada, migração ruim,
bug) com recuperação em segundos — não protege contra perda do servidor de
banco inteiro; para isso existe o backup completo baixável (/admin/backup).

Trava de espaço: se o banco + snapshots já passarem de SNAPSHOT_MAX_MB
(padrão 300 — o volume do Postgres na Railway tem 500 MB), o snapshot do dia é pulado e o motivo vai para erro_log — um
mecanismo de proteção nunca pode encher o disco e derrubar o sistema.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from .db import get_engine_admin
from .migrar import criar_snapshot, podar_snapshots

log = logging.getLogger("rotinas")
BRASILIA = timezone(timedelta(hours=-3))
DIAS_MANTIDOS = 7
LOCK_ID = 7_272_002


def _registrar(mensagem: str) -> None:
    try:
        with get_engine_admin().begin() as c:
            c.execute(
                text("INSERT INTO erro_log (metodo, rota, tipo, mensagem) VALUES ('ROTINA', 'snapshot-diario', 'aviso', :m)"),
                {"m": mensagem[:2000]},
            )
    except Exception:
        log.exception("não foi possível registrar o aviso em erro_log")


def snapshot_do_dia(agora: datetime | None = None) -> str | None:
    """Cria o snapshot de hoje se ainda não existir. Devolve o nome criado."""
    agora = agora or datetime.now(BRASILIA)
    nome = f"dia_{agora:%Y%m%d}"
    limite_mb = int(os.environ.get("SNAPSHOT_MAX_MB", "300"))
    with get_engine_admin().connect() as conn:
        if not conn.execute(text("SELECT pg_try_advisory_lock(:i)"), {"i": LOCK_ID}).scalar():
            return None  # outra instância já está fazendo
        try:
            existe = conn.execute(
                text("SELECT 1 FROM information_schema.schemata WHERE schema_name = :n"), {"n": nome}
            ).scalar()
            if existe:
                return None
            usado_mb = conn.execute(text("""
                SELECT COALESCE(pg_database_size(current_database()), 0) / 1048576
            """)).scalar_one()
            if usado_mb > limite_mb:
                _registrar(f"snapshot do dia pulado: banco já usa {usado_mb:.0f} MB (limite {limite_mb} MB)")
                conn.rollback()
                return None
            criar_snapshot(conn, f"snapshot diário {agora:%Y-%m-%d}", prefixo="dia", sufixo=f"{agora:%Y%m%d}")
            conn.commit()
            podar_snapshots(conn, prefixo="dia", manter=DIAS_MANTIDOS)
            conn.commit()
            log.info("snapshot diário criado: %s", nome)
            return nome
        finally:
            conn.rollback()
            conn.execute(text("SELECT pg_advisory_unlock(:i)"), {"i": LOCK_ID})
            conn.commit()


def _loop() -> None:
    time.sleep(120)  # deixa a API subir e atender antes do primeiro ciclo
    while True:
        try:
            agora = datetime.now(BRASILIA)
            if agora.hour >= 3:
                snapshot_do_dia(agora)
        except Exception:
            log.exception("falha no snapshot diário")
            _registrar("falha ao criar snapshot diário (ver logs do servidor)")
        time.sleep(30 * 60)


def iniciar() -> None:
    if os.environ.get("ROTINAS_DESLIGADAS") == "1":
        return
    threading.Thread(target=_loop, name="snapshot-diario", daemon=True).start()
