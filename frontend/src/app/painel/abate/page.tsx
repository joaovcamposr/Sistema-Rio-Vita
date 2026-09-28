"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  painelAbate, programacaoAbate, salvarMetasAbate,
  type Abate, type ProgramacaoAbate,
} from "@/lib/paineis";
import styles from "../painel.module.css";

function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
function nf(v: number, casas = 0): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function pct(v: number): string {
  return `${nf(v * 100, 1)}%`;
}
function nomeMes(iso: string): string {
  const nome = new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

const FASE_LABEL: Record<string, string> = { pre_engorda: "Pré-engorda", engorda: "Engorda" };

export default function PainelAbate() {
  const router = useRouter();
  const [dados, setDados] = useState<Abate[] | null>(null);
  const [plano, setPlano] = useState<ProgramacaoAbate | null>(null);
  const [metas, setMetas] = useState<string[]>([]);
  const [mesSelecionado, setMesSelecionado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarMortalidade, setMostrarMortalidade] = useState(false);
  const [mostrarPorLote, setMostrarPorLote] = useState(false);

  function carregarPlano() {
    programacaoAbate()
      .then((p) => {
        setPlano(p);
        setMetas(p.meses.map((m) => (m.meta_kg > 0 ? String(m.meta_kg).replace(".", ",") : "")));
        setMesSelecionado((atual) => atual ?? p.meses[0]?.mes ?? null);
      })
      .catch(() => undefined);
  }

  useEffect(() => {
    painelAbate().then(setDados).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
    carregarPlano();
  }, []);

  async function salvarMetas() {
    if (!plano) return;
    setSalvando(true);
    try {
      await salvarMetasAbate(
        plano.meses.map((m, i) => ({ mes: m.mes, kg: parseFloat(metas[i].replace(",", ".")) || 0 }))
      );
      setToast("Metas salvas");
      carregarPlano();
    } catch {
      setToast("Não foi possível salvar — verifique a conexão");
    } finally {
      setSalvando(false);
      setTimeout(() => setToast(null), 2500);
    }
  }

  const prontos = dados?.filter((a) => a.pronto).length ?? 0;
  const mes = plano?.meses.find((m) => m.mes === mesSelecionado) ?? null;

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/painel")}>
          ←
        </button>
        <div>
          <h1>Programação de abate</h1>
          <div className={styles.sub}>Metas de Kg abatido por mês e o que despescar de cada tanque</div>
        </div>
      </div>
      <div className={styles.body}>
        {erro && <div className={styles.erro}>{erro}</div>}

        <div className={styles.section} style={{ marginTop: 0 }}>Meta por mês (Kg de peixe despescado)</div>
        {!plano && <div className={styles.carregando}>Carregando…</div>}
        {plano && (
          <>
            <p className={styles.hint} style={{ margin: "0 0 10px" }}>
              Clique num mês pra ver o detalhe por tanque logo abaixo.
            </p>
            <div className={styles.cards}>
              {plano.meses.map((m, i) => {
                const curto = m.meta_kg > 0 && m.diferenca_kg < -0.5;
                const ativo = mesSelecionado === m.mes;
                return (
                  <button
                    key={m.mes}
                    type="button"
                    onClick={() => setMesSelecionado(m.mes)}
                    className={styles.card}
                    style={{
                      textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit",
                      border: ativo ? "2px solid var(--brand)" : undefined,
                    }}
                  >
                    <div className={styles.cardLabel}>{nomeMes(m.mes)}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "4px 0" }}>
                      <input
                        type="number" inputMode="decimal" placeholder="0" style={{ width: 100 }}
                        value={metas[i] ?? ""}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setMetas((atual) => atual.map((v, j) => (j === i ? e.target.value : v)))}
                      />
                      <span className={styles.cardSub} style={{ margin: 0 }}>kg meta</span>
                    </div>
                    <div className={styles.cardSub}>
                      Planejado: {nf(m.planejado_kg)} kg
                      {curto && (
                        <span className={`${styles.badge} ${styles.badgeCrit}`} style={{ marginLeft: 6 }}>
                          faltam {nf(-m.diferenca_kg)} kg
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div style={{ margin: "12px 0 24px" }}>
              <button
                type="button" onClick={salvarMetas} disabled={salvando}
                style={{
                  padding: "9px 16px", borderRadius: 9, border: "none", background: "var(--brand)",
                  color: "var(--brand-ink)", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
                }}
              >
                {salvando ? "Salvando…" : "Salvar metas"}
              </button>
            </div>

            {mes && (
              <>
                <div className={styles.section}>
                  {nomeMes(mes.mes)} — o que despescar
                </div>
                {mes.itens.length === 0 && (
                  <p className={styles.hint}>{mes.meta_kg > 0 ? "Nenhum lote pronto para abate nesse mês." : "Sem meta informada."}</p>
                )}
                {mes.itens.length > 0 && (
                  <div className={styles.tableWrap} style={{ marginBottom: 18 }}>
                    <table className={styles.tabela}>
                      <thead>
                        <tr>
                          <th>Tanque</th><th>Lote</th><th>Fase hoje</th><th>Saldo no sistema</th>
                          <th>Vivos esperados</th><th>Peixes a despescar</th><th>Peso médio esperado</th>
                          <th>Kg esperados</th><th>Data prevista</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mes.itens.map((it) => (
                          <tr key={`${mes.mes}-${it.viveiro_codigo}`}>
                            <td>{it.viveiro_codigo}</td>
                            <td>{it.lote_codigo}</td>
                            <td>{FASE_LABEL[it.fase] ?? it.fase}</td>
                            <td>{nf(it.saldo_atual_un)}</td>
                            <td>{nf(it.peixes_vivos_esperados)}</td>
                            <td style={{ fontWeight: 700 }}>
                              {nf(it.peixes_a_despescar)}
                              {it.parcial && <span className={`${styles.badge} ${styles.badgeWarn}`} style={{ marginLeft: 6 }}>parcial</span>}
                            </td>
                            <td>{nf(it.peso_medio_esperado_g)} g</td>
                            <td>{nf(it.kg_esperado)} kg</td>
                            <td>{dataBr(it.data_prevista)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {plano.nao_alocados.length > 0 && (
              <>
                <div className={styles.section}>Sobra dentro dos 6 meses (prontos, mas fora das metas)</div>
                <div className={styles.tableWrap} style={{ marginBottom: 18 }}>
                  <table className={styles.tabela}>
                    <thead>
                      <tr>
                        <th>Tanque</th><th>Lote</th><th>Peixes restantes</th>
                        <th>Peso médio no fim do horizonte</th><th>Kg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plano.nao_alocados.map((n) => (
                        <tr key={n.viveiro_codigo}>
                          <td>{n.viveiro_codigo}</td>
                          <td>{n.lote_codigo}</td>
                          <td>{nf(n.peixes_restantes)}</td>
                          <td>{nf(n.peso_medio_fim_horizonte_g)} g</td>
                          <td>{nf(n.kg_fim_horizonte)} kg</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <button
              type="button"
              onClick={() => setMostrarMortalidade((v) => !v)}
              style={{ background: "none", border: "none", padding: 0, marginBottom: 10, color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer" }}
            >
              {mostrarMortalidade ? "▾" : "▸"} Como a mortalidade é considerada
            </button>
            {mostrarMortalidade && (
              <>
                <div className={styles.cards} style={{ marginBottom: 10 }}>
                  {plano.mortalidade.map((m) => (
                    <div key={m.fase} className={styles.card}>
                      <div className={styles.cardLabel}>Mortalidade considerada — {FASE_LABEL[m.fase]}</div>
                      <div className={styles.cardValue}>{pct(m.taxa_considerada)}</div>
                      <div className={styles.cardSub}>{m.fonte}</div>
                    </div>
                  ))}
                </div>
                <p className={styles.hint}>
                  O saldo dos tanques só perde peixe quando o lote fecha, então a mortalidade que ainda não foi
                  lançada é descontada por essas taxas (lote hoje em pré-engorda sofre as duas até o abate). O peso
                  esperado vem da curva de crescimento, a partir do peso estimado de hoje, com o crescimento 1 semana
                  mais lento que a curva. Considera só os lotes ativos hoje — não inclui novos povoamentos. Lote de
                  pré-engorda aparece pelo tanque onde está hoje; até o abate ele será repicado.
                </p>
              </>
            )}
          </>
        )}

        <button
          type="button"
          onClick={() => setMostrarPorLote((v) => !v)}
          style={{ background: "none", border: "none", padding: 0, margin: "22px 0 10px", color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer" }}
        >
          {mostrarPorLote ? "▾" : "▸"} Previsão por lote, sem cruzar com a meta (referência)
        </button>
        {mostrarPorLote && !dados && !erro && <div className={styles.carregando}>Carregando…</div>}
        {mostrarPorLote && dados && (
          <>
            <div className={styles.cards}>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Lotes ativos</div>
                <div className={styles.cardValue}>{dados.length}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Prontos para abate</div>
                <div className={styles.cardValue}>{prontos}</div>
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.tabela}>
                <thead>
                  <tr>
                    <th>Viveiro</th>
                    <th>Lote</th>
                    <th>Fase</th>
                    <th>Qtd. (un)</th>
                    <th>Última biometria</th>
                    <th>Semana atual / limite</th>
                    <th>Previsão</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.map((a) => (
                    <tr key={a.lote_id}>
                      <td>{a.viveiro_codigo}</td>
                      <td>{a.lote_codigo}</td>
                      <td>{a.fase === "pre_engorda" ? "Pré-engorda" : "Engorda"}</td>
                      <td>{a.quantidade_un.toLocaleString("pt-BR")}</td>
                      <td>{a.peso_medio_g} g ({dataBr(a.data_biometria)})</td>
                      <td>{a.semana_atual} / {a.semana_limite}</td>
                      <td>
                        {a.pronto ? (
                          <span className={`${styles.badge} ${styles.badgeCrit}`}>PRONTO PARA ABATE</span>
                        ) : (
                          <span className={`${styles.badge} ${styles.badgeNeutro}`}>
                            {a.previsao_abate ? dataBr(a.previsao_abate) : "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
