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
        c.execute(text("""
            DELETE FROM despesca WHERE lote_id IN (SELECT id FROM lote WHERE codigo LIKE 'ENG-T-%')
        """))
        c.execute(text("DELETE FROM lote WHERE codigo LIKE 'ENG-T-%'"))  # roda de novo sem sujeira
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


def test_repicagem_em_lote_existente_mantem_peso_inicial_ponderado(api):
    import uuid
    with get_engine_admin().begin() as c:
        ids = {}
        for cod, tipo in [("9911", "pre_engorda"), ("9912", "pre_engorda"), ("9913", "engorda")]:
            ids[cod] = c.execute(text("""
                INSERT INTO viveiro (codigo, tipo, area_m2) VALUES (:c, CAST(:t AS tipo_viveiro), 1000)
                ON CONFLICT (codigo) DO UPDATE SET ativo = true RETURNING id
            """), {"c": cod, "t": tipo}).scalar()
        c.execute(text("""
            UPDATE lote SET data_fim = '2099-01-01'
            WHERE viveiro_id = ANY(:v) AND data_fim IS NULL
        """), {"v": list(ids.values())})
    def povoar(vid, qtd, peso):
        r = api.post("/lotes", json={"client_id": str(uuid.uuid4()), "viveiro_id": vid, "data": "2026-03-01",
                                     "quantidade_inicial": qtd, "peso_medio_inicial_g": peso})
        assert r.status_code == 201, r.text
    povoar(ids["9911"], 1000, 100)
    povoar(ids["9912"], 1000, 100)

    def repicar(origem, qtd, peso):
        r = api.post("/repicagens", json={"client_id": str(uuid.uuid4()), "data": "2026-03-10",
                                          "viveiro_destino_id": ids["9913"], "peso_medio_g": peso,
                                          "origens": [{"viveiro_origem_id": ids[origem], "quantidade": qtd}]})
        assert r.status_code == 201, r.text
        return r.json()["lote"]
    repicar("9911", 400, 100)                    # cria o lote de destino: 400 @ 100 g
    lote = repicar("9912", 600, 200)             # junta: 1000 @ média ponderada (400×100 + 600×200) / 1000 = 160 g
    assert lote["quantidade_inicial"] == 1000
    assert abs(lote["peso_medio_inicial_g"] - 160.0) < 0.01


def test_peso_estimado_interpola_e_mantem_a_semana():
    from app.routers import paineis
    curva = [{"semana": i + 1, "peso_final_g": p} for i, p in enumerate(
        [1.5, 3, 5, 7, 12, 20, 30, 50, 75, 100])]
    assert abs(paineis._peso_estimado(curva, 33.0, 0) - 33.0) < 1e-6          # sem tempo, é o peso medido
    assert paineis._peso_estimado(curva, 30.0, 0) == 30.0 and paineis._peso_estimado(curva, 50.0, 0) == 50.0
    for peso in (4.0, 33.0, 60.0):
        for sem in (0, 2, 3):
            est = paineis._peso_estimado(curva, peso, sem)
            esperada = min(paineis._semana_para_peso(curva, peso) + paineis._avanco_semanas(sem), 10)
            assert paineis._semana_para_peso(curva, est) == esperada           # a semana inteira não muda
    assert abs(paineis._peso_estimado(curva, 33.0, 2) - 53.75) < 0.01          # antes dava 75 g (arredondava pra cima)


def test_mortalidade_gradual_concentrada_no_inicio():
    from app.routers.paineis import _fracao_mortalidade_acumulada as f
    assert f(0, 120, 2.0) == 0.0 and f(120, 120, 2.0) == 1.0 and f(300, 120, 2.0) == 1.0
    assert abs(f(30, 120, 2.0) - 0.4375) < 1e-9 and abs(f(60, 120, 2.0) - 0.75) < 1e-9
    assert f(30, 120, 2.0) > 30 / 120                      # mais forte no início do que a linear
    assert abs(f(30, 120, 1.0) - 0.25) < 1e-9             # expoente 1 = linear
    assert f(10, 0, 2.0) == 1.0                           # sem duração conhecida: ciclo todo


def test_mortalidade_expoe_duracao_media(api):
    d = api.get("/paineis/mortalidade").json()
    assert "duracao_media_engorda_dias" in d and "duracao_media_pre_engorda_dias" in d
