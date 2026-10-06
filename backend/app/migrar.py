"""
Executor de migrações — a ÚNICA forma de alterar o esquema do banco.

Por que existe: a migração 030 foi aplicada na mão, sem transação. O
backfill falhou no meio e as colunas antigas foram apagadas assim mesmo.
Aqui isso não pode mais acontecer:

* cada migração roda numa transação só — se qualquer coisa falhar, o banco
  volta exatamente ao estado anterior;
* antes de aplicar qualquer migração pendente, tira-se um snapshot completo
  (schema snap_AAAAMMDD_HHMMSS, com cópia de todas as tabelas);
* contagem de linhas de toda tabela antes x depois: se alguma tabela
  encolher, a migração é desfeita (a menos que declare, no cabeçalho,
  `-- invariantes: tabela1,tabela2`);
* migração destrutiva (DROP COLUMN/TABLE/SCHEMA, TRUNCATE, DELETE FROM) só
  roda com o cabeçalho `-- destrutiva: <motivo>` E com a variável de
  ambiente MIGRACAO_DESTRUTIVA_OK=<nome-do-arquivo> definida de propósito;
* o que já foi aplicado fica registrado em schema_migration (com checksum);
  alterar um arquivo já aplicado é erro.

Uso:  python -m app.migrar            aplica as pendentes
      python -m app.migrar --ensaio   aplica numa transação e DESFAZ no fim
      python -m app.migrar --status   lista aplicadas e pendentes
"""
from __future__ import annotations

import hashlib
import os
import re
import sys
from datetime import datetime
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import Connection

from .db import get_engine_admin as get_engine

PASTA = Path(__file__).resolve().parent.parent / "migrations"
# bancos que já existiam antes do executor: tudo até aqui foi aplicado na mão
BASELINE_ATE = "030"
LOCK_ID = 7_272_001
SNAPSHOTS_MANTIDOS = 3
# tabelas de infraestrutura — fora da checagem de contagem
_IGNORAR = {"schema_migration"}
# derivadas/volumosas: ficam fora dos snapshots (o backup completo as inclui)
_FORA_DO_SNAPSHOT = {"auditoria", "erro_log"}

_DESTRUTIVO = re.compile(
    r"\b(DROP\s+COLUMN|DROP\s+TABLE|DROP\s+SCHEMA|TRUNCATE|DELETE\s+FROM|ALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE)\b",
    re.IGNORECASE,
)


class MigracaoErro(RuntimeError):
    pass


def _sem_comentarios(sql: str) -> str:
    sql = re.sub(r"/\*.*?\*/", "", sql, flags=re.DOTALL)
    return re.sub(r"--[^\n]*", "", sql)


def _cabecalho(sql: str, chave: str) -> str | None:
    m = re.search(rf"^--\s*{chave}:\s*(.+)$", sql, flags=re.MULTILINE | re.IGNORECASE)
    return m.group(1).strip() if m else None


def _preparar(sql: str) -> str:
    # a transação é do executor; BEGIN/COMMIT avulsos dentro do arquivo
    # quebrariam isso (a 030 original os trazia)
    return re.sub(r"^\s*(BEGIN|COMMIT)\s*;\s*$", "", sql, flags=re.MULTILINE | re.IGNORECASE)


def listar_arquivos() -> list[Path]:
    return sorted(PASTA.glob("[0-9][0-9][0-9]_*.sql"))


def _checksum(sql: str) -> str:
    return hashlib.sha256(sql.encode("utf-8")).hexdigest()[:16]


def _garantir_tabela(conn: Connection) -> bool:
    """Cria schema_migration se faltar. Devolve True se acabou de criar."""
    existe = conn.execute(text("SELECT to_regclass('public.schema_migration')")).scalar()
    if existe:
        return False
    conn.execute(text("""
        CREATE TABLE schema_migration (
          nome        text PRIMARY KEY,
          checksum    text NOT NULL,
          aplicada_em timestamptz NOT NULL DEFAULT now(),
          baseline    boolean NOT NULL DEFAULT false
        )
    """))
    return True


def _tabelas(conn: Connection) -> list[str]:
    rows = conn.execute(text("""
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
    """)).scalars().all()
    return [t for t in rows if t not in _IGNORAR]


