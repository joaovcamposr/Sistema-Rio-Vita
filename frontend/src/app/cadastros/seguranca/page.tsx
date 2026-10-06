"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authHeader, obterSessao, sessaoInvalida } from "@/lib/auth";
import styles from "../cadastros.module.css";

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

async function get<T>(caminho: string): Promise<T> {
  const r = await fetch(`${apiBase()}${caminho}`, { headers: authHeader(), cache: "no-store" });
  if (r.status === 401) sessaoInvalida();
  if (!r.ok) throw new Error(r.status === 403 ? "Só gerentes" : `HTTP ${r.status}`);
  return (await r.json()) as T;
}

interface Snapshot { schema: string; descricao: string | null; bytes: number; tabelas: number }
interface ErroLog { id: number; quando: string; metodo: string | null; rota: string | null; usuario: string | null; tipo: string | null; mensagem: string | null }
interface Auditoria { id: number; quando: string; operacao: string; registro_id: string | null; usuario: string | null }

function mb(b: number): string {
  return `${(b / 1048576).toFixed(0)} MB`;
}
function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function Seguranca() {
  const router = useRouter();
  const [ehGerente, setEhGerente] = useState<boolean | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [erros, setErros] = useState<ErroLog[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);
  const [tabela, setTabela] = useState("venda");
  const [registro, setRegistro] = useState("");
  const [historico, setHistorico] = useState<Auditoria[] | null>(null);

  const carregar = useCallback(() => {
    get<Snapshot[]>("/admin/snapshots").then(setSnapshots).catch(() => setMsg("Não foi possível carregar as cópias internas."));
    get<ErroLog[]>("/admin/erros?limite=30").then(setErros).catch(() => undefined);
  }, []);

  useEffect(() => {
    const gerente = obterSessao()?.usuario.papel === "gerente";
    setEhGerente(gerente);
    if (gerente) carregar();
  }, [carregar]);

  async function baixarBackup() {
    setBaixando(true);
    setMsg(null);
    try {
      const r = await fetch(`${apiBase()}/admin/backup`, { headers: authHeader() });
      if (r.status === 401) sessaoInvalida();
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      a.href = url;
      a.download = `riovita_backup_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.rvbak.gz`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`Backup baixado (${mb(blob.size)}). Guarde o arquivo em outro lugar além deste computador.`);
    } catch {
      setMsg("Não foi possível gerar o backup agora. Tente de novo.");
    } finally {
      setBaixando(false);
    }
  }

  async function consultarHistorico() {
    setHistorico(null);
    try {
      const q = new URLSearchParams({ tabela, limite: "50" });
      if (registro.trim()) q.set("registro_id", registro.trim());
      setHistorico(await get<Auditoria[]>(`/admin/auditoria?${q}`));
    } catch {
      setMsg("Não foi possível consultar o histórico.");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/cadastros")}>←</button>
        <div>
          <h1>Segurança dos dados</h1>
          <div className={styles.sub}>Backup, cópias internas, erros e histórico de alterações</div>
        </div>
      </div>
      <div className={styles.body}>
        {ehGerente === false && <p className={styles.hint}>Esta tela é restrita a usuários com papel gerente.</p>}
        {msg && <div className={styles.hint} style={{ fontWeight: 700 }}>{msg}</div>}

        {ehGerente && (
          <>
            <p className={styles.section}>Backup completo</p>
            <p className={styles.hint}>
              Arquivo com todos os dados do sistema. Baixe com frequência (sugestão: toda semana e antes de qualquer
              mudança grande) e guarde fora do servidor — no seu computador e no Google Drive.
            </p>
            <button className={styles.btnPrimary} disabled={baixando} onClick={baixarBackup}>
              {baixando ? "Gerando backup…" : "Baixar backup agora"}
            </button>

            <p className={styles.section} style={{ marginTop: 28 }}>Cópias internas automáticas</p>
            <p className={styles.hint}>
              O sistema copia os dados todo dia (guarda 7 dias) e antes de cada atualização do banco. Servem para
              recuperar rapidamente de um lançamento ou alteração errada.
            </p>
            {!snapshots && <p className={styles.hint}>Carregando…</p>}
            {snapshots && snapshots.length === 0 && <p className={styles.hint}>Nenhuma cópia ainda.</p>}
            {snapshots && snapshots.length > 0 && (
              <div className={styles.tableWrap}>
                <table className={styles.tabela}>
                  <thead><tr><th>Cópia</th><th>Motivo</th><th>Tabelas</th><th>Tamanho</th></tr></thead>
                  <tbody>
                    {snapshots.map((s) => (
                      <tr key={s.schema}>
                        <td>{s.schema}</td>
                        <td>{s.descricao ?? "—"}</td>
                        <td>{s.tabelas}</td>
                        <td>{mb(s.bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className={styles.section} style={{ marginTop: 28 }}>Histórico de alterações</p>
            <p className={styles.hint}>
              Tudo que foi criado, alterado ou excluído em vendas, pagamentos, despesas, despescas, produção, clientes
              e expedições fica registrado, com quem fez. Informe o número do registro para ver só ele.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
              <div className={styles.field} style={{ margin: 0 }}>
                <label>Tabela</label>
                <select className={styles.inp} value={tabela} onChange={(e) => setTabela(e.target.value)}>
                  {["venda", "venda_parcela", "despesa", "despesca", "producao", "ajuste_estoque", "expedicao", "cliente", "lote"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className={styles.field} style={{ margin: 0 }}>
                <label>Nº do registro (opcional)</label>
                <input className={styles.inp} value={registro} onChange={(e) => setRegistro(e.target.value)} inputMode="numeric" />
              </div>
              <button className={styles.btnPrimary} style={{ padding: "9px 18px" }} onClick={consultarHistorico}>Consultar</button>
            </div>
            {historico && historico.length === 0 && <p className={styles.hint}>Nada registrado para esse filtro.</p>}
            {historico && historico.length > 0 && (
              <div className={styles.tableWrap}>
                <table className={styles.tabela}>
                  <thead><tr><th>Quando</th><th>O que</th><th>Registro</th><th>Quem</th></tr></thead>
                  <tbody>
                    {historico.map((h) => (
                      <tr key={h.id}>
                        <td>{quando(h.quando)}</td>
                        <td>{h.operacao === "INSERT" ? "criado" : h.operacao === "UPDATE" ? "alterado" : "excluído"}</td>
                        <td>{h.registro_id}</td>
                        <td>{h.usuario ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className={styles.section} style={{ marginTop: 28 }}>Erros recentes do sistema</p>
            {!erros && <p className={styles.hint}>Carregando…</p>}
            {erros && erros.length === 0 && <p className={styles.hint}>Nenhum erro registrado.</p>}
            {erros && erros.length > 0 && (
              <div className={styles.tableWrap}>
                <table className={styles.tabela}>
                  <thead><tr><th>Quando</th><th>Onde</th><th>Quem</th><th>Erro</th></tr></thead>
                  <tbody>
                    {erros.map((e) => (
                      <tr key={e.id}>
                        <td>{quando(e.quando)}</td>
                        <td>{e.metodo} {e.rota}</td>
                        <td>{e.usuario ?? "—"}</td>
                        <td title={e.mensagem ?? ""}>{e.tipo}: {(e.mensagem ?? "").slice(0, 80)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
