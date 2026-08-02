"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { listarClientes, listarVendedoresDeVenda, type Cliente } from "@/lib/api";
import {
  painelComercial,
  painelComercialSerie,
  type ComercialResumo,
  type ComercialSerie,
  type Granularidade,
  type VendaClienteProduto,
} from "@/lib/paineis";
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
function nf(v: number, casas = 0): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatarBucket(b: string): string {
  if (b.length === 4) return b; // ano
  if (b.length === 7) { // mes: YYYY-MM
    const [a, m] = b.split("-");
    return `${m}/${a.slice(2)}`;
  }
  const [, m, d] = b.split("-"); // dia: YYYY-MM-DD
  return `${d}/${m}`;
}
function nomeCurto(nome: string): string {
  return nome.replace("Filé de tilápia ", "Filé ").replace("Postas de tilápia ", "Postas ");
}

const GRANULARIDADES: { valor: Granularidade; rotulo: string }[] = [
  { valor: "dia", rotulo: "Dia" },
  { valor: "mes", rotulo: "Mês" },
  { valor: "ano", rotulo: "Ano" },
];

export default function PainelComercial() {
  const router = useRouter();
  const [de, setDe] = useState(diasAtras(30));
  const [ate, setAte] = useState(hojeISO());
  const [dados, setDados] = useState<ComercialResumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteFiltro, setClienteFiltro] = useState<number | null>(null);
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [vendedorFiltro, setVendedorFiltro] = useState("");
  const [granularidade, setGranularidade] = useState<Granularidade>("mes");
  const [serie, setSerie] = useState<ComercialSerie | null>(null);
  const [comoTabela, setComoTabela] = useState(false);
  const [produtosFiltroCliente, setProdutosFiltroCliente] = useState<number[]>([]);

  useEffect(() => {
    setDados(null);
    painelComercial(de, ate, vendedorFiltro || null)
      .then(setDados)
      .catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }, [de, ate, vendedorFiltro]);

  useEffect(() => {
    listarClientes().then(setClientes).catch(() => undefined);
    listarVendedoresDeVenda().then(setVendedores).catch(() => undefined);
  }, []);

  useEffect(() => {
    setSerie(null);
    painelComercialSerie(granularidade, de, ate, clienteFiltro, vendedorFiltro || null)
      .then(setSerie)
      .catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }, [granularidade, clienteFiltro, vendedorFiltro, de, ate]);

  const produtos = useMemo(() => {
    if (!serie) return [];
    const nomes = new Set<string>();
    serie.buckets.forEach((b) => b.por_produto.forEach((p) => nomes.add(p.produto_nome)));
    return Array.from(nomes).sort();
  }, [serie]);

  const pontosVolume: SeriePonto[] = useMemo(() => {
    if (!serie) return [];
    return serie.buckets.map((b) => ({
      bucket: b.bucket,
      valores: Object.fromEntries(produtos.map((p) => [p, b.por_produto.find((x) => x.produto_nome === p)?.quantidade_kg ?? null])),
    }));
  }, [serie, produtos]);

  const pontosFaturamento: SeriePonto[] = useMemo(() => {
    if (!serie) return [];
    return serie.buckets.map((b) => ({
      bucket: b.bucket,
      valores: Object.fromEntries(produtos.map((p) => [p, b.por_produto.find((x) => x.produto_nome === p)?.valor_total ?? null])),
    }));
  }, [serie, produtos]);

  const pontosPreco: SeriePonto[] = useMemo(() => {
    if (!serie) return [];
    return serie.buckets.map((b) => ({
      bucket: b.bucket,
      valores: Object.fromEntries(produtos.map((p) => [p, b.por_produto.find((x) => x.produto_nome === p)?.preco_medio_ponderado ?? null])),
    }));
  }, [serie, produtos]);

  function toggleProdutoFiltroCliente(produtoId: number) {
    setProdutosFiltroCliente((atual) =>
      atual.includes(produtoId) ? atual.filter((id) => id !== produtoId) : [...atual, produtoId]
    );
  }

  const porClienteFiltrado = useMemo(() => {
    if (!dados || produtosFiltroCliente.length === 0) return [];
    return dados.por_cliente
      .map((c) => {
        const porProduto = produtosFiltroCliente
          .map((pid) => c.por_produto.find((p) => p.produto_id === pid))
          .filter((p): p is VendaClienteProduto => p !== undefined);
        const valorTotal = porProduto.reduce((s, p) => s + p.valor_total, 0);
        return { cliente: c, porProduto, valorTotal };
      })
      .filter((linha) => linha.porProduto.length > 0)
      .sort((a, b) => b.valorTotal - a.valorTotal);
  }, [dados, produtosFiltroCliente]);

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/painel")}>
          ←
        </button>
        <div>
          <h1>Comercial</h1>
          <div className={styles.sub}>Vendas do período</div>
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
          <div className={styles.cards}>
            <div className={styles.card}>
              <div className={styles.cardLabel}>Vendido no período</div>
              <div className={styles.cardValue}>{nf(dados.quantidade_kg_total)} kg</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>Faturado no período</div>
              <div className={styles.cardValue}>{moeda(dados.valor_total)}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>Filé de tilápia vendido</div>
              <div className={styles.cardValue}>{nf(dados.file_kg_total)} kg</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>Preço médio ponderado do filé</div>
              <div className={styles.cardValue}>
                {dados.file_preco_medio_ponderado !== null ? `${moeda(dados.file_preco_medio_ponderado)}/kg` : "—"}
              </div>
            </div>
          </div>
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
            <label>Cliente</label>
            <select
              style={{ padding: "9px 11px", borderRadius: 9, border: "1px solid var(--rule-strong)", background: "var(--surface)", color: "var(--ink)" }}
              value={clienteFiltro ?? ""}
              onChange={(e) => setClienteFiltro(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Todos os clientes</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className={styles.campo}>
            <label>Vendedor</label>
            <select
              style={{ padding: "9px 11px", borderRadius: 9, border: "1px solid var(--rule-strong)", background: "var(--surface)", color: "var(--ink)" }}
              value={vendedorFiltro}
              onChange={(e) => setVendedorFiltro(e.target.value)}
            >
              <option value="">Todos os vendedores</option>
              {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
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

        {serie && serie.buckets.length === 0 && <p className={styles.hint}>Nenhuma venda no período selecionado.</p>}

        {serie && serie.buckets.length > 0 && !comoTabela && (
          <>
            <div className={styles.section}>Volume total vendido por produto (Kg)</div>
            <Chart
              dados={pontosVolume} series={produtos} tipo="barra" modoBarra="empilhada" mostrarTotal
              formatarBucket={formatarBucket} formatarValor={(v) => nf(v)}
            />

            <div className={styles.section}>Faturamento por produto</div>
            <Chart
              dados={pontosFaturamento} series={produtos} tipo="barra" modoBarra="empilhada" mostrarTotal
              formatarBucket={formatarBucket} formatarValor={(v) => moeda(v)}
            />

            <div className={styles.section}>Preço médio ponderado por produto (R$/Kg)</div>
            <Chart dados={pontosPreco} series={produtos} tipo="linha" formatarBucket={formatarBucket} formatarValor={(v) => moeda(v)} />
          </>
        )}

        {serie && serie.buckets.length > 0 && comoTabela && (
          <div className={styles.tableWrap}>
            <table className={styles.tabela}>
              <thead>
                <tr><th>Período</th><th>Produto</th><th>Kg</th><th>Valor</th><th>Preço médio (R$/Kg)</th></tr>
              </thead>
              <tbody>
                {serie.buckets.flatMap((b) =>
                  b.por_produto.map((p) => (
                    <tr key={`${b.bucket}-${p.produto_id}`}>
                      <td>{formatarBucket(b.bucket)}</td>
                      <td>{p.produto_nome}</td>
                      <td>{nf(p.quantidade_kg, 1)}</td>
                      <td>{moeda(p.valor_total)}</td>
                      <td>{p.preco_medio_ponderado !== null ? moeda(p.preco_medio_ponderado) : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {dados && (
          <>
            <div className={styles.section}>Por cliente</div>
            <p className={styles.hint} style={{ margin: "0 0 8px" }}>
              Filtrar por produto pra ver o preço médio ponderado de cada um, por cliente, no período.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {dados.por_produto.map((p) => {
                const ativo = produtosFiltroCliente.includes(p.produto_id);
                return (
                  <button
                    key={p.produto_id}
                    type="button"
                    onClick={() => toggleProdutoFiltroCliente(p.produto_id)}
                    style={{
                      padding: "8px 12px", borderRadius: 9, border: "1px solid var(--rule-strong)",
                      background: ativo ? "var(--brand)" : "var(--surface)",
                      color: ativo ? "var(--brand-ink)" : "var(--ink-muted)",
                      fontWeight: 700, fontSize: "0.82rem", cursor: "pointer",
                    }}
                  >
                    {p.produto_nome}
                  </button>
                );
              })}
            </div>

            {produtosFiltroCliente.length === 0 && (
              <div className={styles.tableWrap}>
                <table className={styles.tabela}>
                  <thead><tr><th>Cliente</th><th>Kg</th><th>Valor</th><th>Preço médio Filé (R$/Kg)</th></tr></thead>
                  <tbody>
                    {dados.por_cliente.map((c) => (
                      <tr key={c.cliente_id ?? "final"}>
                        <td>{c.cliente_nome}</td>
                        <td>{nf(c.quantidade_kg)}</td>
                        <td>{moeda(c.valor_total)}</td>
                        <td>{c.preco_medio_ponderado_file !== null ? moeda(c.preco_medio_ponderado_file) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {produtosFiltroCliente.length > 0 && (
              <div className={styles.tableWrap}>
                <table className={`${styles.tabela} ${styles.tabelaCompacta}`}>
                  <thead>
                    <tr>
                      <th rowSpan={2}>Cliente</th>
                      {produtosFiltroCliente.map((pid) => {
                        const nome = dados.por_produto.find((p) => p.produto_id === pid)?.produto_nome ?? "";
                        return <th key={pid} colSpan={2}>{nomeCurto(nome)}</th>;
                      })}
                      <th rowSpan={2}>Valor total</th>
                    </tr>
                    <tr>
                      {produtosFiltroCliente.map((pid) => (
                        <Fragment key={pid}>
                          <th>Kg</th>
                          <th>R$/Kg</th>
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {porClienteFiltrado.length === 0 && (
                      <tr><td colSpan={2 + produtosFiltroCliente.length * 2}>Nenhum cliente comprou os produtos selecionados nesse período.</td></tr>
                    )}
                    {porClienteFiltrado.map(({ cliente, porProduto, valorTotal }) => (
                      <tr key={cliente.cliente_id ?? "final"}>
                        <td>{cliente.cliente_nome}</td>
                        {produtosFiltroCliente.map((pid) => {
                          const p = porProduto.find((x) => x.produto_id === pid);
                          return (
                            <Fragment key={pid}>
                              <td>{p ? nf(p.quantidade_kg, 1) : "—"}</td>
                              <td>{p ? nf(p.preco_medio_ponderado, 2) : "—"}</td>
                            </Fragment>
                          );
                        })}
                        <td style={{ fontWeight: 700 }}>{moeda(valorTotal)}</td>
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
