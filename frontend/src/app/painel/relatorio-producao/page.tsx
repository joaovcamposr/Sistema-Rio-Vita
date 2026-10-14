"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { relatorioProducaoDiario, type RelatorioProducaoDiario } from "@/lib/paineis";
import styles from "../painel.module.css";

function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
function kg(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export default function RelatorioProducaoDiario() {
  const router = useRouter();
  const [data, setData] = useState(hojeISO());
  const [rel, setRel] = useState<RelatorioProducaoDiario | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setRel(null);
    setErro(null);
    relatorioProducaoDiario(data).then(setRel).catch(() => setErro("Não foi possível carregar o relatório."));
  }, [data]);

  const grupo = (cat: string) => (rel?.produtos ?? []).filter((p) => p.categoria === cat);
  const qtd = (turno: "manha" | "tarde" | "dia", pid: number) => rel?.[turno].por_produto[String(pid)] ?? 0;
  const cols = [["manha", "Manhã"], ["tarde", "Tarde"], ["dia", "Total do dia"]] as const;
  const th = { textAlign: "right" as const };
  const negrito = { fontWeight: 800, background: "var(--ground)" };

  function linhaProduto(p: { produto_id: number; nome: string; codigo_barras: string | null }) {
    return (
      <tr key={p.produto_id}>
        <td>
          {p.nome}
          {p.codigo_barras && (
            <span style={{ display: "block", fontSize: "0.7rem", color: "var(--ink-muted)", letterSpacing: "0.04em" }}>
              Cód. barras {p.codigo_barras}
            </span>
          )}
        </td>
        {cols.map(([k]) => <td key={k} style={th}>{kg(qtd(k, p.produto_id))}</td>)}
      </tr>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/painel/producao")}>←</button>
        <div>
          <h1>Relatório diário de produção</h1>
          <div className={styles.sub}>Tilápia suja, filé, rendimento e resíduos — {dataBr(data)}</div>
        </div>
      </div>
      <div className={styles.body}>
        <div className={styles.filtros} style={{ marginBottom: 14 }}>
          <div className={styles.campo}>
            <label>Data</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <button
            type="button" className={styles.printBtn} onClick={() => window.print()}
            style={{ padding: "9px 16px", borderRadius: 9, border: "1px solid var(--rule-strong)", background: "var(--surface)", fontWeight: 700, cursor: "pointer" }}
          >
            Imprimir
          </button>
        </div>

        {erro && <div className={styles.erro}>{erro}</div>}
        {!rel && !erro && <div className={styles.carregando}>Carregando…</div>}

        {rel && (
          <>
            {rel.produtos.length === 0 && <p className={styles.hint}>Nenhuma produção lançada nesse dia.</p>}
            {rel.produtos.length > 0 && (
              <div className={styles.tableWrap}>
                <table className={styles.tabela}>
                  <thead>
                    <tr>
                      <th>Item (kg)</th>
                      {cols.map(([k, r]) => <th key={k} style={th}>{r}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={negrito}>
                      <td>Tilápia suja utilizada</td>
                      {cols.map(([k]) => <td key={k} style={th}>{kg(rel[k].suja_kg)}</td>)}
                    </tr>

                    {grupo("file").map(linhaProduto)}
                    <tr style={negrito}>
                      <td>Total de filé produzido</td>
                      {cols.map(([k]) => <td key={k} style={th}>{kg(rel[k].total_file_kg)}</td>)}
                    </tr>
                    <tr>
                      <td>Rendimento (filé ÷ suja)</td>
                      {cols.map(([k]) => <td key={k} style={th}>{pct(rel[k].rendimento)}</td>)}
                    </tr>

                    {(grupo("subproduto").length > 0 || grupo("outro_tilapia").length > 0) && (
                      <>
                        <tr><td colSpan={4} style={{ fontWeight: 700, color: "var(--ink-muted)", paddingTop: 12 }}>Subprodutos e outros produtos da tilápia</td></tr>
                        {[...grupo("subproduto"), ...grupo("outro_tilapia")].map(linhaProduto)}
                      </>
                    )}

                    <tr style={negrito}>
                      <td>Total de produtos (filé + subprodutos)</td>
                      {cols.map(([k]) => <td key={k} style={th}>{kg(rel[k].total_produtos_tilapia_kg)}</td>)}
                    </tr>
                    <tr style={{ ...negrito, color: "var(--crit)" }}>
                      <td>Resíduos estimados (suja − produtos)</td>
                      {cols.map(([k]) => <td key={k} style={th}>{kg(rel[k].residuo_kg)}</td>)}
                    </tr>

                    {grupo("fora").filter((p) => p.nome.startsWith("Tambaqui")).length > 0 && (
                      <Fragment>
                        <tr><td colSpan={4} style={{ fontWeight: 700, color: "var(--ink-muted)", paddingTop: 12 }}>Outra espécie (não entra no resíduo da tilápia)</td></tr>
                        {grupo("fora").filter((p) => p.nome.startsWith("Tambaqui")).map(linhaProduto)}
                      </Fragment>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <p className={styles.hint}>
              Tilápia suja do dia = filé de cada lançamento ÷ rendimento do lote/despesca dele; cada turno usa metade do dia.
              Resíduo = suja − todos os produtos tirados dela (filé, subprodutos, postas e tilápia limpa). Lançamento sem turno
              é dividido meio a meio entre manhã e tarde.
            </p>
            {rel.avisos.map((a, i) => (
              <p key={i} className={styles.hint} style={{ color: "var(--warn)", display: "block" }}>⚠ {a}</p>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
