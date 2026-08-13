"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { editarRepicagem, excluirRepicagem, restaurarRepicagem } from "@/lib/api";
import { painelRepicagem, type RepicagemDetalhe } from "@/lib/paineis";
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
  quantidade: string;
  peso_medio_g: string;
}

export default function PainelRepicagem() {
  const router = useRouter();
  const [de, setDe] = useState(diasAtras(30));
  const [ate, setAte] = useState(hojeISO());
  const [dados, setDados] = useState<RepicagemDetalhe[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<EdicaoForm | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [mostrarExcluidos, setMostrarExcluidos] = useState(false);
  const [processandoId, setProcessandoId] = useState<number | null>(null);

  function carregar() {
    setDados(null);
    painelRepicagem(de, ate, mostrarExcluidos).then(setDados).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarExcluidos]);

  function recarregar() {
    painelRepicagem(de, ate, mostrarExcluidos).then(setDados).catch(() => {});
  }

  function buscar() {
    carregar();
  }

  async function excluir(r: RepicagemDetalhe) {
    if (!window.confirm(`Excluir a repicagem de ${r.viveiro_origem_codigo} para ${r.viveiro_destino_codigo}? Pode ser restaurada depois.`)) return;
    setProcessandoId(r.id);
    try {
      await excluirRepicagem(r.id);
      setToast("Repicagem excluída");
      recarregar();
    } catch {
      setToast("Não foi possível excluir");
    } finally {
      setProcessandoId(null);
      setTimeout(() => setToast(null), 3000);
    }
  }

  async function restaurar(r: RepicagemDetalhe) {
    setProcessandoId(r.id);
    try {
      await restaurarRepicagem(r.id);
      setToast("Repicagem restaurada");
      recarregar();
    } catch {
      setToast("Não foi possível restaurar");
    } finally {
      setProcessandoId(null);
      setTimeout(() => setToast(null), 3000);
    }
  }

  function iniciarEdicao(r: RepicagemDetalhe) {
    setEditandoId(r.id);
    setForm({
      data: r.data, quantidade: String(r.quantidade), peso_medio_g: String(r.peso_medio_g).replace(".", ","),
    });
  }

  async function salvarEdicao(r: RepicagemDetalhe) {
    if (!form) return;
    setSalvando(true);
    try {
      await editarRepicagem(r.id, {
        data: form.data,
        quantidade: Math.round(parseFloat(form.quantidade.replace(",", ".")) || 0),
        peso_medio_g: parseFloat(form.peso_medio_g.replace(",", ".")) || 0,
      });
      setToast(`Repicagem de ${r.viveiro_origem_codigo} para ${r.viveiro_destino_codigo} corrigida`);
      setEditandoId(null);
      setForm(null);
      // recarrega do servidor em vez de remendar o estado local — o
      // estoque de peixe dos dois tanques (origem e destino) depende de
      // como o backend redistribuiu a diferença, precisa vir recalculado
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
          <h1>Repicagem</h1>
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
            {mostrarExcluidos ? "Vendo excluídas" : "Ver excluídas"}
          </button>
        </div>

        {erro && <div className={styles.erro}>{erro}</div>}
        {!dados && !erro && <div className={styles.carregando}>Carregando…</div>}
        {dados && dados.length === 0 && (
          <p className={styles.hint}>{mostrarExcluidos ? "Nenhuma repicagem excluída no período." : "Nenhuma repicagem no período."}</p>
        )}

        {dados && dados.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.tabela}>
              <thead>
                <tr>
                  <th>Data</th><th>De</th><th>Para</th>
                  <th>Quantidade</th><th>Peso médio (g)</th><th></th>
                </tr>
              </thead>
              <tbody>
                {dados.map((r) => {
                  return (
                    <tr key={r.id}>
                      {editandoId === r.id && form ? (
                        <>
                          <td>
                            <input
                              type="date"
                              value={form.data}
                              onChange={(e) => setForm({ ...form, data: e.target.value })}
                              style={{ width: 130 }}
                            />
                          </td>
                          <td>{r.viveiro_origem_codigo} ({r.lote_origem_codigo})</td>
                          <td>{r.viveiro_destino_codigo} ({r.lote_destino_codigo})</td>
                          <td>
                            <input
                              type="number" inputMode="numeric" style={{ width: 80, textAlign: "right" }}
                              value={form.quantidade}
                              onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              type="number" inputMode="decimal" style={{ width: 90, textAlign: "right" }}
                              value={form.peso_medio_g}
                              onChange={(e) => setForm({ ...form, peso_medio_g: e.target.value })}
                            />
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <button
                              type="button" disabled={salvando} onClick={() => salvarEdicao(r)}
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
                          <td>{dataBr(r.data)}</td>
                          <td>{r.viveiro_origem_codigo} ({r.lote_origem_codigo}){r.lote_origem_fechado ? " — encerrado" : ""}</td>
                          <td>{r.viveiro_destino_codigo} ({r.lote_destino_codigo})</td>
                          <td>{nf(r.quantidade, 0)}</td>
                          <td>{nf(r.peso_medio_g)}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            {mostrarExcluidos ? (
                              <>
                                <span className={styles.hint} style={{ display: "block", fontSize: "0.72rem" }}>
                                  {r.excluido_em ? `Excluída ${dataHoraBr(r.excluido_em)}` : ""}
                                  {r.excluido_por ? ` · ${r.excluido_por}` : ""}
                                </span>
                                <button
                                  type="button" disabled={processandoId === r.id} onClick={() => restaurar(r)}
                                  style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
                                >
                                  Restaurar
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => iniciarEdicao(r)}
                                  style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
                                >
                                  Editar
                                </button>
                                {" · "}
                                <button
                                  type="button" disabled={processandoId === r.id} onClick={() => excluir(r)}
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
