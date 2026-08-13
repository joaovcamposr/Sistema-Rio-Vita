"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  painelProducao, painelProducaoDetalhe, painelProducaoSerie,
  type Granularidade, type ProducaoDetalheLinha, type ProducaoResumo, type ProducaoSerie,
} from "@/lib/paineis";
import { editarProducao, excluirProducao, listarProdutos, restaurarProducao, type Produto } from "@/lib/api";
import Chart, { type SeriePonto } from "@/components/Chart";
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
function formatarBucket(b: string): string {
  if (b.length === 4) return b;
  if (b.length === 7) {
    const [a, m] = b.split("-");
    return `${m}/${a.slice(2)}`;
  }
  const [, m, d] = b.split("-");
  return `${d}/${m}`;
}

const GRANULARIDADES: { valor: Granularidade; rotulo: string }[] = [
  { valor: "dia", rotulo: "Dia" },
  { valor: "mes", rotulo: "Mês" },
  { valor: "ano", rotulo: "Ano" },
];

interface FormProducao {
  data: string;
  produto_id: number;
  quantidade: string;
  data_despesca: string;
}

export default function PainelProducao() {
  const router = useRouter();
  const [de, setDe] = useState(diasAtras(30));
  const [ate, setAte] = useState(hojeISO());
  const [dados, setDados] = useState<ProducaoResumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [granularidade, setGranularidade] = useState<Granularidade>("mes");
  const [serie, setSerie] = useState<ProducaoSerie | null>(null);
  const [comoTabela, setComoTabela] = useState(false);
  const [detalhe, setDetalhe] = useState<ProducaoDetalheLinha[] | null>(null);
  const [mostrarDetalhe, setMostrarDetalhe] = useState(false);
  const [mostrarExcluidos, setMostrarExcluidos] = useState(false);
  const [produtosCadastro, setProdutosCadastro] = useState<Produto[]>([]);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<FormProducao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [processandoId, setProcessandoId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setDados(null);
    painelProducao(de, ate).then(setDados).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }, [de, ate]);

  function carregarDetalhe() {
    setDetalhe(null);
    painelProducaoDetalhe(de, ate, mostrarExcluidos).then(setDetalhe).catch(() => undefined);
  }

  useEffect(() => {
    carregarDetalhe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [de, ate, mostrarExcluidos]);

  useEffect(() => {
    listarProdutos().then(setProdutosCadastro).catch(() => undefined);
  }, []);

  useEffect(() => {
    setSerie(null);
    painelProducaoSerie(granularidade, de, ate).then(setSerie).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }, [granularidade, de, ate]);

  const produtos = useMemo(() => {
    if (!serie) return [];
    const nomes = new Set<string>();
    serie.buckets.forEach((b) => b.por_produto.forEach((p) => nomes.add(p.produto_nome)));
    return Array.from(nomes).sort();
  }, [serie]);

  const pontosProducao: SeriePonto[] = useMemo(() => {
    if (!serie) return [];
    return serie.buckets.map((b) => ({
      bucket: b.bucket,
      valores: Object.fromEntries(produtos.map((p) => [p, b.por_produto.find((x) => x.produto_nome === p)?.quantidade_kg ?? null])),
    }));
  }, [serie, produtos]);

  const pontosRendimento: SeriePonto[] = useMemo(() => {
    if (!serie) return [];
    return serie.buckets.map((b) => ({
      bucket: b.bucket,
      valores: { "Rendimento (%)": b.rendimento_medio_ponderado !== null ? b.rendimento_medio_ponderado * 100 : null },
    }));
  }, [serie]);

  const pontosPesoSujo: SeriePonto[] = useMemo(() => {
    if (!serie) return [];
    return serie.buckets.map((b) => ({
      bucket: b.bucket,
      valores: { "Peso sujo médio (g)": b.peso_medio_suja_ponderado_g },
    }));
  }, [serie]);

  function iniciarEdicao(d: ProducaoDetalheLinha) {
    const produto = produtosCadastro.find((p) => p.id === d.produto_id);
    const valor = produto?.kg_digitado ? d.quantidade_kg : (d.quantidade_embalagens ?? d.quantidade_kg);
    setEditandoId(d.id);
    setForm({
      data: d.data, produto_id: d.produto_id,
      quantidade: String(valor).replace(".", ","),
      data_despesca: d.data_despesca ?? "",
    });
  }

  async function salvarEdicao(d: ProducaoDetalheLinha) {
    if (!form) return;
    const produto = produtosCadastro.find((p) => p.id === form.produto_id);
    if (!produto) return;
    const qtd = parseFloat(form.quantidade.replace(",", ".")) || 0;
    setSalvando(true);
    try {
      await editarProducao(d.id, {
        data: form.data,
        produto_id: form.produto_id,
        quantidade_embalagens: produto.kg_digitado ? null : qtd,
        quantidade_kg: produto.kg_digitado ? qtd : null,
        lote_id: d.lote_id,
        data_despesca: form.data_despesca || null,
      });
      setToast("Produção corrigida");
      setEditandoId(null);
      setForm(null);
      carregarDetalhe();
    } catch {
      setToast("Não foi possível salvar — confira os valores e a conexão");
    } finally {
      setSalvando(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  async function excluir(d: ProducaoDetalheLinha) {
    if (!window.confirm(`Excluir a produção de ${d.produto_nome} de ${dataBr(d.data)}? Pode ser restaurada depois.`)) return;
    setProcessandoId(d.id);
    try {
      await excluirProducao(d.id);
      setToast("Produção excluída");
      carregarDetalhe();
    } catch {
      setToast("Não foi possível excluir");
    } finally {
      setProcessandoId(null);
      setTimeout(() => setToast(null), 3000);
    }
  }

  async function restaurar(d: ProducaoDetalheLinha) {
    setProcessandoId(d.id);
    try {
      await restaurarProducao(d.id);
      setToast("Produção restaurada");
      carregarDetalhe();
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
          <h1>Produção e rendimento</h1>
          <div className={styles.sub}>Peso sujo e rendimento ponderados no período</div>
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
        </div>

        {erro && <div className={styles.erro}>{erro}</div>}
        {!dados && !erro && <div className={styles.carregando}>Carregando…</div>}

        {dados && (
          <>
            <div className={styles.cards}>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Produzido — Filé (kg)</div>
                <div className={styles.cardValue}>{nf(dados.produzido_file_kg, 0)}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Produzido — Postas (kg)</div>
                <div className={styles.cardValue}>{nf(dados.produzido_postas_kg, 0)}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Produzido — Tilápia limpa (kg)</div>
                <div className={styles.cardValue}>{nf(dados.produzido_tilapia_limpa_kg, 0)}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Peso sujo médio</div>
                <div className={styles.cardValue}>
                  {dados.peso_medio_suja_ponderado_g !== null ? `${nf(dados.peso_medio_suja_ponderado_g)} g` : "—"}
                </div>
              </div>
            </div>
            <div className={styles.cards} style={{ marginTop: 12 }}>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Rendimento médio de Filé</div>
                <div className={styles.cardValue}>
                  {dados.rendimento_medio_ponderado_file !== null ? `${nf(dados.rendimento_medio_ponderado_file * 100)}%` : "—"}
                </div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Rendimento médio de Postas</div>
                <div className={styles.cardValue}>
                  {dados.rendimento_medio_ponderado_postas !== null ? `${nf(dados.rendimento_medio_ponderado_postas * 100)}%` : "—"}
                </div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Rendimento médio de Tilápia limpa</div>
                <div className={styles.cardValue}>
                  {dados.rendimento_medio_ponderado_tilapia_limpa !== null
                    ? `${nf(dados.rendimento_medio_ponderado_tilapia_limpa * 100)}%` : "—"}
                </div>
              </div>
            </div>
          </>
        )}

        <div className={styles.filtros} style={{ marginTop: 8 }}>
          <div className={styles.campo}>
            <label>Granularidade</label>
            <div style={{ display: "flex", gap: 6 }}>
              {GRANULARIDADES.map((g) => (
                <button
                  key={g.valor}
                  type="button"
                  onClick={() => setGranularidade(g.valor)}
                  style={{
                    padding: "8px 12px", borderRadius: 9, border: "1px solid var(--rule-strong)",
                    background: granularidade === g.valor ? "var(--brand)" : "var(--surface)",
                    color: granularidade === g.valor ? "var(--brand-ink)" : "var(--ink-muted)",
                    fontWeight: 700, fontSize: "0.82rem", cursor: "pointer",
                  }}
                >
                  {g.rotulo}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.campo}>
            <label>Visualização</label>
            <button
              type="button"
              onClick={() => setComoTabela((v) => !v)}
              style={{
                padding: "9px 14px", borderRadius: 9, border: "1px solid var(--rule-strong)",
                background: "var(--surface)", color: "var(--ink-muted)", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer",
              }}
            >
              {comoTabela ? "Ver gráfico" : "Ver tabela"}
            </button>
          </div>
        </div>

        {!serie && !erro && <div className={styles.carregando}>Carregando gráficos…</div>}
        {serie && serie.buckets.length === 0 && <p className={styles.hint}>Nenhuma produção no período.</p>}

        {serie && serie.buckets.length > 0 && !comoTabela && (
          <>
            <div className={styles.section}>Produção por produto (Kg)</div>
            <Chart
              dados={pontosProducao} series={produtos} tipo="barra" modoBarra="empilhada" mostrarTotal
              formatarBucket={formatarBucket} formatarValor={(v) => nf(v, 0)} caberNaTela
            />

            <div className={styles.section}>Rendimento médio ponderado de Filé (%)</div>
            <p className={styles.hint}>Medido por lote despescado — não se separa por embalagem de produto final.</p>
            <Chart dados={pontosRendimento} series={["Rendimento (%)"]} tipo="linha" formatarBucket={formatarBucket} formatarValor={(v) => `${nf(v)}%`} caberNaTela />

            <div className={styles.section}>Peso sujo médio (g)</div>
            <Chart dados={pontosPesoSujo} series={["Peso sujo médio (g)"]} tipo="linha" formatarBucket={formatarBucket} formatarValor={(v) => `${nf(v)} g`} caberNaTela />
          </>
        )}

        {serie && serie.buckets.length > 0 && comoTabela && (
          <div className={styles.tableWrap}>
            <table className={styles.tabela}>
              <thead>
                <tr><th>Período</th><th>Produto</th><th>Kg produzido</th><th>Rendimento</th><th>Peso sujo médio</th></tr>
              </thead>
              <tbody>
                {serie.buckets.flatMap((b) =>
                  (b.por_produto.length > 0 ? b.por_produto : [null]).map((p, i) => (
                    <tr key={`${b.bucket}-${p?.produto_id ?? i}`}>
                      <td>{formatarBucket(b.bucket)}</td>
                      <td>{p?.produto_nome ?? "—"}</td>
                      <td>{p ? nf(p.quantidade_kg, 0) : "—"}</td>
                      <td>{i === 0 && b.rendimento_medio_ponderado !== null ? `${nf(b.rendimento_medio_ponderado * 100)}%` : ""}</td>
                      <td>{i === 0 && b.peso_medio_suja_ponderado_g !== null ? `${nf(b.peso_medio_suja_ponderado_g)} g` : ""}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className={styles.section} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Detalhe por lançamento</span>
          <div style={{ display: "flex", gap: 8 }}>
            {mostrarDetalhe && (
              <button
                type="button"
                onClick={() => setMostrarExcluidos((v) => !v)}
                style={{
                  padding: "6px 12px", borderRadius: 9, border: "1px solid var(--rule-strong)",
                  background: mostrarExcluidos ? "var(--brand)" : "var(--surface)",
                  color: mostrarExcluidos ? "var(--brand-ink)" : "var(--ink-muted)",
                  fontWeight: 700, fontSize: "0.78rem", cursor: "pointer",
                }}
              >
                {mostrarExcluidos ? "Vendo excluídas" : "Ver excluídas"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setMostrarDetalhe((v) => !v)}
              style={{
                padding: "6px 12px", borderRadius: 9, border: "1px solid var(--rule-strong)",
                background: "var(--surface)", color: "var(--ink-muted)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer",
              }}
            >
              {mostrarDetalhe ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </div>
        {mostrarDetalhe && (
          <>
            <p className={styles.hint}>
              Cada linha é um lançamento de produção, com o tanque e a data de despesca de origem. O rendimento é por
              família de produto (Filé, Postas, Tilápia limpa) contra o peso despescado daquela família — linhas da
              mesma família e mesma despesca compartilham o valor, mas famílias diferentes têm rendimentos próprios.
            </p>
            {!detalhe && <p className={styles.hint}>Carregando…</p>}
            {detalhe && detalhe.length === 0 && (
              <p className={styles.hint}>{mostrarExcluidos ? "Nenhuma produção excluída no período." : "Nenhuma produção no período."}</p>
            )}
            {detalhe && detalhe.length > 0 && (
              <div className={styles.tableWrap}>
                <table className={styles.tabela}>
                  <thead>
                    <tr>
                      <th>Data</th><th>Produto</th><th>Kg</th><th>Tanque</th>
                      <th>Despesca de origem</th><th>Peso sujo médio</th><th>Rendimento</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalhe.map((d) => (
                      <tr key={d.id}>
                        {editandoId === d.id && form ? (
                          <>
                            <td>
                              <input
                                type="date" value={form.data} style={{ width: 130 }}
                                onChange={(e) => setForm({ ...form, data: e.target.value })}
                              />
                            </td>
                            <td>
                              <select
                                value={form.produto_id}
                                onChange={(e) => setForm({ ...form, produto_id: Number(e.target.value) })}
                              >
                                {produtosCadastro.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                              </select>
                            </td>
                            <td>
                              <input
                                type="number" inputMode="decimal" style={{ width: 80, textAlign: "right" }}
                                value={form.quantidade}
                                onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
                              />
                            </td>
                            <td>{d.viveiro_codigo ?? "—"}{d.lote_codigo ? ` (${d.lote_codigo})` : ""}</td>
                            <td>
                              <input
                                type="date" value={form.data_despesca} style={{ width: 130 }}
                                onChange={(e) => setForm({ ...form, data_despesca: e.target.value })}
                              />
                            </td>
                            <td>—</td>
                            <td>—</td>
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
                            <td>{d.produto_nome}</td>
                            <td>{nf(d.quantidade_kg, 1)}</td>
                            <td>{d.viveiro_codigo ?? "—"}{d.lote_codigo ? ` (${d.lote_codigo})` : ""}</td>
                            <td>{d.data_despesca ? dataBr(d.data_despesca) : "—"}</td>
                            <td>{d.peso_medio_suja_g !== null ? `${nf(d.peso_medio_suja_g)} g` : "—"}</td>
                            <td>{d.rendimento !== null ? `${nf(d.rendimento * 100)}%` : "—"}</td>
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
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
