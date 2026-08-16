"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  editarDespesa, excluirDespesa, restaurarDespesa, listarDespesasSoltas, type Despesa,
} from "@/lib/cadastros";
import styles from "../painel.module.css";

const CATEGORIAS = ["Abastecimento", "Alimentação", "Manutenção", "Material de escritório", "Outro"];
const FORMAS = ["Dinheiro", "Pix", "Cartão"];

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function diasAtras(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}
function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
  categoria: string;
  valor: string;
  forma_pgto: string;
  observacao: string;
}

export default function PainelDespesas() {
  const router = useRouter();
  const [de, setDe] = useState(diasAtras(30));
  const [ate, setAte] = useState(hojeISO());
  const [dados, setDados] = useState<Despesa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<EdicaoForm | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [mostrarExcluidos, setMostrarExcluidos] = useState(false);
  const [processandoId, setProcessandoId] = useState<number | null>(null);

  function carregar() {
    setDados(null);
    listarDespesasSoltas(de, ate, mostrarExcluidos).then(setDados).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarExcluidos]);

  function recarregar() {
    listarDespesasSoltas(de, ate, mostrarExcluidos).then(setDados).catch(() => {});
  }

  function buscar() {
    carregar();
  }

  async function excluir(d: Despesa) {
    if (!window.confirm(`Excluir a despesa "${d.categoria}" de ${moeda(d.valor)} em ${dataBr(d.data)}? Pode ser restaurada depois.`)) return;
    setProcessandoId(d.id);
    try {
      await excluirDespesa(d.id);
      setToast("Despesa excluída");
      recarregar();
    } catch {
      setToast("Não foi possível excluir");
    } finally {
      setProcessandoId(null);
      setTimeout(() => setToast(null), 3000);
    }
  }

  async function restaurar(d: Despesa) {
    setProcessandoId(d.id);
    try {
      await restaurarDespesa(d.id);
      setToast("Despesa restaurada");
      recarregar();
    } catch {
      setToast("Não foi possível restaurar");
    } finally {
      setProcessandoId(null);
      setTimeout(() => setToast(null), 3000);
    }
  }

  function iniciarEdicao(d: Despesa) {
    setEditandoId(d.id);
    setForm({
      data: d.data, categoria: d.categoria, valor: String(d.valor).replace(".", ","),
      forma_pgto: d.forma_pgto, observacao: d.observacao ?? "",
    });
  }

  async function salvarEdicao(d: Despesa) {
    if (!form) return;
    setSalvando(true);
    try {
      await editarDespesa(d.id, {
        data: form.data,
        categoria: form.categoria,
        valor: parseFloat(form.valor.replace(",", ".")) || 0,
        forma_pgto: form.forma_pgto,
        observacao: form.observacao.trim() || null,
      });
      setToast("Despesa corrigida");
      setEditandoId(null);
      setForm(null);
      recarregar();
    } catch {
      setToast("Não foi possível salvar — confira os valores e a conexão");
    } finally {
      setSalvando(false);
      setTimeout(() => setToast(null), 3200);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/painel")}>
          ←
        </button>
        <div>
          <h1>Despesas</h1>
          <div className={styles.sub}>Despesas soltas, sem vínculo com expedição — conferência e correção</div>
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
            {mostrarExcluidos ? "Vendo excluídas" : "Ver excluídas"}
          </button>
        </div>

        {erro && <div className={styles.erro}>{erro}</div>}
        {!dados && !erro && <div className={styles.carregando}>Carregando…</div>}
        {dados && dados.length === 0 && (
          <p className={styles.hint}>{mostrarExcluidos ? "Nenhuma despesa excluída no período." : "Nenhuma despesa solta no período."}</p>
        )}

        {dados && dados.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.tabela}>
              <thead>
                <tr>
                  <th>Data</th><th>Categoria</th><th>Valor</th><th>Forma</th><th>Observação</th><th></th>
                </tr>
              </thead>
              <tbody>
                {dados.map((d) => {
                  return (
                    <tr key={d.id}>
                      {editandoId === d.id && form ? (
                        <>
                          <td>
                            <input
                              type="date"
                              value={form.data}
                              onChange={(e) => setForm({ ...form, data: e.target.value })}
                              style={{ width: 130 }}
                            />
                          </td>
                          <td>
                            <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </td>
                          <td>
                            <input
                              type="number" inputMode="decimal" style={{ width: 90, textAlign: "right" }}
                              value={form.valor}
                              onChange={(e) => setForm({ ...form, valor: e.target.value })}
                            />
                          </td>
                          <td>
                            <select value={form.forma_pgto} onChange={(e) => setForm({ ...form, forma_pgto: e.target.value })}>
                              {FORMAS.map((f) => <option key={f} value={f}>{f}</option>)}
                            </select>
                          </td>
                          <td>
                            <input
                              type="text" style={{ width: 140 }}
                              value={form.observacao}
                              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                            />
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <button
                              type="button" disabled={salvando} onClick={() => salvarEdicao(d)}
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
                          <td>{dataBr(d.data)}</td>
                          <td>{d.categoria}</td>
                          <td>{moeda(d.valor)}</td>
                          <td>{d.forma_pgto}</td>
                          <td>{d.observacao ?? "—"}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            {mostrarExcluidos ? (
                              <>
                                <span className={styles.hint} style={{ display: "block", fontSize: "0.72rem" }}>
                                  {d.excluido_em ? `Excluída ${dataHoraBr(d.excluido_em)}` : ""}
                                  {d.excluido_por ? ` · ${d.excluido_por}` : ""}
                                </span>
                                <button
                                  type="button" disabled={processandoId === d.id} onClick={() => restaurar(d)}
                                  style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
                                >
                                  Restaurar
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => iniciarEdicao(d)}
                                  style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
                                >
                                  Editar
                                </button>
                                {" · "}
                                <button
                                  type="button" disabled={processandoId === d.id} onClick={() => excluir(d)}
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
                  );
                })}
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
