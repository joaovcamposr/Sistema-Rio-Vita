"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  painelEstoque, listarAjustesEstoque, criarAjusteEstoque, editarAjusteEstoque, excluirAjusteEstoque, restaurarAjusteEstoque,
  type EstoqueItem, type AjusteEstoque, type TipoAjusteEstoque,
} from "@/lib/paineis";
import { listarProdutos, type Produto } from "@/lib/api";
import styles from "../painel.module.css";

function nf(v: number, casas = 1): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function diasAtras(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}
function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
function dataHoraBr(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function novoClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const TIPO_LABEL: Record<TipoAjusteEstoque, string> = {
  amostra: "Amostra",
  descarte: "Descarte",
  diferenca_estoque: "Diferença de estoque",
};
const TIPOS: TipoAjusteEstoque[] = ["amostra", "descarte", "diferenca_estoque"];

function unidadeRotulo(p: Produto): string {
  return p.unidade_embalagem === "pacote" ? "pacotes" : "bandejas";
}

export default function PainelEstoque() {
  const router = useRouter();
  const [de, setDe] = useState(diasAtras(365 * 5));
  const [ate, setAte] = useState(hojeISO());
  const [dados, setDados] = useState<EstoqueItem[] | null>(null);
  const [ajustes, setAjustes] = useState<AjusteEstoque[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [produtoId, setProdutoId] = useState<number | null>(null);
  const [tipo, setTipo] = useState<TipoAjusteEstoque>("amostra");
  const [direcao, setDirecao] = useState<"reduzir" | "aumentar">("reduzir");
  const [quantidade, setQuantidade] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [mostrarExcluidos, setMostrarExcluidos] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [formEdicao, setFormEdicao] = useState<{ data: string; quantidade: string; tipo: TipoAjusteEstoque; observacao: string } | null>(null);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [processandoId, setProcessandoId] = useState<number | null>(null);

  useEffect(() => {
    listarProdutos()
      // Tilápia suja não entra no estoque (não passa por Produção) — fora
      // do painel e fora do seletor de ajuste também
      .then((ps) => ps.filter((p) => !p.nome.toLowerCase().includes("suja")))
      .then((ps) => {
        setProdutos(ps);
        if (ps.length > 0) setProdutoId(ps[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setDados(null);
    painelEstoque(de, ate).then(setDados).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
    listarAjustesEstoque(de, ate, mostrarExcluidos).then(setAjustes).catch(() => {});
  }, [de, ate, mostrarExcluidos]);

  const produto = useMemo(() => produtos.find((p) => p.id === produtoId) ?? null, [produtos, produtoId]);
  const qtdNum = parseFloat(quantidade.replace(",", ".")) || 0;
  const podeSalvar = produto !== null && qtdNum > 0 && !enviando;

  async function recarregarAjustes() {
    listarAjustesEstoque(de, ate, mostrarExcluidos).then(setAjustes).catch(() => {});
    painelEstoque(de, ate).then(setDados).catch(() => {});
  }

  function iniciarEdicaoAjuste(a: AjusteEstoque) {
    setEditandoId(a.id);
    const valor = a.quantidade_embalagens !== null ? a.quantidade_embalagens : a.quantidade_kg;
    setFormEdicao({
      data: a.data, quantidade: String(valor).replace(".", ","), tipo: a.tipo, observacao: a.observacao ?? "",
    });
  }

  async function salvarEdicaoAjuste(a: AjusteEstoque) {
    if (!formEdicao) return;
    const valorNum = parseFloat(formEdicao.quantidade.replace(",", ".")) || 0;
    const digitadoEmKg = a.quantidade_embalagens === null;
    setSalvandoEdicao(true);
    try {
      await editarAjusteEstoque(a.id, {
        data: formEdicao.data,
        quantidade_embalagens: digitadoEmKg ? null : valorNum,
        quantidade_kg: digitadoEmKg ? valorNum : null,
        tipo: formEdicao.tipo,
        observacao: formEdicao.observacao.trim() || null,
      });
      setToast("Ajuste corrigido");
      setEditandoId(null);
      setFormEdicao(null);
      setTimeout(() => setToast(null), 2200);
      await recarregarAjustes();
    } catch {
      setToast("Não foi possível salvar — confira os valores");
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function excluirAjuste(a: AjusteEstoque) {
    if (!window.confirm(`Excluir o ajuste de ${a.produto_nome} em ${dataBr(a.data)}? Pode ser restaurado depois.`)) return;
    setProcessandoId(a.id);
    try {
      await excluirAjusteEstoque(a.id);
      setToast("Ajuste excluído");
      await recarregarAjustes();
    } catch {
      setToast("Não foi possível excluir");
    } finally {
      setProcessandoId(null);
      setTimeout(() => setToast(null), 3000);
    }
  }

  async function restaurarAjuste(a: AjusteEstoque) {
    setProcessandoId(a.id);
    try {
      await restaurarAjusteEstoque(a.id);
      setToast("Ajuste restaurado");
      await recarregarAjustes();
    } catch {
      setToast("Não foi possível restaurar");
    } finally {
      setProcessandoId(null);
      setTimeout(() => setToast(null), 3000);
    }
  }

  async function salvarAjuste() {
    if (!produto) return;
    setEnviando(true);
    try {
      const sinal = tipo === "diferenca_estoque" && direcao === "aumentar" ? -1 : 1;
      const valor = qtdNum * sinal;
      await criarAjusteEstoque({
        client_id: novoClientId(),
        data: hojeISO(),
        produto_id: produto.id,
        quantidade_embalagens: produto.kg_digitado ? null : valor,
        quantidade_kg: produto.kg_digitado ? valor : null,
        tipo,
        observacao: observacao || null,
      });
      setToast("Ajuste registrado");
      setQuantidade("");
      setObservacao("");
      setTimeout(() => setToast(null), 2200);
      await recarregarAjustes();
    } catch {
      setToast("Erro ao salvar — tente de novo");
      setTimeout(() => setToast(null), 3000);
    } finally {
      setEnviando(false);
    }
  }

  const produtosComUn = dados ?? [];
  const kgFile = dados
    ?.filter((i) => i.nome.startsWith("Filé"))
    .reduce((s, i) => s + i.saldo_kg, 0) ?? 0;
  const kgPostas = dados?.find((i) => i.nome.startsWith("Postas"))?.saldo_kg ?? 0;
  const kgTilapiaLimpa = dados?.find((i) => i.nome === "Tilápia limpa")?.saldo_kg ?? 0;

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/painel")}>
          ←
        </button>
        <div>
          <h1>Estoque</h1>
          <div className={styles.sub}>Produzido − vendido − em trânsito − ajustado, no período</div>
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

        {dados && (
          <>
            <div className={styles.section}>Estoque por produto (un)</div>
            <div className={styles.cards}>
              {produtosComUn.map((i) => (
                <div className={styles.card} key={i.id}>
                  <div className={styles.cardLabel}>{i.nome}</div>
                  <div className={styles.cardValue}>{nf(i.saldo_un ?? 0, 0)} un</div>
                  <div className={styles.cardSub}>
                    Produzido {nf(i.produzido_un ?? 0, 0)} · Vendido {nf(i.vendido_un ?? 0, 0)}
                    {(i.ajustado_un ?? 0) !== 0 ? ` · Ajustado ${nf(i.ajustado_un ?? 0, 0)}` : ""}
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.section}>Totais em kg</div>
            <div className={styles.cards}>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Filé de tilápia (400g + 500g + 1kg)</div>
                <div className={styles.cardValue}>{nf(kgFile, 0)} kg</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Postas de tilápia</div>
                <div className={styles.cardValue}>{nf(kgPostas, 0)} kg</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Tilápia limpa</div>
                <div className={styles.cardValue}>{nf(kgTilapiaLimpa, 0)} kg</div>
              </div>
            </div>

            <div className={styles.formBox}>
              <div className={styles.section} style={{ marginTop: 0 }}>Novo ajuste de estoque</div>
              <div className={styles.campo} style={{ marginBottom: 14 }}>
                <label>Produto</label>
                <div className={styles.chips}>
                  {produtos.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={styles.chip}
                      aria-pressed={produtoId === p.id}
                      onClick={() => setProdutoId(p.id)}
                    >
                      {p.nome}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.campo} style={{ marginBottom: 14 }}>
                <label>Tipo</label>
                <div className={styles.chips}>
                  {TIPOS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={styles.chip}
                      aria-pressed={tipo === t}
                      onClick={() => {
                        setTipo(t);
                        if (t !== "diferenca_estoque") setDirecao("reduzir");
                      }}
                    >
                      {TIPO_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
              {tipo === "diferenca_estoque" && (
                <div className={styles.campo} style={{ marginBottom: 14 }}>
                  <label>Direção</label>
                  <div className={styles.chips}>
                    <button
                      type="button"
                      className={styles.chip}
                      aria-pressed={direcao === "reduzir"}
                      onClick={() => setDirecao("reduzir")}
                    >
                      Reduzir estoque (sistema mostra a mais)
                    </button>
                    <button
                      type="button"
                      className={styles.chip}
                      aria-pressed={direcao === "aumentar"}
                      onClick={() => setDirecao("aumentar")}
                    >
                      Aumentar estoque (sistema mostra a menos)
                    </button>
                  </div>
                </div>
              )}
              <div className={styles.filtros} style={{ marginBottom: 14 }}>
                <div className={styles.campo}>
                  <label>{produto?.kg_digitado ? "Quantidade (Kg)" : `Quantidade (${produto ? unidadeRotulo(produto) : "un"})`}</label>
                  <input
                    type="number"
                    inputMode={produto?.kg_digitado ? "decimal" : "numeric"}
                    placeholder="0"
                    value={quantidade}
                    onChange={(e) => setQuantidade(e.target.value)}
                  />
                </div>
                <div className={styles.campo} style={{ flex: 1, minWidth: 220 }}>
                  <label>Observação (opcional)</label>
                  <input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
                </div>
              </div>
              <button
                type="button"
                disabled={!podeSalvar}
                onClick={salvarAjuste}
                style={{
                  padding: "11px 18px", borderRadius: 10, border: "none",
                  background: podeSalvar ? "var(--brand)" : "var(--surface-sunk)",
                  color: podeSalvar ? "var(--brand-ink)" : "var(--ink-faint)",
                  fontWeight: 700, cursor: podeSalvar ? "pointer" : "not-allowed",
                }}
              >
                {enviando ? "Salvando…" : "Salvar ajuste"}
              </button>
              {toast && <span style={{ marginLeft: 12, fontSize: "0.85rem", color: "var(--ink-muted)" }}>{toast}</span>}
            </div>

            <div className={styles.section}>Histórico de ajustes de estoque</div>
            <p className={styles.hint}>Amostras, descartes e diferenças de estoque — não entram como venda.</p>
            {(!ajustes || ajustes.length === 0) && (
              <p className={styles.hint}>{mostrarExcluidos ? "Nenhum ajuste excluído no período." : "Nenhum ajuste no período."}</p>
            )}
            {ajustes && ajustes.length > 0 && (
              <div className={styles.tableWrap}>
                <table className={styles.tabela}>
                  <thead>
                    <tr><th>Data</th><th>Produto</th><th>Tipo</th><th>Quantidade</th><th>Observação</th><th></th></tr>
                  </thead>
                  <tbody>
                    {ajustes.map((a) => (
                      <tr key={a.id}>
                        {editandoId === a.id && formEdicao ? (
                          <>
                            <td>
                              <input
                                type="date"
                                value={formEdicao.data}
                                onChange={(e) => setFormEdicao({ ...formEdicao, data: e.target.value })}
                                style={{ width: 130 }}
                              />
                            </td>
                            <td>{a.produto_nome}</td>
                            <td>
                              <select
                                value={formEdicao.tipo}
                                onChange={(e) => setFormEdicao({ ...formEdicao, tipo: e.target.value as TipoAjusteEstoque })}
                              >
                                {TIPOS.map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
                              </select>
                            </td>
                            <td>
                              <input
                                type="number" inputMode="decimal" style={{ width: 90, textAlign: "right" }}
                                value={formEdicao.quantidade}
                                onChange={(e) => setFormEdicao({ ...formEdicao, quantidade: e.target.value })}
                              />
                            </td>
                            <td>
                              <input
                                type="text" style={{ width: 140 }}
                                value={formEdicao.observacao}
                                onChange={(e) => setFormEdicao({ ...formEdicao, observacao: e.target.value })}
                              />
                            </td>
                            <td style={{ whiteSpace: "nowrap" }}>
                              <button
                                type="button" disabled={salvandoEdicao} onClick={() => salvarEdicaoAjuste(a)}
                                style={{
                                  padding: "6px 12px", borderRadius: 8, border: "none", background: "var(--brand)",
                                  color: "var(--brand-ink)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer", marginRight: 6,
                                }}
                              >
                                OK
                              </button>
                              <button
                                type="button"
                                onClick={() => { setEditandoId(null); setFormEdicao(null); }}
                                style={{ background: "none", border: "none", color: "var(--ink-muted)", fontSize: "0.78rem", cursor: "pointer" }}
                              >
                                Cancelar
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{dataBr(a.data)}</td>
                            <td>{a.produto_nome}</td>
                            <td>{TIPO_LABEL[a.tipo]}</td>
                            <td>
                              {a.quantidade_embalagens !== null
                                ? `${nf(a.quantidade_embalagens, 0)} un`
                                : `${nf(a.quantidade_kg, 1)} kg`}
                            </td>
                            <td>{a.observacao ?? "—"}</td>
                            <td style={{ whiteSpace: "nowrap" }}>
                              {mostrarExcluidos ? (
                                <>
                                  <span className={styles.hint} style={{ display: "block", fontSize: "0.72rem" }}>
                                    {a.excluido_em ? `Excluído ${dataHoraBr(a.excluido_em)}` : ""}
                                    {a.excluido_por ? ` · ${a.excluido_por}` : ""}
                                  </span>
                                  <button
                                    type="button" disabled={processandoId === a.id} onClick={() => restaurarAjuste(a)}
                                    style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
                                  >
                                    Restaurar
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => iniciarEdicaoAjuste(a)}
                                    style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
                                  >
                                    Editar
                                  </button>
                                  {" · "}
                                  <button
                                    type="button" disabled={processandoId === a.id} onClick={() => excluirAjuste(a)}
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
    </div>
  );
}
