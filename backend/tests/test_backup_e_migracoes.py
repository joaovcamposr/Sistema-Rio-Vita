import re
from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import text

from app import backup, migrar, rotinas
from app.db import get_engine_admin
from app.main import app


def test_backup_baixavel_e_consistente(api, tmp_path):
    r = api.get("/admin/backup")
    assert r.status_code == 200
    arq = tmp_path / "b.rvbak.gz"
    arq.write_bytes(r.content)
    cab = backup.verificar(arq)
    assert "venda" in cab["contagens"] and "venda_parcela" in cab["contagens"] and len(cab["migracoes"]) >= 32


def test_backup_exige_login():
    assert TestClient(app).get("/admin/backup").status_code == 401


def test_migracao_destrutiva_e_detectada():
    assert migrar._DESTRUTIVO.search("ALTER TABLE venda DROP COLUMN x;")
    assert migrar._DESTRUTIVO.search("DELETE FROM venda;")
    assert migrar._DESTRUTIVO.search("TRUNCATE venda;")
    assert not migrar._DESTRUTIVO.search("ALTER TABLE venda ADD COLUMN x int;")
    assert not migrar._DESTRUTIVO.search(migrar._sem_comentarios("-- DROP COLUMN só em comentário\nSELECT 1;"))


def test_todas_migracoes_aplicadas(banco):
    with get_engine_admin().connect() as c:
        aplicadas = set(c.execute(text("SELECT nome FROM schema_migration")).scalars().all())
    assert {a.name for a in migrar.listar_arquivos()} == aplicadas


def test_numeracao_das_migracoes_sem_buraco():
    arquivos = migrar.listar_arquivos()
    assert [int(a.name[:3]) for a in arquivos] == list(range(1, len(arquivos) + 1))
    assert all(re.match(r"\d{3}_[a-z0-9_]+\.sql", a.name) for a in arquivos)


def test_snapshot_diario_cria_e_poda(banco):
    base = datetime(2026, 1, 1, 4, 0, tzinfo=rotinas.BRASILIA)
    for i in range(rotinas.DIAS_MANTIDOS + 2):
        rotinas.snapshot_do_dia(base + timedelta(days=i))
    with get_engine_admin().connect() as c:
        n = c.execute(text("SELECT count(*) FROM information_schema.schemata WHERE schema_name LIKE 'dia\\_%'")).scalar()
    assert n == rotinas.DIAS_MANTIDOS
    assert rotinas.snapshot_do_dia(base + timedelta(days=8)) is None  # já existe


def test_esquema_descrito_pelo_admin(api):
    r = api.get("/admin/esquema")
    assert r.status_code == 200
    d = r.json()
    assert "tabela:venda_parcela" in d and "view:vw_venda_pagamento" in d and "trigger:venda.aud_venda" in d
    completo = api.get("/admin/esquema", params={"chaves": "tabela:chegada_racao"}).json()
    assert "excluido_em" in completo["tabela:chegada_racao"]


def test_mortalidade_ignora_lotes_marcados_e_aceita_negativa(api):
    with get_engine_admin().begin() as c:
        vid = c.execute(text("""
            INSERT INTO viveiro (codigo, tipo, area_m2) VALUES ('9901', 'engorda', 1000)
            ON CONFLICT (codigo) DO UPDATE SET ativo = true RETURNING id
        """)).scalar()
        for codigo, ini, ini_dia, fim_dia, fora in [
            ("ENG-T-LEGADO", 1000, 1, 100, True),     # legado: não entra
            ("ENG-T-REAL", 1000, 1, 100, False),      # 1000 perdidos de 1000 sobrando = 100%
            ("ENG-T-NEG", 1000, 2, 100, False),       # vai ficar negativo (saiu mais que o inicial)
        ]:
            c.execute(text("""
                INSERT INTO lote (codigo, fase, viveiro_id, viveiro_tipo, data_inicio, quantidade_inicial,
                                  peso_medio_inicial_g, data_fim, fora_da_mortalidade)
                VALUES (:c, 'engorda', :v, 'engorda', '2026-01-01', :i, 10, '2026-04-10', :f)
            """), {"c": codigo, "v": vid, "i": ini, "f": fora})
        neg = c.execute(text("SELECT id FROM lote WHERE codigo = 'ENG-T-NEG'")).scalar()
        c.execute(text("""
            INSERT INTO despesca (lote_id, data, destino, quantidade_un, peso_medio_g)
            VALUES (:l, '2026-04-01', 'inteira_suja', 1200, 500)
        """), {"l": neg})
    d = api.get("/paineis/mortalidade").json()
    por_codigo = {l["lote_codigo"]: l for l in d["lotes"]}
    assert por_codigo["ENG-T-LEGADO"]["fora_da_media"] is True
    assert por_codigo["ENG-T-NEG"]["taxa"] < 0 and por_codigo["ENG-T-NEG"]["fora_da_media"] is False
    entram = [l for l in d["lotes"] if l["fase"] == "engorda" and not l["fora_da_media"]]
    esperado = sum(l["quantidade_perdida"] for l in entram) / sum(l["quantidade_inicial"] for l in entram)
    assert abs(d["taxa_media_engorda"] - esperado) < 1e-9
