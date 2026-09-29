"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  historicoLote, painelAbate, programacaoAbate, salvarMetasAbate,
  type Abate, type HistoricoLote, type ItemDespescaProgramada, type ProgramacaoAbate,
} from "@/lib/paineis";
import Modal from "@/components/Modal";
import Chart, { type SeriePonto } from "@/components/Chart";
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

const FASE_LABEL: Record<string, string> = { pre_engorda: "PE", engorda: "Eng" };

export default function PainelAbate() {
  const router = useRouter();
  const [dados, setDados] = useState<Abate[] | null>(null);
  const [plano, setPlano] = useState<ProgramacaoAbate | null>(null);
  const [metas, setMetas] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarMortalidade, setMostrarMortalidade] = useState(false);
  const [mostrarPorLote, setMostrarPorLote] = useState(false);

  const [tanqueSelecionado, setTanqueSelecionado] = useState<{ viveiro_codigo: string; lote_codigo: string } | null>(null);
  const [historico, setHistorico] = useState<HistoricoLote | null>(null);
  const [erroHistorico, setErroHistorico] = useState<string | null>(null);
  const [loteReal, setLoteReal] = useState<ItemDespescaProgramada | null>(null);

  function abrirLote(viveiroId: number, viveiroCodigo: string, loteCodigo: string) {
    setTanqueSelecionado({ viveiro_codigo: viveiroCodigo, lote_codigo: loteCodigo });
    setHistorico(null);
    setErroHistorico(null);

    // despesca REAL desse lote na programação (com meta, ordem por peso,
    // forçada ou não) — usada como previsão de abate no lugar da simples
    // "quando chega na semana limite", e como horizonte da curva projetada
    const item = plano?.meses.flatMap((m) => m.itens).find(
      (it) => it.viveiro_id === viveiroId && it.lote_codigo === loteCodigo
    ) ?? null;
    setLoteReal(item);

    historicoLote(viveiroId, item?.data_prevista)
      .then(setHistorico)
      .catch(() => setErroHistorico("Sem conexão e sem dado salvo deste aparelho ainda."));
  }
  function fecharLote() {
    setTanqueSelecionado(null);
    setHistorico(null);
    setErroHistorico(null);
    setLoteReal(null);
  }

  const pontosCrescimento: SeriePonto[] = useMemo(() => {
    if (!historico) return [];
    const reais = historico.pontos.map((p) => ({
      bucket: p.data,
      valores: { "Peso real (g)": p.peso_real_g, "Peso esperado (g)": p.peso_esperado_g },
    }));
    const futuros = historico.projecao.map((p) => ({
      bucket: p.data,
      valores: {
        "Peso esperado (g)": p.peso_esperado_g,
        ...(loteReal && p.data === loteReal.data_prevista
          ? { "Despesca prevista (g)": p.peso_esperado_g }
          : {}),
      },
    }));
    return [...reais, ...futuros];
  }, [historico, loteReal]);

  function carregarPlano() {
    programacaoAbate()
      .then((p) => {
        setPlano(p);
        setMetas(p.meses.map((m) => (m.meta_kg > 0 ? String(m.meta_kg).replace(".", ",") : "")));
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

  return (
    <div className={styles.page} style={{ maxWidth: "none" }}>
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
        {!plano && <div className={styles.carregando}>Carregando…</div>}

        {plano && (
          <>
            <button
              type="button" onClick={salvarMetas} disabled={salvando}
              style={{
                float: "right", padding: "9px 16px", borderRadius: 9, border: "none", background: "var(--brand)",
                color: "var(--brand-ink)", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
              }}
            >
              {salvando ? "Salvando…" : "Salvar metas"}
            </button>
            <p className={styles.hint} style={{ margin: "0 0 4px" }}>
              Mostra todo mês em que ainda há peixe ficando pronto para abate — não só os próximos 6. Mês sem meta
              informada não fica parado: despesca tudo que já estiver pronto naquele mês (a meta só entra como teto
              quando você informa um valor).
            </p>

            {plano.meses.map((m, i) => {
              const curto = m.meta_kg > 0 && m.diferenca_kg < -0.5;
              return (
                <div key={m.mes}>
                  <div className={styles.section} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                    <span>{nomeMes(m.mes)}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 400, fontSize: "0.82rem" }}>
                      meta
                      <input
                        type="number" inputMode="decimal" placeholder="0" style={{ width: 90 }}
                        value={metas[i] ?? ""}
                        onChange={(e) => setMetas((atual) => atual.map((v, j) => (j === i ? e.target.value : v)))}
                      />
                      kg
                    </span>
                    <span style={{ fontWeight: 400, fontSize: "0.82rem", color: "var(--ink-muted)" }}>
                      {m.planejado_file_kg !== null
                        ? `planejado ${nf(m.planejado_file_kg)} kg de filé (rendimento médio)`
                        : `planejado ${nf(m.planejado_kg)} kg`}
                    </span>
                    <span style={{ fontWeight: 400, fontSize: "0.82rem", color: "var(--ink-muted)" }}>
                      sobra até o fim do mês {nf(m.sobra_kg)} kg
                    </span>
                    {curto && (
                      <span className={`${styles.badge} ${styles.badgeCrit}`}>
                        faltam {nf(-m.diferenca_kg)} kg
                      </span>
                    )}
                  </div>
                  {m.itens.length === 0 && (
                    <p className={styles.hint}>Nenhum lote pronto para abate nesse mês.</p>
                  )}
                  {m.itens.length > 0 && (
                    <div className={styles.tableWrap} style={{ marginBottom: 18 }}>
                      <table className={`${styles.tabela} ${styles.tabelaCompacta}`}>
                        <thead>
                          <tr>
                            <th>Tanque</th><th>Lote</th><th>Fase</th><th>Saldo (vivos esp.)</th>
                            <th>A despescar</th><th>Peso médio</th><th>Semana</th><th>Kg</th><th>Data</th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.itens.map((it) => (
                            <tr
                              key={`${m.mes}-${it.viveiro_codigo}`}
                              style={{ cursor: "pointer" }}
                              onClick={() => abrirLote(it.viveiro_id, it.viveiro_codigo, it.lote_codigo)}
                            >
                              <td>{it.viveiro_codigo}</td>
                              <td>{it.lote_codigo}</td>
                              <td>{FASE_LABEL[it.fase] ?? it.fase}</td>
                              <td>{nf(it.saldo_atual_un)} ({nf(it.peixes_vivos_esperados)})</td>
                              <td style={{ fontWeight: 700 }}>
                                {nf(it.peixes_a_despescar)}
                                {it.parcial && <span className={`${styles.badge} ${styles.badgeWarn}`} style={{ marginLeft: 4 }}>parcial</span>}
                              </td>
                              <td>
                                {nf(it.peso_medio_esperado_g)} g
                                {it.abaixo_peso_ideal && (
                                  <span
                                    className={`${styles.badge} ${styles.badgeCrit}`}
                                    style={{ marginLeft: 4 }}
                                    title={`Peso ideal de abate: ${nf(plano.peso_ideal_abate_g)} g`}
                                  >
                                    abaixo do peso ideal
                                  </span>
                                )}
                              </td>
                              <td>{it.semana_abate}</td>
                              <td>{nf(it.kg_esperado)} kg</td>
                              <td>{dataBr(it.data_prevista)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}

            {plano.nao_alocados.length > 0 && (
              <>
                <div className={styles.section}>Sobra no fim do horizonte, lote a lote</div>
                <div className={styles.tableWrap} style={{ marginBottom: 18 }}>
                  <table className={`${styles.tabela} ${styles.tabelaCompacta}`}>
                    <thead>
                      <tr>
                        <th>Tanque</th><th>Lote</th><th>Peixes restantes</th>
                        <th>Peso médio no fim do horizonte</th><th>Kg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plano.nao_alocados.map((n) => (
                        <tr
                          key={n.viveiro_codigo}
                          style={{ cursor: "pointer" }}
                          onClick={() => abrirLote(n.viveiro_id, n.viveiro_codigo, n.lote_codigo)}
                        >
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
                      <div className={styles.cardLabel}>Mortalidade considerada — {m.fase === "pre_engorda" ? "Pré-engorda" : "Engorda"}</div>
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
              <table className={`${styles.tabela} ${styles.tabelaCompacta}`}>
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

      {tanqueSelecionado && (
        <Modal
          titulo={`Tanque ${tanqueSelecionado.viveiro_codigo} — lote ${tanqueSelecionado.lote_codigo}`}
          subtitulo="Origem, povoamento e previsão de abate"
          onFechar={fecharLote}
        >
          {erroHistorico && <div className={styles.erro}>{erroHistorico}</div>}
          {!historico && !erroHistorico && <div className={styles.carregando}>Carregando…</div>}

          {historico && (
            <>
              <div className={styles.linha}>
                <span className={styles.k}>Origem</span>
                <span className={styles.v}>{historico.origem}</span>
              </div>
              <div className={styles.linha}>
                <span className={styles.k}>Data de povoamento</span>
                <span className={styles.v}>{dataBr(historico.data_povoamento)}</span>
              </div>
              <div className={styles.linha}>
                <span className={styles.k}>Entrada nesse tanque</span>
                <span className={styles.v}>{dataBr(historico.data_inicio)}</span>
              </div>
              {historico.pontos.length > 0 && (
                <div className={styles.linha}>
                  <span className={styles.k}>Última biometria</span>
                  <span className={styles.v}>
                    {nf(historico.pontos[historico.pontos.length - 1].peso_real_g)} g em{" "}
                    {dataBr(historico.pontos[historico.pontos.length - 1].data)}
                  </span>
                </div>
              )}
              <div className={styles.linha}>
                <span className={styles.k}>Previsão de abate</span>
                <span className={styles.v}>
                  {loteReal ? (
                    <>
                      {dataBr(loteReal.data_prevista)} · {nf(loteReal.peso_medio_esperado_g)} g (semana {loteReal.semana_abate})
                      {loteReal.abaixo_peso_ideal && (
                        <span className={`${styles.badge} ${styles.badgeCrit}`} style={{ marginLeft: 6 }}>
                          abaixo do peso ideal
                        </span>
                      )}
                    </>
                  ) : historico.pronto_para_abate ? (
                    <span className={`${styles.badge} ${styles.badgeCrit}`}>PRONTO PARA ABATE</span>
                  ) : (
                    <span className={`${styles.badge} ${styles.badgeNeutro}`}>
                      {historico.previsao_abate ? dataBr(historico.previsao_abate) : "sem previsão dentro do horizonte"}
                    </span>
                  )}
                </span>
              </div>

              <div className={styles.section} style={{ marginTop: 16 }}>Curva de crescimento — real e projetada</div>
              <p className={styles.hint}>
                Linha do peso real medido em cada biometria, esperado pela curva desde a entrada nesse tanque, e a
                projeção a partir de hoje ancorada na última biometria, até o peso máximo da curva.
                {loteReal && ` A despesca prevista (${dataBr(loteReal.data_prevista)}) está marcada no gráfico e na tabela abaixo.`}
              </p>
              <Chart
                dados={pontosCrescimento}
                series={loteReal ? ["Peso real (g)", "Peso esperado (g)", "Despesca prevista (g)"] : ["Peso real (g)", "Peso esperado (g)"]}
                tipo="linha"
                formatarBucket={dataBr} formatarValor={(v) => `${nf(v, 0)} g`}
              />

              <div className={styles.section} style={{ marginTop: 16 }}>Biometrias</div>
              <div className={styles.tableWrap}>
                <table className={styles.tabela}>
                  <thead>
                    <tr>
                      <th>Data</th><th>Peso real</th><th>Peso esperado</th><th>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historico.pontos.map((p, i) => (
                      <tr key={i}>
                        <td>{dataBr(p.data)}</td>
                        <td>{nf(p.peso_real_g, 1)} g</td>
                        <td>{nf(p.peso_esperado_g, 1)} g</td>
                        <td>{nf(p.saldo_un)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.section} style={{ marginTop: 16 }}>Projeção semana a semana</div>
              <div className={styles.tableWrap}>
                <table className={styles.tabela}>
                  <thead>
                    <tr>
                      <th>Data</th><th>Semana</th><th>Peso esperado</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {historico.projecao.map((p, i) => {
                      const ehAbate = loteReal && p.data === loteReal.data_prevista;
                      return (
                        <tr key={i} style={ehAbate ? { fontWeight: 700 } : undefined}>
                          <td>{dataBr(p.data)}</td>
                          <td>{p.semana}</td>
                          <td>{nf(p.peso_esperado_g, 1)} g</td>
                          <td>
                            {ehAbate && <span className={`${styles.badge} ${styles.badgeCrit}`}>despesca prevista</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Modal>
      )}

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
