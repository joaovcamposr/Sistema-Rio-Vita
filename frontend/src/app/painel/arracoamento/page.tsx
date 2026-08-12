"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { editarArracoamento, excluirArracoamento, restaurarArracoamento } from "@/lib/api";
import { painelArracoamento, type ArracoamentoDetalhe } from "@/lib/paineis";
import { listarFornecedoresRacao, type FornecedorRacao } from "@/lib/cadastros";
import styles from "../painel.module.css";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function diasAtras(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}
function nf(v: number, casas = 1): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
function dataHoraBr(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

interface EdicaoForm {
  data: string;
  sacos: string;
  tipo_racao_id: number | null;
}

export default function PainelArracoamento() {
  const router = useRouter();
  const [de, setDe] = useState(diasAtras(30));
  const [ate, setAte] = useState(hojeISO());
  const [dados, setDados] = useState<ArracoamentoDetalhe[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tiposRacao, setTiposRacao] = useState<{ id: number; codigo: string }[]>([]);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<EdicaoForm | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [mostrarExcluidos, setMostrarExcluidos] = useState(false);
  const [processandoId, setProcessandoId] = useState<number | null>(null);

  function carregar() {
    setDados(null);
    painelArracoamento(de, ate, mostrarExcluidos).then(setDados).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarExcluidos]);

  useEffect(() => {
    listarFornecedoresRacao()
      .then((fs: FornecedorRacao[]) => setTiposRacao(fs.flatMap((f) => f.tipos.map((t) => ({ id: t.id, codigo: t.codigo })))))
      .catch(() => {});
  }, []);

  function recarregar() {
    painelArracoamento(de, ate, mostrarExcluidos).then(setDados).catch(() => {});
  }

  function buscar() {
    carregar();
  }

  function iniciarEdicao(a: ArracoamentoDetalhe) {
    setEditandoId(a.id);
    setForm({ data: a.data, sacos: String(a.sacos).replace(".", ","), tipo_racao_id: a.tipo_racao_id });
  }

  async function salvarEdicao(a: ArracoamentoDetalhe) {
    if (!form) return;
    setSalvando(true);
    try {
      await editarArracoamento(a.id, {
        data: form.data,
        sacos: parseFloat(form.sacos.replace(",", ".")) || 0,
        tipo_racao_id: form.tipo_racao_id,
      });
      setToast("Arraçoamento corrigido");
      setEditandoId(null);
      setForm(null);
      recarregar();
    } catch {
      setToast("Não foi possível salvar — confira os valores e a conexão");
    } finally {
      setSalvando(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  async function excluir(a: ArracoamentoDetalhe) {
    if (!window.confirm(`Excluir o arraçoamento de ${dataBr(a.data)} (${a.viveiro_codigo})? Pode ser restaurado depois.`)) return;
    setProcessandoId(a.id);
    try {
      await excluirArracoamento(a.id);
      setToast("Arraçoamento excluído");
      recarregar();
    } catch {
      setToast("Não foi possível excluir");
    } finally {
      setProcessandoId(null);
      setTimeout(() => setToast(null), 3000);
    }
  }

  async function restaurar(a: ArracoamentoDetalhe) {
    setProcessandoId(a.id);
    try {
      await restaurarArracoamento(a.id);
      setToast("Arraçoamento restaurado");
      recarregar();
    } catch {
      setToast("Não foi possível restaurar");
    } finally {
      setProcessandoId(null);
      setTimeout(() => setToast(null), 3000);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/painel")}>
          ←
        </button>
        <div>
          <h1>Arraçoamento</h1>
          <div className={styles.sub}>Conferência dos lançamentos, com opção de corrigir</div>
        </div>
      </div>
      <div className={styles.body}>
        <div className={styles.filtros}>
          <div className={styles.campo}>
            <label>De</label>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className={styles.campo}>
            <label>Até</label>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <button
            type="button"
            onClick={buscar}
            style={{
              padding: "9px 16px", borderRadius: 9, border: "1px solid var(--rule-strong)",
              background: "var(--surface)", color: "var(--ink)", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
            }}
          >
            Buscar
          </button>
          <button
            type="button"
            onClick={() => setMostrarExcluidos((v) => !v)}
            style={{
              padding: "9px 16px", borderRadius: 9, border: "1px solid var(--rule-strong)",
              background: mostrarExcluidos ? "var(--brand)" : "var(--surface)",
              color: mostrarExcluidos ? "var(--brand-ink)" : "var(--ink)",
              fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
            }}
          >
            {mostrarExcluidos ? "Vendo excluídos" : "Ver excluídos"}
          </button>
        </div>

        {erro && <div className={styles.erro}>{erro}</div>}
        {!dados && !erro && <div className={styles.carregando}>Carregando…</div>}
        {dados && dados.length === 0 && (
          <p className={styles.hint}>{mostrarExcluidos ? "Nenhum arraçoamento excluído no período." : "Nenhum arraçoamento no período."}</p>
        )}

        {dados && dados.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.tabela}>
              <thead>
                <tr>
                  <th>Data</th><th>Viveiro</th><th>Lote</th><th>Trato</th><th>Ração</th><th>Sacos</th><th></th>
                </tr>
              </thead>
              <tbody>
                {dados.map((a) => (
                  <tr key={a.id}>
                    {editandoId === a.id && form ? (
                      <>
                        <td>
                          <input
                            type="date"
                            value={form.data}
                            onChange={(e) => setForm({ ...form, data: e.target.value })}
                            style={{ width: 130 }}
                          />
                        </td>
                        <td>{a.viveiro_codigo}</td>
                        <td>{a.lote_codigo}</td>
                        <td>{a.trato ?? "Total do dia"}</td>
                        <td>
                          <select
                            value={form.tipo_racao_id ?? ""}
                            onChange={(e) => setForm({ ...form, tipo_racao_id: e.target.value ? Number(e.target.value) : null })}
                          >
                            <option value="">Sem tipo</option>
                            {tiposRacao.map((t) => <option key={t.id} value={t.id}>{t.codigo}</option>)}
                          </select>
                        </td>
                        <td>
                          <input
                            type="number" inputMode="decimal" style={{ width: 80, textAlign: "right" }}
                            value={form.sacos}
                            onChange={(e) => setForm({ ...form, sacos: e.target.value })}
                          />
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <button
                            type="button" disabled={salvando} onClick={() => salvarEdicao(a)}
                            style={{
                              padding: "6px 12px", borderRadius: 8, border: "none", background: "var(--brand)",
                              color: "var(--brand-ink)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer", marginRight: 6,
                            }}
                          >
                            OK
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditandoId(null); setForm(null); }}
                            style={{ background: "none", border: "none", color: "var(--ink-muted)", fontSize: "0.78rem", cursor: "pointer" }}
                          >
                            Cancelar
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{dataBr(a.data)}</td>
                        <td>{a.viveiro_codigo}</td>
                        <td>{a.lote_codigo}</td>
                        <td>{a.trato ?? "Total do dia"}</td>
                        <td>{a.tipo_racao_codigo ?? "—"}</td>
                        <td>{nf(a.sacos)}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {mostrarExcluidos ? (
                            <>
                              <span className={styles.hint} style={{ display: "block", fontSize: "0.72rem" }}>
                                {a.excluido_em ? `Excluído ${dataHoraBr(a.excluido_em)}` : ""}
                                {a.excluido_por ? ` · ${a.excluido_por}` : ""}
                              </span>
                              <button
                                type="button" disabled={processandoId === a.id} onClick={() => restaurar(a)}
                                style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
                              >
                                Restaurar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => iniciarEdicao(a)}
                                style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
                              >
                                Editar
                              </button>
                              {" · "}
                              <button
                                type="button" disabled={processandoId === a.id} onClick={() => excluir(a)}
                                style={{ background: "none", border: "none", color: "var(--crit)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
                              >
                                Excluir
                              </button>
                            </>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
          background: "var(--ink)", color: "var(--ground)", padding: "10px 18px", borderRadius: 10,
          fontSize: "0.85rem", fontWeight: 600, zIndex: 50,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
