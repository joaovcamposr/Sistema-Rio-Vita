"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listarVendas, type VendaLista } from "@/lib/api";

type Coluna = "data" | "cliente" | "produto" | "kg" | "preco" | "valor" | "vendedor" | "situacao";

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function nf(v: number, casas = 1): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
function hora(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
}
function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}
/** Intervalo de datas (ISO) que um bucket do gráfico cobre: dia, mês (YYYY-MM) ou ano. */
export function intervaloDoBucket(bucket: string): { de: string; ate: string; rotulo: string } {
  if (bucket.length === 4) return { de: `${bucket}-01-01`, ate: `${bucket}-12-31`, rotulo: `Ano ${bucket}` };
  if (bucket.length === 7) {
    const [a, m] = bucket.split("-").map(Number);
    const ult = String(ultimoDiaDoMes(a, m)).padStart(2, "0");
    return { de: `${bucket}-01`, ate: `${bucket}-${ult}`, rotulo: `${String(m).padStart(2, "0")}/${a}` };
  }
  const dia = new Date(`${bucket}T12:00:00`);
  const semana = dia.toLocaleDateString("pt-BR", { weekday: "long" });
  return { de: bucket, ate: bucket, rotulo: `${dataBr(bucket)} · ${semana}` };
}

interface Props {
  bucket: string;
  /** buckets do gráfico, em qualquer ordem — usados pelos botões "anterior/próximo" */
  buckets: string[];
  clienteId: number | null;
  vendedores: string[];
  excluirVendedores: boolean;
  onFechar: () => void;
  onTrocarBucket: (bucket: string) => void;
}

const COLUNAS: { id: Coluna; rotulo: string; alinhar?: "right" }[] = [
  { id: "data", rotulo: "Data / hora" }, { id: "cliente", rotulo: "Cliente" }, { id: "produto", rotulo: "Produto" },
  { id: "kg", rotulo: "Qtd.", alinhar: "right" }, { id: "preco", rotulo: "R$/kg", alinhar: "right" },
  { id: "valor", rotulo: "Valor", alinhar: "right" }, { id: "vendedor", rotulo: "Vendedor" }, { id: "situacao", rotulo: "Situação" },
];

function corSituacao(s: string): { bg: string; fg: string } {
  if (s === "Pago") return { bg: "var(--ok-soft)", fg: "var(--ok)" };
  if (s === "Parcial") return { bg: "var(--warn-soft)", fg: "var(--warn)" };
  return { bg: "var(--crit-soft)", fg: "var(--crit)" };
}

