"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { editarBiometria, excluirBiometria, restaurarBiometria } from "@/lib/api";
import { painelBiometria, type BiometriaDetalhe } from "@/lib/paineis";
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
  peso_medio_g: string;
}

export default function PainelBiometria() {
  const router = useRouter();
  const [de, setDe] = useState(diasAtras(30));
  const [ate, setAte] = useState(hojeISO());
  const [dados, setDados] = useState<BiometriaDetalhe[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<EdicaoForm | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [mostrarExcluidos, setMostrarExcluidos] = useState(false);
  const [processandoId, setProcessandoId] = useState<number | null>(null);

  function carregar() {
    setDados(null);
    painelBiometria(de, ate, mostrarExcluidos).then(setDados).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarExcluidos]);

  function recarregar() {
    painelBiometria(de, ate, mostrarExcluidos).then(setDados).catch(() => {});
  }

  function buscar() {
    carregar();
  }

  async function excluir(b: BiometriaDetalhe) {
    if (!window.confirm(`Excluir a biometria de ${b.viveiro_codigo} em ${dataBr(b.data)}? Pode ser restaurada depois.`)) return;
    setProcessandoId(b.id);
    try {
      await excluirBiometria(b.id);
      setToast("Biometria excluída");
      recarregar();
    } catch {
      setToast("Não foi possível excluir");
    } finally {
      setProcessandoId(null);
      setTimeout(() => setToast(null), 3000);
    }
  }

  async function restaurar(b: BiometriaDetalhe) {
    setProcessandoId(b.id);
    try {
      await restaurarBiometria(b.id);
      setToast("Biometria restaurada");
      recarregar();
    } catch {
      setToast("Não foi possível restaurar");
    } finally {
      setProcessandoId(null);
      setTimeout(() => setToast(null), 3000);
    }
  }

  function iniciarEdicao(b: BiometriaDetalhe) {
    setEditandoId(b.id);
    setForm({ data: b.data, peso_medio_g: String(b.peso_medio_g).replace(".", ",") });
  }

  async function salvarEdicao(b: BiometriaDetalhe) {
    if (!form) return;
    setSalvando(true);
    try {
      await editarBiometria(b.id, {
        data: form.data,
        peso_medio_g: parseFloat(form.peso_medio_g.replace(",", ".")) || 0,
      });
      setToast(`Biometria de ${b.viveiro_codigo} corrigida`);
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
          <h1>Biometria</h1>
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
          <p className={styles.hint}>{mostrarExcluidos ? "Nenhuma biometria excluída no período." : "Nenhuma biometria no período."}</p>
        )}

        {dados && dados.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.tabela}>
              <thead>
                <tr>
                  <th>Data</th><th>Viveiro</th><th>Lote</th><th>Peso médio (g)</th><th></th>
                </tr>
              </thead>
              <tbody>
                {dados.map((b) => {
                  return (
                    <tr key={b.id}>
                      {editandoId === b.id && form ? (
                        <>
                          <td>
                            <input
                              type="date"
                              value={form.data}
                              onChange={(e) => setForm({ ...form, data: e.target.value })}
                              style={{ width: 130 }}
                            />
                          </td>
                          <td>{b.viveiro_codigo}</td>
                          <td>{b.lote_codigo}</td>
                          <td>
                            <input
                              type="number" inputMode="decimal" style={{ width: 90, textAlign: "right" }}
                              value={form.peso_medio_g}
                              onChange={(e) => setForm({ ...form, peso_medio_g: e.target.value })}
                            />
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <button
                              type="button" disabled={salvando} onClick={() => salvarEdicao(b)}
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
                          <td>{dataBr(b.data)}</td>
                          <td>{b.viveiro_codigo}</td>
                          <td>{b.lote_codigo}</td>
                          <td>{nf(b.peso_medio_g)}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            {mostrarExcluidos ? (
                              <>
                                <span className={styles.hint} style={{ display: "block", fontSize: "0.72rem" }}>
                                  {b.excluido_em ? `Excluída ${dataHoraBr(b.excluido_em)}` : ""}
                                  {b.excluido_por ? ` · ${b.excluido_por}` : ""}
                                </span>
                                <button
                                  type="button" disabled={processandoId === b.id} onClick={() => restaurar(b)}
                                  style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
                                >
                                  Restaurar
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => iniciarEdicao(b)}
                                  style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
                                >
                                  Editar
                                </button>
                                {" · "}
                                <button
                                  type="button" disabled={processandoId === b.id} onClick={() => excluir(b)}
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
