"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listarProdutos, type Produto } from "@/lib/api";
import {
  editarDespesa,
  editarRetorno,
  listarDespesasExpedicao,
  listarRetornosExpedicao,
  listarVendedores,
  type Despesa,
  type RetornoDetalhe,
  type Vendedor,
} from "@/lib/cadastros";
import { painelAcertos, type AcertoResumo } from "@/lib/paineis";
import styles from "../painel.module.css";

const FORMAS = ["Dinheiro", "Pix", "Prazo"];

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
function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

interface FormDespesa { data: string; categoria: string; valor: string; forma_pgto: string; observacao: string }
interface FormRetorno { quantidade: string }

export default function PainelAcertos() {
  const router = useRouter();
  const [de, setDe] = useState(diasAtras(30));
  const [ate, setAte] = useState(hojeISO());
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [vendedorFiltro, setVendedorFiltro] = useState<number | "">("");
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [dados, setDados] = useState<AcertoResumo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [expandidoId, setExpandidoId] = useState<number | null>(null);
  const [despesas, setDespesas] = useState<Despesa[] | null>(null);
  const [retornos, setRetornos] = useState<RetornoDetalhe[] | null>(null);

  const [editandoDespesaId, setEditandoDespesaId] = useState<number | null>(null);
  const [formDespesa, setFormDespesa] = useState<FormDespesa | null>(null);
  const [editandoRetornoId, setEditandoRetornoId] = useState<number | null>(null);
  const [formRetorno, setFormRetorno] = useState<FormRetorno | null>(null);
  const [salvando, setSalvando] = useState(false);

  function carregar() {
    setDados(null);
    painelAcertos(de, ate, vendedorFiltro || null)
      .then(setDados)
      .catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    listarVendedores().then(setVendedores).catch(() => {});
    listarProdutos().then(setProdutos).catch(() => {});
  }, []);

  function buscar() {
    carregar();
  }

  async function expandir(a: AcertoResumo) {
    if (expandidoId === a.expedicao_id) {
      setExpandidoId(null);
      return;
    }
    setExpandidoId(a.expedicao_id);
    setDespesas(null);
    setRetornos(null);
    try {
      const [d, r] = await Promise.all([
        listarDespesasExpedicao(a.expedicao_id),
        listarRetornosExpedicao(a.expedicao_id),
      ]);
      setDespesas(d);
      setRetornos(r);
    } catch {
      setToast("Não foi possível carregar o detalhe do acerto");
      setTimeout(() => setToast(null), 3000);
    }
  }

  function recarregarDetalhe(expedicaoId: number) {
    Promise.all([listarDespesasExpedicao(expedicaoId), listarRetornosExpedicao(expedicaoId)]).then(([d, r]) => {
      setDespesas(d);
      setRetornos(r);
    });
    carregar();
  }

  function iniciarEdicaoDespesa(d: Despesa) {
    setEditandoDespesaId(d.id);
    setFormDespesa({
      data: d.data, categoria: d.categoria, valor: String(d.valor).replace(".", ","),
      forma_pgto: d.forma_pgto, observacao: d.observacao ?? "",
    });
  }

  async function salvarDespesa(d: Despesa) {
    if (!formDespesa) return;
    setSalvando(true);
    try {
      await editarDespesa(d.id, {
        data: formDespesa.data, categoria: formDespesa.categoria,
        valor: parseFloat(formDespesa.valor.replace(",", ".")) || 0,
        forma_pgto: formDespesa.forma_pgto, observacao: formDespesa.observacao.trim() || null,
      });
      setToast("Despesa corrigida");
      setEditandoDespesaId(null);
      setFormDespesa(null);
      if (expandidoId !== null) recarregarDetalhe(expandidoId);
    } catch {
      setToast("Não foi possível salvar a despesa");
    } finally {
      setSalvando(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  function iniciarEdicaoRetorno(r: RetornoDetalhe) {
    const produto = produtos.find((p) => p.id === r.produto_id);
    const valor = produto?.kg_digitado ? r.quantidade_kg : (r.quantidade_embalagens ?? r.quantidade_kg);
    setEditandoRetornoId(r.id);
    setFormRetorno({ quantidade: String(valor).replace(".", ",") });
  }

  async function salvarRetorno(r: RetornoDetalhe) {
    if (!formRetorno) return;
    const produto = produtos.find((p) => p.id === r.produto_id);
    const qtd = parseFloat(formRetorno.quantidade.replace(",", ".")) || 0;
    setSalvando(true);
    try {
      await editarRetorno(r.id, {
        quantidade_embalagens: produto?.kg_digitado ? null : qtd,
        quantidade_kg: produto?.kg_digitado ? qtd : null,
      });
      setToast("Retorno corrigido");
      setEditandoRetornoId(null);
      setFormRetorno(null);
      recarregarDetalhe(r.expedicao_id);
    } catch {
      setToast("Não foi possível salvar o retorno");
    } finally {
      setSalvando(false);
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
          <h1>Acertos de expedição</h1>
          <div className={styles.sub}>Conferência dos acertos já fechados, com opção de corrigir despesas e retornos</div>
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
          <div className={styles.campo}>
            <label>Vendedor</label>
            <select
              value={vendedorFiltro}
              onChange={(e) => setVendedorFiltro(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Todos</option>
              {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
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
        </div>

        {erro && <div className={styles.erro}>{erro}</div>}
        {!dados && !erro && <div className={styles.carregando}>Carregando…</div>}
        {dados && dados.length === 0 && <p className={styles.hint}>Nenhum acerto no período.</p>}

        {dados && dados.map((a) => {
          const expandido = expandidoId === a.expedicao_id;
          const diferencasComProblema = a.diferencas.filter((d) => Math.abs(d.diferenca_kg) > 0.01);
          return (
            <div key={a.expedicao_id} style={{ border: "1px solid var(--rule)", borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
              <button
                type="button"
                onClick={() => expandir(a)}
                style={{
                  width: "100%", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center",
                  padding: "12px 14px", background: "var(--surface)", border: "none", cursor: "pointer", textAlign: "left",
                }}
              >
                <div style={{ fontWeight: 700 }}>{a.vendedor_nome}</div>
                <div className={styles.hint}>Saiu {dataBr(a.data_saida)} · Acertado {dataBr(a.data_acerto)}</div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 16, fontSize: "0.85rem" }}>
                  <span>Vendas: <strong>{moeda(a.total_vendas_dinheiro)}</strong></span>
                  <span>Despesas: <strong>{moeda(a.total_despesas_dinheiro)}</strong></span>
                  <span>Esperado: <strong>{moeda(a.total_esperado_dinheiro)}</strong></span>
                  {diferencasComProblema.length > 0 && (
                    <span style={{ color: "var(--crit)", fontWeight: 700 }}>⚠ diferença de estoque</span>
                  )}
                </div>
              </button>

              {expandido && (
                <div style={{ padding: 14, borderTop: "1px solid var(--rule)" }}>
                  <p className={styles.hint} style={{ fontWeight: 700, marginBottom: 8 }}>Diferenças (expedido × vendido × retornado)</p>
                  <div className={styles.tableWrap} style={{ marginBottom: 18 }}>
                    <table className={styles.tabela}>
                      <thead>
                        <tr><th>Produto</th><th>Expedido</th><th>Vendido</th><th>Retornado</th><th>Diferença</th></tr>
                      </thead>
                      <tbody>
                        {a.diferencas.map((d) => (
                          <tr key={d.produto_id}>
                            <td>{d.produto_nome}</td>
                            <td>{nf(d.quantidade_expedida_kg)} kg</td>
                            <td>{nf(d.quantidade_vendida_kg)} kg</td>
                            <td>{nf(d.quantidade_retornada_kg)} kg</td>
                            <td style={{ color: Math.abs(d.diferenca_kg) > 0.01 ? "var(--crit)" : undefined, fontWeight: 700 }}>
                              {nf(d.diferenca_kg)} kg
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className={styles.hint} style={{ fontWeight: 700, marginBottom: 8 }}>Despesas da rota</p>
                  {despesas === null && <p className={styles.hint}>Carregando…</p>}
                  {despesas && despesas.length === 0 && <p className={styles.hint}>Nenhuma despesa neste acerto.</p>}
                  {despesas && despesas.length > 0 && (
                    <div className={styles.tableWrap} style={{ marginBottom: 18 }}>
                      <table className={styles.tabela}>
                        <thead>
                          <tr><th>Categoria</th><th>Valor</th><th>Forma</th><th>Observação</th><th></th></tr>
                        </thead>
                        <tbody>
                          {despesas.map((d) => (
                            <tr key={d.id}>
                              {editandoDespesaId === d.id && formDespesa ? (
                                <>
                                  <td>
                                    <input value={formDespesa.categoria} onChange={(e) => setFormDespesa({ ...formDespesa, categoria: e.target.value })} style={{ width: 120 }} />
                                  </td>
                                  <td>
                                    <input type="number" inputMode="decimal" style={{ width: 80, textAlign: "right" }} value={formDespesa.valor} onChange={(e) => setFormDespesa({ ...formDespesa, valor: e.target.value })} />
                                  </td>
                                  <td>
                                    <select value={formDespesa.forma_pgto} onChange={(e) => setFormDespesa({ ...formDespesa, forma_pgto: e.target.value })}>
                                      {FORMAS.map((f) => <option key={f} value={f}>{f}</option>)}
                                    </select>
                                  </td>
                                  <td>
                                    <input value={formDespesa.observacao} onChange={(e) => setFormDespesa({ ...formDespesa, observacao: e.target.value })} style={{ width: 140 }} />
                                  </td>
                                  <td style={{ whiteSpace: "nowrap" }}>
                                    <button type="button" disabled={salvando} onClick={() => salvarDespesa(d)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "var(--brand)", color: "var(--brand-ink)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer", marginRight: 6 }}>OK</button>
                                    <button type="button" onClick={() => { setEditandoDespesaId(null); setFormDespesa(null); }} style={{ background: "none", border: "none", color: "var(--ink-muted)", fontSize: "0.78rem", cursor: "pointer" }}>Cancelar</button>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td>{d.categoria}</td>
                                  <td>{moeda(d.valor)}</td>
                                  <td>{d.forma_pgto}</td>
                                  <td>{d.observacao ?? "—"}</td>
                                  <td>
                                    <button type="button" onClick={() => iniciarEdicaoDespesa(d)} style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}>Editar</button>
                                  </td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <p className={styles.hint} style={{ fontWeight: 700, marginBottom: 8 }}>Retornos</p>
                  {retornos === null && <p className={styles.hint}>Carregando…</p>}
                  {retornos && retornos.length === 0 && <p className={styles.hint}>Nenhum retorno neste acerto.</p>}
                  {retornos && retornos.length > 0 && (
                    <div className={styles.tableWrap}>
                      <table className={styles.tabela}>
                        <thead>
                          <tr><th>Produto</th><th>Quantidade</th><th>Kg</th><th></th></tr>
                        </thead>
                        <tbody>
                          {retornos.map((r) => (
                            <tr key={r.id}>
                              {editandoRetornoId === r.id && formRetorno ? (
                                <>
                                  <td>{r.produto_nome}</td>
                                  <td colSpan={2}>
                                    <input type="number" inputMode="decimal" style={{ width: 90, textAlign: "right" }} value={formRetorno.quantidade} onChange={(e) => setFormRetorno({ quantidade: e.target.value })} />
                                  </td>
                                  <td style={{ whiteSpace: "nowrap" }}>
                                    <button type="button" disabled={salvando} onClick={() => salvarRetorno(r)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "var(--brand)", color: "var(--brand-ink)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer", marginRight: 6 }}>OK</button>
                                    <button type="button" onClick={() => { setEditandoRetornoId(null); setFormRetorno(null); }} style={{ background: "none", border: "none", color: "var(--ink-muted)", fontSize: "0.78rem", cursor: "pointer" }}>Cancelar</button>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td>{r.produto_nome}</td>
                                  <td>{r.quantidade_embalagens !== null ? nf(r.quantidade_embalagens) : "—"}</td>
                                  <td>{nf(r.quantidade_kg)} kg</td>
                                  <td>
                                    <button type="button" onClick={() => iniciarEdicaoRetorno(r)} style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}>Editar</button>
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
              )}
            </div>
          );
        })}
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
