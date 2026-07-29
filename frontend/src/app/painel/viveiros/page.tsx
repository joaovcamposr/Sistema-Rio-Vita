"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  atualizarParametro, historicoLote, listarParametros, painelViveiros,
  type HistoricoLote, type PainelViveiro, type Parametro,
} from "@/lib/paineis";
import { atualizarViveiroAtivo, listarViveirosTodos, type ViveiroAtivo } from "@/lib/api";
import Modal from "@/components/Modal";
import Chart, { type SeriePonto } from "@/components/Chart";
import styles from "../painel.module.css";

function nf(v: number, casas = 1): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function dataBr(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

// mesmas faixas já mostradas como dica na tela de lançamento de Análise da água
function badgeOxigenio(v: number | null) {
  if (v === null) return null;
  return v > 4 ? styles.badgeOk : styles.badgeCrit;
}
function badgeAmonia(v: number | null) {
  if (v === null) return null;
  return v < 1 ? styles.badgeOk : styles.badgeCrit;
}
function badgePh(v: number | null) {
  if (v === null) return null;
  return v >= 6 && v <= 8 ? styles.badgeOk : styles.badgeWarn;
}
function badgeCrescimento(cor: string | null) {
  if (cor === "verde") return styles.badgeOk;
  if (cor === "amarelo") return styles.badgeWarn;
  if (cor === "vermelho") return styles.badgeCrit;
  return styles.badgeNeutro;
}

const TIPO_LABEL: Record<string, string> = {
  pre_engorda: "Pré-engorda",
  engorda: "Engorda",
  decantacao: "Decantação",
};

export default function PainelViveiros() {
  const router = useRouter();
  const [dados, setDados] = useState<PainelViveiro[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [limitePreEngorda, setLimitePreEngorda] = useState<Parametro | null>(null);
  const [limitePreEngordaEditando, setLimitePreEngordaEditando] = useState("");
  const [salvandoLimitePreEngorda, setSalvandoLimitePreEngorda] = useState(false);
  const [limiteEngorda, setLimiteEngorda] = useState<Parametro | null>(null);
  const [limiteEngordaEditando, setLimiteEngordaEditando] = useState("");
  const [salvandoLimiteEngorda, setSalvandoLimiteEngorda] = useState(false);

  const [viveirosTodos, setViveirosTodos] = useState<ViveiroAtivo[] | null>(null);
  const [mostrarSelecao, setMostrarSelecao] = useState(false);
  const [salvandoAtivoId, setSalvandoAtivoId] = useState<number | null>(null);

  const [viveiroSelecionado, setViveiroSelecionado] = useState<PainelViveiro | null>(null);
  const [historico, setHistorico] = useState<HistoricoLote | null>(null);
  const [erroHistorico, setErroHistorico] = useState<string | null>(null);

  function abrirHistorico(v: PainelViveiro) {
    setViveiroSelecionado(v);
    setHistorico(null);
    setErroHistorico(null);
    historicoLote(v.id).then(setHistorico).catch(() => setErroHistorico("Sem conexão e sem dado salvo deste aparelho ainda."));
  }
  function fecharHistorico() {
    setViveiroSelecionado(null);
    setHistorico(null);
    setErroHistorico(null);
  }

  function recarregarPainel() {
    painelViveiros().then(setDados).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }

  useEffect(() => {
    recarregarPainel();
    listarParametros().then((ps) => {
      const pre = ps.find((p) => p.chave === "limite_densidade_pre_engorda_kg_m2") ?? null;
      setLimitePreEngorda(pre);
      if (pre) setLimitePreEngordaEditando(String(pre.valor));
      const eng = ps.find((p) => p.chave === "limite_densidade_engorda_kg_m2") ?? null;
      setLimiteEngorda(eng);
      if (eng) setLimiteEngordaEditando(String(eng.valor));
    }).catch(() => undefined);
    listarViveirosTodos().then(setViveirosTodos).catch(() => undefined);
  }, []);

  async function salvarLimitePreEngorda() {
    const valor = parseFloat(limitePreEngordaEditando.replace(",", "."));
    if (!(valor > 0)) return;
    setSalvandoLimitePreEngorda(true);
    try {
      const atualizado = await atualizarParametro("limite_densidade_pre_engorda_kg_m2", valor);
      setLimitePreEngorda(atualizado);
    } catch {
      setErro("Não foi possível salvar o limite — verifique a conexão.");
    } finally {
      setSalvandoLimitePreEngorda(false);
    }
  }

  async function salvarLimiteEngorda() {
    const valor = parseFloat(limiteEngordaEditando.replace(",", "."));
    if (!(valor > 0)) return;
    setSalvandoLimiteEngorda(true);
    try {
      const atualizado = await atualizarParametro("limite_densidade_engorda_kg_m2", valor);
      setLimiteEngorda(atualizado);
    } catch {
      setErro("Não foi possível salvar o limite — verifique a conexão.");
    } finally {
      setSalvandoLimiteEngorda(false);
    }
  }

  async function alternarAtivo(v: ViveiroAtivo) {
    setSalvandoAtivoId(v.id);
    try {
      const atualizado = await atualizarViveiroAtivo(v.id, !v.ativo);
      setViveirosTodos((atual) => atual?.map((x) => (x.id === v.id ? atualizado : x)) ?? atual);
      recarregarPainel();
    } catch {
      setErro("Não foi possível atualizar o viveiro — verifique a conexão.");
    } finally {
      setSalvandoAtivoId(null);
    }
  }

  const pontosPeso: SeriePonto[] = useMemo(() => {
    if (!historico) return [];
    return historico.pontos.map((p) => ({
      bucket: p.data,
      valores: { "Peso real (g)": p.peso_real_g, "Peso esperado (g)": p.peso_esperado_g },
    }));
  }, [historico]);

  const pontosConversao: SeriePonto[] = useMemo(() => {
    if (!historico) return [];
    return historico.pontos.map((p) => ({
      bucket: p.data,
      valores: {
        "Conversão realizada": p.conversao_realizada_intervalo,
        "Conversão esperada": p.conversao_esperada_intervalo,
      },
    }));
  }, [historico]);

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/painel")}>
          ←
        </button>
        <div>
          <h1>Painel do viveiro</h1>
          <div className={styles.sub}>{dados ? `${dados.length} viveiros` : "carregando…"}</div>
        </div>
      </div>
      <div className={styles.body}>
        {erro && <div className={styles.erro}>{erro}</div>}

        <div className={styles.filtros}>
          <div className={styles.campo}>
            <label>Limite de densidade — Pré-engorda (Kg de biomassa/m²)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number" inputMode="decimal" value={limitePreEngordaEditando}
                onChange={(e) => setLimitePreEngordaEditando(e.target.value)}
                style={{ width: 90, padding: "9px 11px", borderRadius: 9, border: "1px solid var(--rule-strong)", background: "var(--surface)", color: "var(--ink)" }}
              />
              <button
                type="button" onClick={salvarLimitePreEngorda} disabled={salvandoLimitePreEngorda}
                style={{ padding: "9px 14px", borderRadius: 9, border: "1px solid var(--rule-strong)", background: "var(--brand)", color: "var(--brand-ink)", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}
              >
                {salvandoLimitePreEngorda ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
          <div className={styles.campo}>
            <label>Limite de densidade — Engorda (Kg de biomassa/m²)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number" inputMode="decimal" value={limiteEngordaEditando}
                onChange={(e) => setLimiteEngordaEditando(e.target.value)}
                style={{ width: 90, padding: "9px 11px", borderRadius: 9, border: "1px solid var(--rule-strong)", background: "var(--surface)", color: "var(--ink)" }}
              />
              <button
                type="button" onClick={salvarLimiteEngorda} disabled={salvandoLimiteEngorda}
                style={{ padding: "9px 14px", borderRadius: 9, border: "1px solid var(--rule-strong)", background: "var(--brand)", color: "var(--brand-ink)", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}
              >
                {salvandoLimiteEngorda ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMostrarSelecao((v) => !v)}
          style={{
            background: "none", border: "none", padding: 0, marginBottom: 10,
            color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
          }}
        >
          {mostrarSelecao ? "▾" : "▸"} Selecionar viveiros ativos
        </button>
        {mostrarSelecao && viveirosTodos && (
          <div className={styles.tableWrap} style={{ padding: 14, marginBottom: 18 }}>
            <p className={styles.hint} style={{ margin: "0 0 10px" }}>
              Viveiros desmarcados somem do painel abaixo e não recebem sugestão de repicagem no Dashboard.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px" }}>
              {viveirosTodos.map((v) => (
                <label
                  key={v.id}
                  style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.86rem", cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={v.ativo}
                    disabled={salvandoAtivoId === v.id}
                    onChange={() => alternarAtivo(v)}
                  />
                  {v.tipo === "decantacao" ? v.codigo : `Viveiro ${v.codigo}`}
                </label>
              ))}
            </div>
          </div>
        )}

        {!dados && !erro && <div className={styles.carregando}>Carregando…</div>}
        {dados && (
          <div className={styles.grid}>
            {dados.map((v) => {
              const limite = v.tipo === "pre_engorda" ? limitePreEngorda : v.tipo === "engorda" ? limiteEngorda : null;
              const densidadeAlerta = limite && v.densidade_kg_m2 !== null && v.densidade_kg_m2 >= limite.valor * 0.9;
              const densidadeAcima = limite && v.densidade_kg_m2 !== null && v.densidade_kg_m2 >= limite.valor;
              return (
                <div
                  key={v.id}
                  className={styles.pond}
                  style={v.lote_atual ? { cursor: "pointer" } : undefined}
                  onClick={v.lote_atual ? () => abrirHistorico(v) : undefined}
                >
                  <div className={styles.pondHead}>
                    <span className={styles.pondNome}>{v.tipo === "decantacao" ? v.codigo : `Viveiro ${v.codigo}`}</span>
                    <span className={styles.pondTipo}>{TIPO_LABEL[v.tipo]}</span>
                  </div>

                  {!v.lote_atual && v.tipo !== "decantacao" && (
                    <div className={styles.pondVazio}>Sem lote ativo</div>
                  )}
                  {v.tipo === "decantacao" && <div className={styles.pondVazio}>Sem cultivo</div>}

                  {v.lote_atual && (
                    <>
                      <div className={styles.linha}>
                        <span className={styles.k}>Lote</span>
                        <span className={styles.v}>{v.lote_atual.codigo}</span>
                      </div>
                      <div className={styles.linha}>
                        <span className={styles.k}>Idade</span>
                        <span className={styles.v}>Semana {v.idade_semanas} · {v.idade_dias}d</span>
                      </div>
                      <div className={styles.linha}>
                        <span className={styles.k}>Saldo</span>
                        <span className={styles.v}>{v.lote_atual.saldo_un.toLocaleString("pt-BR")} un</span>
                      </div>
                      {v.peso_estimado_hoje_g !== null && (
                        <div className={styles.linha}>
                          <span className={styles.k}>Peso estimado hoje</span>
                          <span className={styles.v}>
                            <span className={`${styles.badge} ${badgeCrescimento(v.cor_crescimento)}`}>
                              {nf(v.peso_estimado_hoje_g)} g
                            </span>
                          </span>
                        </div>
                      )}
                      {v.peso_esperado_pela_idade_g !== null && (
                        <div className={styles.linha}>
                          <span className={styles.k}>Peso esperado p/ idade</span>
                          <span className={styles.v}>{nf(v.peso_esperado_pela_idade_g)} g</span>
                        </div>
                      )}
                      {v.densidade_kg_m2 !== null && (
                        <div className={styles.linha}>
                          <span className={styles.k}>Densidade</span>
                          <span className={styles.v}>
                            {densidadeAlerta ? (
                              <span className={`${styles.badge} ${densidadeAcima ? styles.badgeCrit : styles.badgeWarn}`}>
                                {nf(v.densidade_kg_m2, 2)} kg/m²
                              </span>
                            ) : (
                              `${nf(v.densidade_kg_m2, 2)} kg/m²`
                            )}
                          </span>
                        </div>
                      )}
                      {v.conversao_alimentar !== null && (
                        <div className={styles.linha}>
                          <span className={styles.k}>Conversão alimentar</span>
                          <span className={styles.v}>{nf(v.conversao_alimentar, 2)} kg ração/kg</span>
                        </div>
                      )}
                      {v.ultima_biometria && (
                        <div className={styles.linha}>
                          <span className={styles.k}>Última biometria</span>
                          <span className={styles.v}>
                            {nf(v.ultima_biometria.peso_medio_g)} g ({v.ultima_biometria.dias_atras}d)
                          </span>
                        </div>
                      )}
                      {v.racao_acumulada_kg !== null && (
                        <div className={styles.linha}>
                          <span className={styles.k}>Ração acumulada</span>
                          <span className={styles.v}>{nf(v.racao_acumulada_kg, 0)} kg</span>
                        </div>
                      )}
                    </>
                  )}

                  {v.ultima_agua && (
                    <div className={styles.linha}>
                      <span className={styles.k}>Água ({v.ultima_agua.data.slice(5).split("-").reverse().join("/")})</span>
                      <span className={styles.v} style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        {v.ultima_agua.oxigenio !== null && (
                          <span className={`${styles.badge} ${badgeOxigenio(v.ultima_agua.oxigenio)}`}>
                            O₂ {nf(v.ultima_agua.oxigenio)}
                          </span>
                        )}
                        {v.ultima_agua.ph !== null && (
                          <span className={`${styles.badge} ${badgePh(v.ultima_agua.ph)}`}>pH {nf(v.ultima_agua.ph)}</span>
                        )}
                        {v.ultima_agua.amonia !== null && (
                          <span className={`${styles.badge} ${badgeAmonia(v.ultima_agua.amonia)}`}>
                            NH₃ {nf(v.ultima_agua.amonia, 2)}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {viveiroSelecionado && (
        <Modal
          titulo={
            viveiroSelecionado.tipo === "decantacao"
              ? viveiroSelecionado.codigo
              : `Viveiro ${viveiroSelecionado.codigo} — lote ${viveiroSelecionado.lote_atual?.codigo ?? ""}`
          }
          subtitulo="Histórico de crescimento desde a entrada do lote nesse viveiro"
          onFechar={fecharHistorico}
        >
          {erroHistorico && <div className={styles.erro}>{erroHistorico}</div>}
          {!historico && !erroHistorico && <div className={styles.carregando}>Carregando…</div>}

          {historico && (
            <>
              <div className={styles.section}>Peso real x esperado (g)</div>
              <Chart
                dados={pontosPeso} series={["Peso real (g)", "Peso esperado (g)"]} tipo="linha"
                formatarBucket={dataBr} formatarValor={(v) => `${nf(v, 0)} g`}
              />

              <div className={styles.section}>Conversão alimentar realizada x esperada</div>
              <p className={styles.hint}>
                Realizada = ração do intervalo ÷ ganho de biomassa real. Esperada = consumo previsto pela tabela de
                arraçoamento ÷ ganho de peso esperado no mesmo intervalo.
              </p>
              <Chart
                dados={pontosConversao} series={["Conversão realizada", "Conversão esperada"]} tipo="linha"
                formatarBucket={dataBr} formatarValor={(v) => nf(v, 2)}
              />

              <div className={styles.section}>Biometrias</div>
              <div className={styles.tableWrap}>
                <table className={styles.tabela}>
                  <thead>
                    <tr>
                      <th>Data</th><th>Peso real</th><th>Peso esperado</th><th>Densidade</th>
                      <th>Conversão realizada</th><th>Conversão esperada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historico.pontos.map((p, i) => (
                      <tr key={i}>
                        <td>{dataBr(p.data)}</td>
                        <td>{nf(p.peso_real_g, 1)} g</td>
                        <td>{nf(p.peso_esperado_g, 1)} g</td>
                        <td>{p.densidade_kg_m2 !== null ? `${nf(p.densidade_kg_m2, 2)} kg/m²` : "—"}</td>
                        <td>{p.conversao_realizada_intervalo !== null ? nf(p.conversao_realizada_intervalo, 2) : "—"}</td>
                        <td>{p.conversao_esperada_intervalo !== null ? nf(p.conversao_esperada_intervalo, 2) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