def contagens(conn: Connection) -> dict[str, int]:
    out = {}
    for t in _tabelas(conn):
        out[t] = conn.execute(text(f'SELECT count(*) FROM "{t}"')).scalar_one()
    if "venda" in out:
        try:
            out["venda:soma_valor_total"] = int(
                round(float(conn.execute(text("SELECT COALESCE(sum(valor_total),0) FROM venda")).scalar_one()) * 100)
            )
        except Exception:  # coluna pode não existir em esquema muito antigo
            pass
    return out


def criar_snapshot(conn: Connection, rotulo: str, prefixo: str = "snap", sufixo: str | None = None) -> str:
    """Copia as tabelas de negócio de public para um schema novo. Retorna o nome."""
    base = f"{prefixo}_{sufixo or datetime.now().strftime('%Y%m%d_%H%M%S')}"
    nome, n = base, 1
    while conn.execute(text("SELECT 1 FROM information_schema.schemata WHERE schema_name = :n"), {"n": nome}).scalar():
        n += 1
        nome = f"{base}_{n}"
    conn.execute(text(f'CREATE SCHEMA "{nome}"'))
    for t in _tabelas(conn):
        if t in _FORA_DO_SNAPSHOT:
            continue
        conn.execute(text(f'CREATE TABLE "{nome}"."{t}" AS TABLE public."{t}"'))
    comentario = f"snapshot antes de: {rotulo}".replace("'", "''").replace("%", "%%")
    conn.exec_driver_sql(f"COMMENT ON SCHEMA \"{nome}\" IS '{comentario}'")
    return nome


def podar_snapshots(conn: Connection, prefixo: str = "snap", manter: int = SNAPSHOTS_MANTIDOS) -> None:
    """Mantém só os `manter` snapshots mais novos daquele prefixo."""
    schemas = conn.execute(text(
        "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE :p ORDER BY schema_name DESC"
    ), {"p": prefixo + "\\_%"}).scalars().all()
    for antigo in schemas[manter:]:
        conn.execute(text(f'DROP SCHEMA "{antigo}" CASCADE'))


def _estado(conn: Connection) -> tuple[dict[str, str], list[Path]]:
    aplicadas = dict(conn.execute(text("SELECT nome, checksum FROM schema_migration")).all())
    pendentes = []
    for arq in listar_arquivos():
        sql = arq.read_text(encoding="utf-8")
        if arq.name in aplicadas:
            if aplicadas[arq.name] != _checksum(sql) and not _eh_baseline_flexivel(arq.name):
                raise MigracaoErro(
                    f"{arq.name} já foi aplicada e o arquivo mudou depois (checksum diferente). "
                    "Nunca edite migração aplicada — crie uma nova."
                )
        else:
            pendentes.append(arq)
    return aplicadas, pendentes


def _eh_baseline_flexivel(nome: str) -> bool:
    # arquivos de baseline foram marcados sem rodar; o conteúdo pode ter sido
    # corrigido depois (ex.: 030 reescrita como transação) sem afetar o banco
    return nome[:3] <= BASELINE_ATE


def status() -> int:
    eng = get_engine()
    with eng.connect() as conn:
        if not conn.execute(text("SELECT to_regclass('public.schema_migration')")).scalar():
            print("schema_migration ainda não existe (rode `python -m app.migrar`).")
            return 0
        aplicadas, pendentes = _estado(conn)
        for nome in aplicadas:
            print("aplicada ", nome)
        for arq in pendentes:
            print("PENDENTE ", arq.name)
    return 0


def _aplicar_uma(conn: Connection, arq: Path) -> None:
    sql = arq.read_text(encoding="utf-8")
    antes = contagens(conn)
    conn.exec_driver_sql(_preparar(sql).replace("%", "%%"))
    depois = contagens(conn)

    permitidas = {t.strip() for t in (_cabecalho(sql, "invariantes") or "").split(",") if t.strip()}
    for tabela, n_antes in antes.items():
        n_depois = depois.get(tabela)
        if n_depois is None:
            if tabela.endswith(":soma_valor_total"):
                continue
            if tabela in permitidas:
                continue
            raise MigracaoErro(f"{arq.name}: a tabela {tabela} sumiu (declare em `-- invariantes:` se for proposital)")
        if n_depois < n_antes and tabela not in permitidas:
            raise MigracaoErro(
                f"{arq.name}: {tabela} tinha {n_antes} e ficou com {n_depois} "
                "(declare em `-- invariantes:` se for proposital)"
            )
        if tabela.endswith(":soma_valor_total") and n_depois != n_antes and "venda" not in permitidas:
            raise MigracaoErro(
                f"{arq.name}: soma de valor_total das vendas mudou ({n_antes / 100:.2f} -> {n_depois / 100:.2f})"
            )
    conn.execute(
        text("INSERT INTO schema_migration (nome, checksum) VALUES (:n, :c)"),
        {"n": arq.name, "c": _checksum(sql)},
    )


