"""
Backup lógico completo do banco, em Python puro (sem pg_dump), e restauração.

Formato do arquivo (.rvbak.gz, gzip):
    linha 1:  JSON {"formato": 1, "gerado_em": ..., "migracoes": [...], "contagens": {tabela: n}}
    depois, para cada tabela:
        linha JSON {"t": nome, "cols": [...], "n": bytes, "linhas": N}
        <n bytes do COPY ... TO STDOUT em formato texto>
        "\n"
Só dados: o esquema vem das migrações (`python -m app.migrar` num banco vazio).
Colunas geradas (ex.: venda.valor_total) ficam de fora e são recalculadas.
O dump roda numa transação REPEATABLE READ somente-leitura, então é
consistente mesmo com o sistema em uso.

Uso:  python -m app.backup gerar  [arquivo]
      python -m app.backup restaurar arquivo     (banco de destino VAZIO,
                                                  apontado por DATABASE_URL)
      python -m app.backup verificar arquivo
"""
from __future__ import annotations

import gzip
import json
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import BinaryIO

from sqlalchemy import text
from sqlalchemy.engine import Connection

from .db import get_engine, get_engine_admin

_IGNORAR_NO_DUMP = {"schema_migration"}
# se qualquer uma destas já tiver linhas, o destino NÃO é um banco novo e a
# restauração se recusa (as migrações semeiam tabelas de referência, então
# "vazio" não pode significar "todas as tabelas sem linhas")
_OPERACIONAIS = ("venda", "venda_parcela", "despesca", "producao", "despesa", "lote", "biometria",
                 "arracoamento", "usuario", "cliente", "expedicao")


def _tabelas(conn: Connection) -> list[str]:
    return list(conn.execute(text("""
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
    """)).scalars().all())


def _colunas(conn: Connection, tabela: str) -> list[str]:
    return list(conn.execute(text("""
        SELECT attname FROM pg_attribute
        WHERE attrelid = to_regclass(:t) AND attnum > 0 AND NOT attisdropped AND attgenerated = ''
        ORDER BY attnum
    """), {"t": f'public."{tabela}"'}).scalars().all())


def gerar(destino: BinaryIO) -> dict:
    """Escreve o backup (gzip) em `destino`. Devolve o cabeçalho."""
    engine = get_engine()
    with engine.connect().execution_options(isolation_level="REPEATABLE READ") as conn:
        conn.exec_driver_sql("SET TRANSACTION READ ONLY")
        tabelas = _tabelas(conn)
        migracoes = list(conn.execute(text(
            "SELECT nome FROM schema_migration ORDER BY nome"
        )).scalars().all()) if "schema_migration" in tabelas else []

        blocos: list[tuple[str, list[str], tempfile.SpooledTemporaryFile, int]] = []
        contagens: dict[str, int] = {}
        raw = conn.connection.driver_connection
        for t in tabelas:
            if t in _IGNORAR_NO_DUMP:
                continue
            cols = _colunas(conn, t)
            if not cols:
                continue
            lista = ", ".join(f'"{c}"' for c in cols)
            buf = tempfile.SpooledTemporaryFile(max_size=32 * 1024 * 1024)
            with raw.cursor() as cur:
                with cur.copy(f'COPY (SELECT {lista} FROM "{t}") TO STDOUT') as copy:
                    for pedaco in copy:
                        buf.write(bytes(pedaco))
            n = conn.execute(text(f'SELECT count(*) FROM "{t}"')).scalar_one()
            contagens[t] = n
            blocos.append((t, cols, buf, n))

        cabecalho = {
            "formato": 1,
            "gerado_em": datetime.now(timezone.utc).isoformat(),
            "migracoes": migracoes,
            "contagens": contagens,
        }
        with gzip.GzipFile(fileobj=destino, mode="wb", compresslevel=6) as gz:
            gz.write(json.dumps(cabecalho).encode("utf-8") + b"\n")
            for t, cols, buf, n in blocos:
                tamanho = buf.seek(0, 2)
                buf.seek(0)
                gz.write(json.dumps({"t": t, "cols": cols, "n": tamanho, "linhas": n}).encode("utf-8") + b"\n")
                while True:
                    pedaco = buf.read(1024 * 1024)
                    if not pedaco:
                        break
                    gz.write(pedaco)
                gz.write(b"\n")
                buf.close()
        return cabecalho