export default function VendasDoPeriodo({
  bucket, buckets, clienteId, vendedores, excluirVendedores, onFechar, onTrocarBucket,
}: Props) {
  const { de, ate, rotulo } = useMemo(() => intervaloDoBucket(bucket), [bucket]);
  const [vendas, setVendas] = useState<VendaLista[] | null>(null);
  const [erro, setErro] = useState(false);
  const [ordem, setOrdem] = useState<{ col: Coluna; asc: boolean }>({ col: "data", asc: false }); // mais recentes primeiro
  const [produtosSel, setProdutosSel] = useState<string[]>([]);
  const [situacaoSel, setSituacaoSel] = useState<"todas" | "abertas" | "pagas">("todas");
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<number | null>(null);

  useEffect(() => {
    setVendas(null);
    setErro(false);
    setProdutosSel([]);
    setAberta(null);
    listarVendas({ de, ate, clienteId })
      .then(setVendas)
      .catch(() => setErro(true));
  }, [de, ate, clienteId]);

  // mesmos filtros de vendedor do painel (incluir só os marcados ou excluir os marcados)
  const doPeriodo = useMemo(() => {
    let l = (vendas ?? []).filter((v) => !v.excluido_em);
    if (vendedores.length > 0) {
      l = l.filter((v) => {
        const marcado = v.vendedor !== null && vendedores.includes(v.vendedor);
        return excluirVendedores ? !marcado : marcado;
      });
    }
    return l;
  }, [vendas, vendedores, excluirVendedores]);

  const porProduto = useMemo(() => {
    const m = new Map<string, { kg: number; valor: number; n: number }>();
    for (const v of doPeriodo) {
      const x = m.get(v.produto_nome) ?? { kg: 0, valor: 0, n: 0 };
      x.kg += v.quantidade_kg; x.valor += v.valor_total; x.n += 1;
      m.set(v.produto_nome, x);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].valor - a[1].valor);
  }, [doPeriodo]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const l = doPeriodo.filter((v) =>
      (produtosSel.length === 0 || produtosSel.includes(v.produto_nome)) &&
      (situacaoSel === "todas" || (situacaoSel === "pagas" ? v.situacao === "Pago" : v.situacao !== "Pago")) &&
      (!q || v.cliente_nome.toLowerCase().includes(q) || v.produto_nome.toLowerCase().includes(q) || (v.vendedor ?? "").toLowerCase().includes(q))
    );
    const chave = (v: VendaLista): string | number => {
      switch (ordem.col) {
        case "data": return `${v.data}|${v.criado_em ?? ""}|${String(v.id).padStart(10, "0")}`;
        case "cliente": return v.cliente_nome.toLowerCase();
        case "produto": return v.produto_nome.toLowerCase();
        case "kg": return v.quantidade_kg;
        case "preco": return v.preco_kg;
        case "valor": return v.valor_total;
        case "vendedor": return (v.vendedor ?? "").toLowerCase();
        case "situacao": return v.situacao;
      }
    };
    return [...l].sort((a, b) => {
      const ka = chave(a), kb = chave(b);
      const c = ka < kb ? -1 : ka > kb ? 1 : 0;
      return ordem.asc ? c : -c;
    });
  }, [doPeriodo, produtosSel, situacaoSel, busca, ordem]);

  const tot = useMemo(() => {
    const valor = visiveis.reduce((s, v) => s + v.valor_total, 0);
    const kg = visiveis.reduce((s, v) => s + v.quantidade_kg, 0);
    const recebido = visiveis.reduce((s, v) => s + v.valor_recebido, 0);
    const clientes = new Set(visiveis.map((v) => v.cliente_id ?? `final-${v.cliente_nome}`)).size;
    return { valor, kg, recebido, aberto: valor - recebido, n: visiveis.length, clientes, ticket: visiveis.length ? valor / visiveis.length : 0 };
  }, [visiveis]);

  const ordenados = useMemo(() => [...buckets].sort(), [buckets]);
  const idx = ordenados.indexOf(bucket);
  const anterior = idx > 0 ? ordenados[idx - 1] : null;
  const proximo = idx >= 0 && idx < ordenados.length - 1 ? ordenados[idx + 1] : null;

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
      if (e.key === "ArrowLeft" && anterior) onTrocarBucket(anterior);
      if (e.key === "ArrowRight" && proximo) onTrocarBucket(proximo);
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [anterior, proximo, onFechar, onTrocarBucket]);

  function alternarOrdem(col: Coluna) {
    setOrdem((o) => (o.col === col ? { col, asc: !o.asc } : { col, asc: col === "cliente" || col === "produto" || col === "vendedor" }));
  }

  function exportarCsv() {
    const linhas = [["Data", "Hora", "Cliente", "Produto", "Qtd (un)", "Kg", "R$/kg", "Valor", "Vendedor", "Situação", "Recebido", "Pendente", "Lançado por"]];
    for (const v of visiveis) {
      linhas.push([
        dataBr(v.data), hora(v.criado_em), v.cliente_nome, v.produto_nome, v.quantidade_un?.toString().replace(".", ",") ?? "",
        nf(v.quantidade_kg, 3), nf(v.preco_kg, 2), nf(v.valor_total, 2), v.vendedor ?? "", v.situacao,
        nf(v.valor_recebido, 2), nf(v.valor_pendente, 2), v.criado_por ?? "",
      ]);
    }
    const csv = "﻿" + linhas.map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendas_${de}${de === ate ? "" : `_a_${ate}`}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const chipBase = {
    padding: "6px 11px", borderRadius: 999, border: "1px solid var(--rule-strong)", fontSize: "0.8rem", cursor: "pointer",
    fontWeight: 700 as const,
  };

  return (
    <div
      role="dialog" aria-modal="true"
      onClick={onFechar}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)", borderRadius: 16, width: "100%", maxWidth: 1180, maxHeight: "92vh",
          display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.35)", overflow: "hidden",
        }}
      >
        {/* cabeçalho: período + navegação */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--rule)", flexWrap: "wrap" }}>
          <button type="button" disabled={!anterior} onClick={() => anterior && onTrocarBucket(anterior)} title="Período anterior (←)"
            style={{ ...chipBase, background: "var(--surface)", opacity: anterior ? 1 : 0.35 }}>←</button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", textTransform: "capitalize" }}>Vendas — {rotulo}</div>
            <div style={{ fontSize: "0.74rem", color: "var(--ink-faint)" }}>Mais recentes primeiro · clique no cabeçalho para ordenar · Esc fecha</div>
          </div>
          <button type="button" disabled={!proximo} onClick={() => proximo && onTrocarBucket(proximo)} title="Próximo período (→)"
            style={{ ...chipBase, background: "var(--surface)", opacity: proximo ? 1 : 0.35 }}>→</button>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button type="button" onClick={exportarCsv} disabled={visiveis.length === 0} style={{ ...chipBase, background: "var(--surface)" }}>Exportar CSV</button>
            <button type="button" onClick={onFechar} aria-label="Fechar" style={{ ...chipBase, background: "var(--surface)" }}>Fechar ×</button>
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "14px 18px 18px" }}>
          {erro && <p style={{ color: "var(--crit)" }}>Não foi possível carregar as vendas desse período.</p>}
          {!vendas && !erro && <p>Carregando…</p>}

          {vendas && (
            <>
              {/* resumo */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
                {[
                  ["Faturamento", moeda(tot.valor)], ["Vendas", `${tot.n} (${tot.clientes} ${tot.clientes === 1 ? "cliente" : "clientes"})`],
                  ["Volume", `${nf(tot.kg)} kg`], ["Ticket médio", moeda(tot.ticket)],
                  ["Já recebido", moeda(tot.recebido)], ["A receber", moeda(tot.aberto)],
                ].map(([r, v]) => (
                  <div key={r} style={{ border: "1px solid var(--rule)", borderRadius: 12, padding: "10px 12px" }}>
                    <div style={{ fontSize: "0.68rem", color: "var(--ink-faint)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>{r}</div>
                    <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* filtros interativos: produto (chips com total), situação e busca */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10, alignItems: "center" }}>
                {porProduto.map(([nome, x]) => {
                  const ativo = produtosSel.includes(nome);
                  return (
                    <button key={nome} type="button" title={`${x.n} venda(s) · ${nf(x.kg)} kg`}
                      onClick={() => setProdutosSel((s) => (s.includes(nome) ? s.filter((n) => n !== nome) : [...s, nome]))}
                      style={{ ...chipBase, background: ativo ? "var(--brand)" : "var(--surface)", color: ativo ? "var(--brand-ink)" : "var(--ink-muted)" }}>
                      {nome.replace("Filé de tilápia ", "Filé ").replace("Postas de tilápia ", "Postas ")} · {moeda(x.valor)}
                    </button>
                  );
                })}
                {produtosSel.length > 0 && (
                  <button type="button" onClick={() => setProdutosSel([])} style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, cursor: "pointer" }}>limpar</button>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
                {(["todas", "abertas", "pagas"] as const).map((s) => (
                  <button key={s} type="button" onClick={() => setSituacaoSel(s)}
                    style={{ ...chipBase, background: situacaoSel === s ? "var(--ink)" : "var(--surface)", color: situacaoSel === s ? "var(--surface)" : "var(--ink-muted)" }}>
                    {s === "todas" ? "Todas" : s === "abertas" ? "Em aberto / parcial" : "Pagas"}
                  </button>
                ))}
                <input
                  value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, produto ou vendedor…"
                  style={{ flex: "1 1 220px", minWidth: 200, padding: "8px 11px", borderRadius: 9, border: "1px solid var(--rule-strong)", background: "var(--surface)", font: "inherit" }}
                />
              </div>

              {visiveis.length === 0 ? (
                <p style={{ color: "var(--ink-muted)" }}>Nenhuma venda {doPeriodo.length === 0 ? "nesse período" : "com esses filtros"}.</p>
              ) : (
                <div style={{ overflowX: "auto", border: "1px solid var(--rule)", borderRadius: 12 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
                    <thead>
                      <tr style={{ background: "var(--surface-sunk)" }}>
                        {COLUNAS.map((c) => (
                          <th key={c.id} onClick={() => alternarOrdem(c.id)}
                            style={{ textAlign: c.alinhar ?? "left", padding: "9px 10px", cursor: "pointer", whiteSpace: "nowrap", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--ink-muted)", position: "sticky", top: 0, background: "var(--surface-sunk)" }}>
                            {c.rotulo} {ordem.col === c.id ? (ordem.asc ? "▲" : "▼") : ""}
                          </th>
                        ))}
                        <th style={{ background: "var(--surface-sunk)" }} />
                      </tr>
                    </thead>
                    <tbody>
                      {visiveis.map((v) => {
                        const cor = corSituacao(v.situacao);
                        const expandida = aberta === v.id;
                        return (
                          <Fragment key={v.id}>
                            <tr onClick={() => setAberta(expandida ? null : v.id)} style={{ borderTop: "1px solid var(--rule)", cursor: "pointer", background: expandida ? "var(--ground)" : undefined }}>
                              <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                                {dataBr(v.data)}{v.criado_em ? <span style={{ color: "var(--ink-faint)" }}> · {hora(v.criado_em)}</span> : null}
                              </td>
                              <td style={{ padding: "8px 10px", fontWeight: 600 }}>{v.cliente_nome}</td>
                              <td style={{ padding: "8px 10px" }}>{v.produto_nome}</td>
                              <td style={{ padding: "8px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                                {v.quantidade_un !== null ? `${nf(v.quantidade_un, 0)} un · ` : ""}{nf(v.quantidade_kg)} kg
                              </td>
                              <td style={{ padding: "8px 10px", textAlign: "right", whiteSpace: "nowrap" }}>{moeda(v.preco_kg)}</td>
                              <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 800, whiteSpace: "nowrap" }}>{moeda(v.valor_total)}</td>
                              <td style={{ padding: "8px 10px" }}>{v.vendedor ?? "—"}</td>
                              <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                                <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: "0.7rem", fontWeight: 700, background: cor.bg, color: cor.fg }}>
                                  {v.situacao}{v.situacao !== "Pago" && v.valor_pendente > 0 ? ` · ${moeda(v.valor_pendente)}` : ""}
                                </span>
                              </td>
                              <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                                <Link href={`/lancar/recebimentos?editar=${v.id}`} style={{ color: "var(--brand-deep)", fontWeight: 700, textDecoration: "none" }}>Editar ›</Link>
                              </td>
                            </tr>
                            {expandida && (
                              <tr style={{ background: "var(--ground)" }}>
                                <td colSpan={9} style={{ padding: "6px 14px 12px" }}>
                                  <div style={{ fontSize: "0.78rem", color: "var(--ink-muted)", marginBottom: 6 }}>
                                    {v.criado_por ? `Lançado por ${v.criado_por}` : "Quem lançou: não registrado"}
                                    {v.observacoes ? ` · Obs.: ${v.observacoes}` : ""}
                                  </div>
                                  {v.parcelas.map((p) => (
                                    <div key={p.id} style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: "0.82rem", padding: "3px 0" }}>
                                      <strong>{moeda(p.valor)}</strong>
                                      <span>{p.forma_pgto}</span>
                                      <span>vence {dataBr(p.data_prevista)}</span>
                                      <span style={{ color: p.data_pagamento ? "var(--ok)" : "var(--crit)", fontWeight: 700 }}>
                                        {p.data_pagamento ? `pago em ${dataBr(p.data_pagamento)}` : "em aberto"}
                                      </span>
                                    </div>
                                  ))}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: "2px solid var(--rule-strong)", background: "var(--surface-sunk)", fontWeight: 800 }}>
                        <td colSpan={3} style={{ padding: "9px 10px" }}>Total ({tot.n})</td>
                        <td style={{ padding: "9px 10px", textAlign: "right" }}>{nf(tot.kg)} kg</td>
                        <td style={{ padding: "9px 10px", textAlign: "right" }}>{tot.kg > 0 ? moeda(tot.valor / tot.kg) : "—"}</td>
                        <td style={{ padding: "9px 10px", textAlign: "right" }}>{moeda(tot.valor)}</td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