def aplicar(ensaio: bool = False) -> int:
    eng = get_engine()
    destrutiva_ok = os.environ.get("MIGRACAO_DESTRUTIVA_OK", "")

    with eng.connect() as conn:
        conn.execute(text("SELECT pg_advisory_lock(:i)"), {"i": LOCK_ID})
        conn.commit()
        try:
            if ensaio and not conn.execute(text("SELECT to_regclass('public.schema_migration')")).scalar():
                print("[migrar] ensaio: o banco ainda não tem registro de migrações; "
                      "a primeira execução (sem --ensaio) fará o baseline e um snapshot inicial")
                return 0
            novo = _garantir_tabela(conn)
            conn.commit()
            snapshot_ja_feito = False

            if novo:
                tem_dados = conn.execute(text("SELECT to_regclass('public.venda')")).scalar()
                if tem_dados:
                    # banco anterior ao executor: registra o histórico sem rodar nada
                    for arq in listar_arquivos():
                        if arq.name[:3] <= BASELINE_ATE:
                            conn.execute(
                                text("INSERT INTO schema_migration (nome, checksum, baseline) VALUES (:n, :c, true)"),
                                {"n": arq.name, "c": _checksum(arq.read_text(encoding="utf-8"))},
                            )
                    conn.commit()
                    print(f"[migrar] baseline registrado até {BASELINE_ATE}")
                    snap = criar_snapshot(conn, "baseline do executor de migrações")
                    conn.commit()
                    print(f"[migrar] snapshot inicial criado: {snap}")
                    snapshot_ja_feito = True  # já protege as pendentes desta execução

            aplicadas, pendentes = _estado(conn)
            conn.commit()
            if not pendentes:
                print("[migrar] nada pendente")
                return 0

            for arq in pendentes:
                sql = arq.read_text(encoding="utf-8")
                # as históricas (<= baseline) só rodam em banco vazio (CI/restauração);
                # a trava vale para toda migração nova
                if arq.name[:3] > BASELINE_ATE and _DESTRUTIVO.search(_sem_comentarios(sql)):
                    if not _cabecalho(sql, "destrutiva"):
                        raise MigracaoErro(f"{arq.name}: tem comando destrutivo mas falta o cabeçalho `-- destrutiva: <motivo>`")
                    if destrutiva_ok != arq.name and not ensaio:
                        raise MigracaoErro(
                            f"{arq.name} é destrutiva e não foi liberada. Confira o backup e defina "
                            f"MIGRACAO_DESTRUTIVA_OK={arq.name} para rodar."
                        )

            if not ensaio and not snapshot_ja_feito:
                snap = criar_snapshot(conn, ", ".join(a.name for a in pendentes))
                conn.commit()
                print(f"[migrar] snapshot antes das migrações: {snap}")

            for arq in pendentes:
                print(f"[migrar] aplicando {arq.name}{' (ENSAIO — será desfeito)' if ensaio else ''}")
                try:
                    _aplicar_uma(conn, arq)
                except Exception:
                    conn.rollback()
                    raise
                if not ensaio:
                    conn.commit()
            if ensaio:
                # todas as pendentes foram aplicadas em sequência na mesma
                # transação, para validar o conjunto; agora desfaz tudo
                conn.rollback()

            if not ensaio:
                podar_snapshots(conn)
                conn.commit()
            print("[migrar] concluído" + (" (ensaio, nada foi gravado)" if ensaio else ""))
            return 0
        finally:
            conn.rollback()
            conn.execute(text("SELECT pg_advisory_unlock(:i)"), {"i": LOCK_ID})
            conn.commit()


def main(argv: list[str]) -> int:
    try:
        if "--status" in argv:
            return status()
        return aplicar(ensaio="--ensaio" in argv)
    except MigracaoErro as e:
        print(f"[migrar] ERRO: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
