"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { painelProducao, painelProducaoSerie, type Granularidade, type ProducaoResumo, type ProducaoSerie } from "@/lib/paineis";
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

export default function PainelProducao() {
  const router = useRouter();
  const [de, setDe] = useState(diasAtras(30));
  const [ate, setAte] = useState(hojeISO());
  const [dados, setDados] = useState<ProducaoResumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [granularidade, setGranularidade] = useState<Granularidade>("mes");
  const [serie, setSerie] = useState<ProducaoSerie | null>(null);
  const [comoTabela, setComoTabela] = useState(false);

  useEffect(() => {
    setDados(null);
    painelProducao(de, ate).then(setDados).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }, [de, ate]);

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
              formatarBucket={formatarBucket} formatarValor={(v) => nf(v, 0)}
            />

            <div className={styles.section}>Rendimento médio ponderado de Filé (%)</div>
            <p className={styles.hint}>Medido por lote despescado — não se separa por embalagem de produto final.</p>
            <Chart dados={pontosRendimento} series={["Rendimento (%)"]} tipo="linha" formatarBucket={formatarBucket} formatarValor={(v) => `${nf(v)}%`} />

            <div className={styles.section}>Peso sujo médio (g)</div>
            <Chart dados={pontosPesoSujo} series={["Peso sujo médio (g)"]} tipo="linha" formatarBucket={formatarBucket} formatarValor={(v) => `${nf(v)} g`} />
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
      </div>
    </div>
  );
}
