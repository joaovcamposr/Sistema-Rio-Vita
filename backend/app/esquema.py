"""
Descrição normalizada do esquema do banco (tabelas/colunas, constraints,
índices, views, triggers, funções, enums). Serve para detectar divergência
entre o banco de produção e o que as migrações criam num banco novo —
exatamente o tipo de erro que deixou `chegada_racao.excluido_em` faltando em
produção. Só leitura.

    python -m app.esquema            imprime o resumo (chave -> md5) do banco atual
    python scripts/comparar_esquema.py producao.json   compara com o banco atual
"""
from __future__ import annotations

import hashlib
import json
import sys

from sqlalchemy import text
from sqlalchemy.engine import Connection

# estruturas do próprio mecanismo de proteção: não fazem parte do "esquema de negócio"
_IGNORAR_TABELAS = {"schema_migration", "venda_legado_pgto"}


def descrever(conn: Connection) -> dict[str, str]:
    d: dict[str, str] = {}

    cols = conn.execute(text("""
        SELECT c.table_name, c.column_name, c.udt_name, c.is_nullable, c.is_generated,
               COALESCE(c.generation_expression, ''), COALESCE(c.column_default, '')
        FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
        ORDER BY c.table_name, c.column_name
    """)).all()
    por_tabela: dict[str, list[str]] = {}
    for tabela, coluna, tipo, nulo, gerada, expr, padrao in cols:
        if tabela in _IGNORAR_TABELAS:
            continue
        por_tabela.setdefault(tabela, []).append(f"{coluna}|{tipo}|{nulo}|{gerada}|{expr}|{padrao}")
    for tabela, linhas in por_tabela.items():
        d[f"tabela:{tabela}"] = "\n".join(linhas)

    for tabela, nome, definicao in conn.execute(text("""
        SELECT cl.relname, co.conname, pg_get_constraintdef(co.oid)
        FROM pg_constraint co JOIN pg_class cl ON cl.oid = co.conrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace WHERE n.nspname = 'public'
    """)).all():
        if tabela not in _IGNORAR_TABELAS:
            d[f"constraint:{tabela}.{nome}"] = definicao

    for tabela, nome, definicao in conn.execute(text(
        "SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'"
    )).all():
        if tabela not in _IGNORAR_TABELAS:
            d[f"indice:{tabela}.{nome}"] = definicao

    for nome, definicao in conn.execute(text(
        "SELECT viewname, definition FROM pg_views WHERE schemaname = 'public'"
    )).all():
        d[f"view:{nome}"] = " ".join(definicao.split())

    for tabela, nome, definicao in conn.execute(text("""
        SELECT cl.relname, t.tgname, pg_get_triggerdef(t.oid)
        FROM pg_trigger t JOIN pg_class cl ON cl.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE n.nspname = 'public' AND NOT t.tgisinternal
    """)).all():
        if tabela not in _IGNORAR_TABELAS:
            d[f"trigger:{tabela}.{nome}"] = definicao

    for nome, corpo in conn.execute(text("""
        SELECT p.proname, p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
    """)).all():
        d[f"funcao:{nome}"] = " ".join(corpo.split())

    for nome, rotulos in conn.execute(text("""
        SELECT t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
        FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
        JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' GROUP BY t.typname
    """)).all():
        d[f"enum:{nome}"] = rotulos
    return d


def resumo(d: dict[str, str]) -> dict[str, str]:
    return {k: hashlib.md5(v.encode("utf-8")).hexdigest()[:12] for k, v in sorted(d.items())}


def main() -> int:
    from .db import get_engine_admin
    with get_engine_admin().connect() as conn:
        json.dump(descrever(conn), sys.stdout, ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
