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
