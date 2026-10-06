"""
Ensaio de restauração: prova que um backup gerado restaura num banco novo
com EXATAMENTE o mesmo conteúdo (linha a linha) e com as sequências corretas.

    URL_ORIGEM=... URL_DESTINO=... python scripts/ensaio_restauracao.py

Os dois bancos devem ser descartáveis. Roda a cada commit no CI e serve de
roteiro para o ensaio manual antes de qualquer mudança arriscada.
"""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from sqlalchemy import create_engine, text

RAIZ = Path(__file__).resolve().parent.parent
ORIGEM, DESTINO = os.environ["URL_ORIGEM"], os.environ["URL_DESTINO"]
if "railway" in ORIGEM + DESTINO or "rlwy" in ORIGEM + DESTINO:
    sys.exit("recusado: URL parece ser da Railway")


def py(modulo: str, *args: str, url: str) -> None:
    env = {**os.environ, "DATABASE_URL": url, "ROTINAS_DESLIGADAS": "1", "PYTHONPATH": str(RAIZ)}
    subprocess.run([sys.executable, "-m", modulo, *args], cwd=RAIZ, env=env, check=True)


def semear(url: str) -> None:
    eng = create_engine(url)
    with eng.begin() as c:
        c.execute(text("""INSERT INTO produto (nome, unidade_embalagem, fator_kg, kg_digitado)
                          VALUES ('Filé 500g','pacote',0.5,false) ON CONFLICT (nome) DO NOTHING"""))
        c.execute(text("INSERT INTO cliente (nome, prazo_dias) SELECT 'Cliente '||g, 7*g FROM generate_series(1,40) g"))
        c.execute(text("INSERT INTO vendedor (nome) VALUES ('Batista'), ('João')"))
        c.execute(text("""
            INSERT INTO venda (data, cliente_id, produto_id, quantidade_kg, preco_kg, vendedor, observacoes)
            SELECT date '2026-01-01' + g, (SELECT id FROM cliente ORDER BY id OFFSET (g % 40) LIMIT 1),
                   (SELECT id FROM produto LIMIT 1), 1 + (g % 9), 20 + (g % 7) + 0.55,
                   'Batista', CASE WHEN g % 5 = 0 THEN E'obs com\ttab e\nquebra e \\\\ barra' END
            FROM generate_series(1, 400) g
        """))
        c.execute(text("""
            INSERT INTO venda_parcela (venda_id, numero, valor, forma_pgto, data_prevista, data_pagamento)
            SELECT id, 1, valor_total, CASE WHEN id % 3 = 0 THEN 'Pix' ELSE 'Dinheiro' END, data,
                   CASE WHEN id % 2 = 0 THEN data END FROM venda WHERE valor_total > 0
        """))
        c.execute(text("UPDATE venda SET vendedor = 'João' WHERE id % 7 = 0"))  # gera auditoria
        c.execute(text("""INSERT INTO despesa (data, categoria, valor, forma_pgto)
                          SELECT date '2026-02-01' + g, 'Combustível', 10 * g, 'Dinheiro' FROM generate_series(1,30) g"""))


def impressao_digital(url: str) -> dict[str, tuple[int, str]]:
    eng = create_engine(url)
    out = {}
    with eng.connect() as c:
        tabelas = c.execute(text("""SELECT table_name FROM information_schema.tables
                                    WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1""")).scalars().all()
        for t in tabelas:
            if t == "schema_migration":
                continue
            n, h = c.execute(text(
                f'SELECT count(*), COALESCE(md5(string_agg(x::text, \'|\' ORDER BY x::text)), \'\') FROM "{t}" x'
            )).one()
            out[t] = (n, h)
    return out


def main() -> int:
    py("app.migrar", url=ORIGEM)
    semear(ORIGEM)
    arq = Path(tempfile.mkdtemp()) / "ensaio.rvbak.gz"
    py("app.backup", "gerar", str(arq), url=ORIGEM)
    py("app.migrar", url=DESTINO)
    py("app.backup", "restaurar", str(arq), url=DESTINO)

    a, b = impressao_digital(ORIGEM), impressao_digital(DESTINO)
    diferentes = [t for t in a if a[t] != b.get(t)]
    total = sum(n for n, _ in a.values())
    if diferentes:
        print("DIVERGÊNCIA nas tabelas:", diferentes)
        return 1

    eng = create_engine(DESTINO)
    with eng.connect() as c:  # sequência segue do maior id (não colide com o que foi restaurado)
        seq = c.execute(text("SELECT nextval(pg_get_serial_sequence('venda','id'))")).scalar()
        maxid = c.execute(text("SELECT max(id) FROM venda")).scalar()
    if seq <= maxid:
        print("sequência de venda.id não foi reposicionada:", seq, "<=", maxid)
        return 1
    print(f"OK: {total} linhas em {len(a)} tabelas idênticas após backup -> restauração")
    return 0


if __name__ == "__main__":
    sys.exit(main())
