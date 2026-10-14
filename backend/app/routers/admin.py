"""Administração e segurança dos dados — só para papel 'gerente'."""
import tempfile
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import backup, esquema as _esquema
from ..auth import exigir_gerente
from ..db import get_db

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(exigir_gerente)])


@router.get("/backup")
def baixar_backup():
    """Backup lógico completo (todas as tabelas) em um arquivo .rvbak.gz.
    Guarde fora do servidor (seu computador, Drive). Restauração:
    `python -m app.backup restaurar arquivo.rvbak.gz` num banco novo."""
    arquivo = tempfile.TemporaryFile()
    backup.gerar(arquivo)
    tamanho = arquivo.tell()
    arquivo.seek(0)

    def pedacos():
        try:
            while True:
                pedaco = arquivo.read(1024 * 1024)
                if not pedaco:
                    break
                yield pedaco
        finally:
            arquivo.close()

    nome = f"riovita_backup_{datetime.now():%Y%m%d_%H%M}.rvbak.gz"
    return StreamingResponse(
        pedacos(), media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="{nome}"', "Content-Length": str(tamanho)},
    )


@router.get("/snapshots")
def listar_snapshots(db: Session = Depends(get_db)):
    """Cópias internas do banco (diárias e anteriores a migrações) disponíveis para recuperação."""
    rows = db.execute(text("""
        SELECT n.nspname AS schema, obj_description(n.oid, 'pg_namespace') AS descricao,
               COALESCE(sum(pg_total_relation_size(c.oid)), 0) AS bytes,
               count(c.oid) AS tabelas
        FROM pg_namespace n LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relkind = 'r'
        WHERE n.nspname LIKE 'snap\\_%' OR n.nspname LIKE 'dia\\_%'
        GROUP BY n.oid, n.nspname ORDER BY n.nspname DESC
    """)).mappings().all()
    return [dict(r) for r in rows]


@router.get("/erros")
def listar_erros(limite: int = Query(default=100, le=500), db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT id, quando, metodo, rota, usuario, tipo, mensagem
        FROM erro_log ORDER BY id DESC LIMIT :n
    """), {"n": limite}).mappings().all()
    return [dict(r) for r in rows]


@router.get("/auditoria")
def consultar_auditoria(
    tabela: str, registro_id: str | None = None, limite: int = Query(default=100, le=1000),
    db: Session = Depends(get_db),
):
    """Histórico de alterações (antes/depois) de uma tabela ou de um registro específico."""
    rows = db.execute(text("""
        SELECT id, quando, operacao, registro_id, usuario, antes, depois FROM auditoria
        WHERE tabela = :t AND (CAST(:r AS text) IS NULL OR registro_id = :r)
        ORDER BY id DESC LIMIT :n
    """), {"t": tabela, "r": registro_id, "n": limite}).mappings().all()
    return [dict(r) for r in rows]


@router.get("/esquema")
def descrever_esquema(chaves: str | None = None, db: Session = Depends(get_db)):
    """Resumo (chave -> md5) do esquema do banco; com ?chaves=a,b devolve o texto
    completo dessas chaves. Compare com um banco novo usando scripts/comparar_esquema.py."""
    d = _esquema.descrever(db.connection())
    if chaves:
        return {k: d.get(k) for k in chaves.split(",")}
    return _esquema.resumo(d)


# ---- datas de pagamento escritas nas observações das vendas ----

_ORIGEM_OBS = "observacao"


def _correcoes_por_observacao(db: Session, hoje) -> list[dict]:
    from ..obs_pagamento import data_de_pagamento

    rows = db.execute(text("""
        SELECT vp.id AS parcela_id, v.id AS venda_id, v.data AS data_venda, v.observacoes, vp.data_pagamento
        FROM venda v JOIN venda_parcela vp ON vp.venda_id = v.id
        WHERE v.excluido_em IS NULL AND vp.excluido_em IS NULL AND vp.data_pagamento IS NOT NULL
          AND btrim(COALESCE(v.observacoes, '')) <> ''
          AND (SELECT count(*) FROM venda_parcela x WHERE x.venda_id = v.id AND x.excluido_em IS NULL) = 1
        ORDER BY v.data, v.id
    """)).mappings().all()
    out = []
    for r in rows:
        nova = data_de_pagamento(r["observacoes"], r["data_venda"], hoje)
        if nova is not None and nova != r["data_pagamento"]:
            out.append({**r, "nova": nova})
    return out


@router.post("/datas-pagamento-por-observacao")
def corrigir_datas_pelas_observacoes(
    aplicar: bool = Query(default=False, description="false = só mostra o que mudaria (simulação)"),
    db: Session = Depends(get_db),
):
    """Vendas quitadas, de uma parcela só, cuja observação cita a data do
    pagamento: passa a valer a data escrita (a do último pagamento, se houver
    vários). Cada mudança fica em venda_parcela_data_pagamento_hist, então
    dá pra desfazer. Sem `aplicar=true` nada é alterado."""
    from datetime import date as _date

    hoje = _date.today()
    correcoes = _correcoes_por_observacao(db, hoje)
    resumo = {
        "aplicado": aplicar, "a_alterar": len(correcoes),
        "amostra": [
            {"venda_id": c["venda_id"], "data_venda": str(c["data_venda"]), "de": str(c["data_pagamento"]),
             "para": str(c["nova"]), "observacao": " ".join(c["observacoes"].split())[:140]}
            for c in correcoes[:25]
        ],
    }
    if not aplicar:
        return resumo

    alteradas = 0
    for c in correcoes:
        r = db.execute(
            text("UPDATE venda_parcela SET data_pagamento = :nova WHERE id = :id AND data_pagamento = :antiga"),
            {"nova": c["nova"], "id": c["parcela_id"], "antiga": c["data_pagamento"]},
        )
        if r.rowcount:
            db.execute(text("""
                INSERT INTO venda_parcela_data_pagamento_hist
                  (parcela_id, venda_id, data_antiga, data_nova, origem, observacao)
                VALUES (:p, :v, :antiga, :nova, :origem, :obs)
            """), {"p": c["parcela_id"], "v": c["venda_id"], "antiga": c["data_pagamento"], "nova": c["nova"],
                   "origem": _ORIGEM_OBS, "obs": c["observacoes"]})
            alteradas += 1
    db.commit()
    resumo["alteradas"] = alteradas
    return resumo


@router.post("/datas-pagamento-por-observacao/desfazer")
def desfazer_datas_pelas_observacoes(db: Session = Depends(get_db)):
    """Volta cada parcela corrigida pela observação à data de pagamento que
    tinha antes — só as que ainda estão com a data aplicada pela correção."""
    rows = db.execute(text("""
        SELECT id, parcela_id, data_antiga, data_nova FROM venda_parcela_data_pagamento_hist
        WHERE origem = :o AND desfeito_em IS NULL ORDER BY id DESC
    """), {"o": _ORIGEM_OBS}).mappings().all()
    revertidas = 0
    for h in rows:
        r = db.execute(
            text("UPDATE venda_parcela SET data_pagamento = :antiga WHERE id = :p AND data_pagamento = :nova"),
            {"antiga": h["data_antiga"], "p": h["parcela_id"], "nova": h["data_nova"]},
        )
        if r.rowcount:
            revertidas += 1
        db.execute(text("UPDATE venda_parcela_data_pagamento_hist SET desfeito_em = now() WHERE id = :i"), {"i": h["id"]})
    db.commit()
    return {"revertidas": revertidas, "registros": len(rows)}
