"""
Compara o esquema de um banco (o apontado por DATABASE_URL — normalmente um
banco NOVO criado só pelas migrações) com o resumo do esquema de produção.

    # 1) no navegador logado como gerente: GET /admin/esquema  -> salve como producao.json
    # 2) python scripts/comparar_esquema.py producao.json [producao_completo.json]

Lista o que existe só em um dos lados e o que é diferente. Se informar o JSON
completo (chaves -> texto, via ?chaves=), mostra os dois textos lado a lado.
"""
import json
import sys
from pathlib import Path

from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app import esquema  # noqa: E402
from app.db import get_engine_admin  # noqa: E402


def main() -> int:
    prod_resumo = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    prod_completo = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8")) if len(sys.argv) > 2 else {}
    with get_engine_admin().connect() as conn:
        conn.execute(text("SELECT 1"))
        local = esquema.descrever(conn)
    local_resumo = esquema.resumo(local)

    so_prod = sorted(set(prod_resumo) - set(local_resumo))
    so_local = sorted(set(local_resumo) - set(prod_resumo))
    difere = sorted(k for k in set(prod_resumo) & set(local_resumo) if prod_resumo[k] != local_resumo[k])
    print(f"produção: {len(prod_resumo)} objetos | migrações: {len(local_resumo)} objetos")
    print(f"\n== FALTAM EM PRODUÇÃO (as migrações criam, produção não tem): {len(so_local)}")
    for k in so_local:
        print("  ", k)
    print(f"\n== EXISTEM SÓ EM PRODUÇÃO (fora das migrações): {len(so_prod)}")
    for k in so_prod:
        print("  ", k)
    print(f"\n== DIFERENTES: {len(difere)}")
    for k in difere:
        print("  ", k)
        if k in prod_completo:
            print("      produção:", (prod_completo[k] or "")[:300].replace("\n", " ; "))
            print("      migração:", local[k][:300].replace("\n", " ; "))
    return 0 if not (so_prod or so_local or difere) else 1


if __name__ == "__main__":
    sys.exit(main())