def _ler_blocos(fonte: BinaryIO):
    with gzip.GzipFile(fileobj=fonte, mode="rb") as gz:
        cabecalho = json.loads(gz.readline())
        yield cabecalho
        while True:
            linha = gz.readline()
            if not linha:
                return
            meta = json.loads(linha)
            dados = gz.read(meta["n"])
            if len(dados) != meta["n"]:
                raise ValueError(f"backup truncado na tabela {meta['t']}")
            gz.read(1)  # "\n" separador
            yield meta, dados


def verificar(caminho: Path) -> dict:
    """Lê o arquivo inteiro e confere que cada tabela tem o número de linhas do cabeçalho."""
    with open(caminho, "rb") as f:
        it = _ler_blocos(f)
        cab = next(it)
        for meta, dados in it:
            linhas = dados.count(b"\n")
            if linhas != meta["linhas"]:
                raise ValueError(f"{meta['t']}: cabeçalho diz {meta['linhas']} linhas, arquivo tem {linhas}")
            if cab["contagens"].get(meta["t"]) != meta["linhas"]:
                raise ValueError(f"{meta['t']}: contagem do cabeçalho inconsistente")
    return cab


def restaurar(caminho: Path) -> dict:
    """Carrega o backup num banco VAZIO (esquema já criado por app.migrar)."""
    engine = get_engine_admin()
    with open(caminho, "rb") as f:
        it = _ler_blocos(f)
        cab = next(it)
        with engine.connect() as conn:
            existentes = set(_tabelas(conn))
            conn.execute(text("SET LOCAL session_replication_role = replica"))
            sujas = [
                t for t in _OPERACIONAIS
                if t in existentes and conn.execute(text(f'SELECT EXISTS (SELECT 1 FROM "{t}")')).scalar()
            ]
            if sujas:
                raise RuntimeError(f"banco de destino já tem dados ({', '.join(sujas)}): restauração recusada")

            raw = conn.connection.driver_connection
            carregadas: dict[str, int] = {}
            blocos = list(it)
            faltando = [m["t"] for m, _ in blocos if m["t"] not in existentes]
            if faltando:
                raise RuntimeError(f"tabelas do backup que não existem no destino: {faltando} — rode app.migrar antes")
            conn.execute(text("TRUNCATE " + ", ".join(f'"{m["t"]}"' for m, _ in blocos)))
            for meta, dados in blocos:
                t = meta["t"]
                if t not in existentes:
                    raise RuntimeError(f"tabela {t} do backup não existe no destino — rode app.migrar antes")
                lista = ", ".join(f'"{c}"' for c in meta["cols"])
                with raw.cursor() as cur:
                    with cur.copy(f'COPY "{t}" ({lista}) FROM STDIN') as copy:
                        copy.write(dados)
                carregadas[t] = conn.execute(text(f'SELECT count(*) FROM "{t}"')).scalar_one()
                if carregadas[t] != meta["linhas"]:
                    raise RuntimeError(f"{t}: carregou {carregadas[t]} de {meta['linhas']} linhas")

            # sequências: devem continuar do maior id existente
            seqs = conn.execute(text("""
                SELECT c.table_name, c.column_name,
                       pg_get_serial_sequence('public."' || c.table_name || '"', c.column_name) AS seq
                FROM information_schema.columns c
                WHERE c.table_schema = 'public'
            """)).all()
            for tabela, coluna, seq in seqs:
                if seq and tabela in carregadas:
                    conn.execute(text(
                        f'SELECT setval(:s, COALESCE((SELECT max("{coluna}") FROM "{tabela}"), 1), '
                        f'(SELECT max("{coluna}") FROM "{tabela}") IS NOT NULL)'
                    ), {"s": seq})
            conn.commit()
    return {"cabecalho": cab, "carregadas": carregadas}


def main(argv: list[str]) -> int:
    if len(argv) < 1:
        print(__doc__)
        return 1
    cmd = argv[0]
    if cmd == "gerar":
        nome = Path(argv[1]) if len(argv) > 1 else Path(f"riovita_{datetime.now():%Y%m%d_%H%M%S}.rvbak.gz")
        with open(nome, "wb") as f:
            cab = gerar(f)
        verificar(nome)
        print(f"backup gerado e verificado: {nome} ({nome.stat().st_size / 1e6:.1f} MB, {sum(cab['contagens'].values())} linhas)")
        return 0
    if cmd == "verificar":
        cab = verificar(Path(argv[1]))
        print("ok:", sum(cab["contagens"].values()), "linhas em", len(cab["contagens"]), "tabelas, gerado em", cab["gerado_em"])
        return 0
    if cmd == "restaurar":
        r = restaurar(Path(argv[1]))
        print("restaurado:", sum(r["carregadas"].values()), "linhas")
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
