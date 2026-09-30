"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listarLotes, loteDetalhe,
  type LoteDetalhe, type LoteResumo,
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

const FASE_LABEL: Record<string, string> = { pre_engorda: "Pré-engorda", engorda: "Engorda" };
const DESTINO_LABEL: Record<string, string> = {
  file: "Filé", postas: "Postas", inteira_limpa: "Tilápia limpa", inteira_suja: "Tilápia suja",
};

function badgeCrescimento(cor: string | null) {
  if (cor === "verde") return styles.badgeOk;
  if (cor === "amarelo") return styles.badgeWarn;
  if (cor === "vermelho") return styles.badgeCrit;
  return styles.badgeNeutro;
}

export default function PainelLotes() {
  const router = useRouter();
  const [dados, setDados] = useState<LoteResumo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"ativos" | "encerrados" | "todos">("ativos");

  const [loteSelecionadoId, setLoteSelecionadoId] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<LoteDetalhe | null>(null);
  const [erroDetalhe, setErroDetalhe] = useState<string | null>(null);

  useEffect(() => {
    listarLotes().then(setDados).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }, []);

  function abrirLote(id: number) {
    setLoteSelecionadoId(id);
    setDetalhe(null);
    setErroDetalhe(null);
    loteDetalhe(id).then(setDetalhe).catch(() => setErroDetalhe("Sem conexão e sem dado salvo deste aparelho ainda."));
  }
  function fecharLote() {
    setLoteSelecionadoId(null);
    setDetalhe(null);
    setErroDetalhe(null);
  }

  const listaFiltrada = useMemo(() => {
    if (!dados) return dados;
    const termo = busca.trim().toLowerCase();
    return dados.filter((l) => {
      if (filtroStatus === "ativos" && !l.ativo) return false;
      if (filtroStatus === "encerrados" && l.ativo) return false;
      if (termo && !l.codigo.toLowerCase().includes(termo) && !l.viveiro_codigo.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [dados, busca, filtroStatus]);

  const pontosCrescimento: SeriePonto[] = useMemo(() => {
    if (!detalhe) return [];
    const reais = detalhe.pontos.map((p) => ({
      bucket: p.data,
      valores: { "Peso real (g)": p.peso_real_g, "Peso esperado (g)": p.peso_esperado_g },
    }));
    const futuros = detalhe.projecao.map((p) => ({
      bucket: p.data,
      valores: { "Peso esperado (g)": p.peso_esperado_g },
    }));
    return [...reais, ...futuros];
  }, [detalhe]);

  const pontosConversao: SeriePonto[] = useMemo(() => {
    if (!detalhe) return [];
    return detalhe.pontos.map((p) => ({
      bucket: p.data,
      valores: {
        "Conversão realizada": p.conversao_realizada_intervalo,
        "Conversão esperada": p.conversao_esperada_intervalo,
      },
    }));
  }, [detalhe]);

  return (
    <div className={styles.page} style={{ maxWidth: "none" }}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/painel")}>
          ←
        </button>
        <div>
          <h1>Painel de lotes</h1>
          <div className={styles.sub}>Origem, crescimento, despescas e produção — um lote por vez, ativo ou encerrado</div>
        </div>
      </div>
      <div className={styles.body}>
        {erro && <div className={styles.erro}>{erro}</div>}

        <div className={styles.filtros}>
          <div className={styles.campo}>
            <label>Buscar</label>
            <input
              type="text" placeholder="Lote ou tanque" value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={{ padding: "9px 11px", borderRadius: 9, border: "1px solid var(--rule-strong)", background: "var(--surface)", color: "var(--ink)" }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            {(["ativos", "encerrados", "todos"] as const).map((s) => (
              <button
                key={s} type="button" onClick={() => setFiltroStatus(s)}
                style={{
                  padding: "9px 16px", borderRadius: 9, border: "1px solid var(--rule-strong)",
                  background: filtroStatus === s ? "var(--brand)" : "var(--surface)",
                  color: filtroStatus === s ? "var(--brand-ink)" : "var(--ink)",
                  fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
                }}
              >
                {s === "ativos" ? "Ativos" : s === "encerrados" ? "Encerrados" : "Todos"}
              </button>
            ))}
          </div>
        </div>

        {!listaFiltrada && !erro && <div className={styles.carregando}>Carregando…</div>}
        {listaFiltrada && listaFiltrada.length === 0 && <p className={styles.hint}>Nenhum lote encontrado.</p>}

        {listaFiltrada && listaFiltrada.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.tabela}>
              <thead>
                <tr>
                  <th>Tanque</th><th>Lote</th><th>Fase</th><th>Status</th><th>Início</th>
                  <th>Idade</th><th>Saldo</th><th>Peso estimado hoje</th><th>Semana</th><th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.map((l) => (
                  <tr key={l.id} style={{ cursor: "pointer" }} onClick={() => abrirLote(l.id)}>
                    <td>{l.viveiro_codigo}</td>
                    <td>{l.codigo}</td>
                    <td>{FASE_LABEL[l.fase] ?? l.fase}</td>
                    <td>
                      <span className={`${styles.badge} ${l.ativo ? styles.badgeOk : styles.badgeNeutro}`}>
                        {l.ativo ? "ativo" : "encerrado"}
                      </span>
                    </td>
                    <td>{dataBr(l.data_inicio)}</td>
                    <td>{l.idade_dias} d</td>
                    <td>{nf(l.saldo_atual_un)}</td>
                    <td>{l.peso_estimado_hoje_g !== null ? `${nf(l.peso_estimado_hoje_g)} g` : "—"}</td>
                    <td>{l.semana_atual ?? "—"}</td>
                    <td>
                      {l.ativo && (
                        l.pronto_para_abate ? (
                          <span className={`${styles.badge} ${styles.badgeCrit}`}>pronto p/ abate</span>
                        ) : (
                          <span className={`${styles.badge} ${styles.badgeNeutro}`}>crescendo</span>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {loteSelecionadoId !== null && (
        <Modal
          titulo={detalhe ? `Tanque ${detalhe.viveiro_codigo} — lote ${detalhe.codigo}` : "Carregando…"}
          subtitulo={detalhe ? `${FASE_LABEL[detalhe.fase] ?? detalhe.fase} — ${detalhe.ativo ? "ativo" : "encerrado"}` : undefined}
          onFechar={fecharLote}
        >
          {erroDetalhe && <div className={styles.erro}>{erroDetalhe}</div>}
          {!detalhe && !erroDetalhe && <div className={styles.carregando}>Carregando…</div>}

          {detalhe && (
            <>
              <div className={styles.section}>Origem e povoamento</div>
              <div className={styles.linha}>
                <span className={styles.k}>Origem</span>
                <span className={styles.v}>{detalhe.origem}</span>
              </div>
              <div className={styles.linha}>
                <span className={styles.k}>Data de povoamento</span>
                <span className={styles.v}>{dataBr(detalhe.data_povoamento)}</span>
              </div>
              <div className={styles.linha}>
                <span className={styles.k}>Entrada nesse tanque</span>
                <span className={styles.v}>{dataBr(detalhe.data_inicio)}</span>
              </div>
              {detalhe.data_fim && (
                <div className={styles.linha}>
                  <span className={styles.k}>Encerrado em</span>
                  <span className={styles.v}>{dataBr(detalhe.data_fim)}</span>
                </div>
              )}
              <div className={styles.linha}>
                <span className={styles.k}>Povoamento inicial</span>
                <span className={styles.v}>{nf(detalhe.quantidade_inicial)} un · {nf(detalhe.peso_medio_inicial_g, 1)} g</span>
              </div>
              <div className={styles.linha}>
                <span className={styles.k}>Idade</span>
                <span className={styles.v}>{detalhe.idade_dias} dias{detalhe.idade_semanas !== null ? ` · semana ${detalhe.idade_semanas}` : ""}</span>
              </div>

              <div className={styles.section} style={{ marginTop: 16 }}>Situação atual</div>
              <div className={styles.linha}>
                <span className={styles.k}>Saldo registrado</span>
                <span className={styles.v}>{nf(detalhe.saldo_atual_un)} un</span>
              </div>
              <div className={styles.linha}>
                <span className={styles.k}>Peixes vivos esperados</span>
                <span className={styles.v}>{nf(detalhe.peixes_vivos_esperados)} un <span className={styles.hint} style={{ display: "inline" }}>(desconta mortalidade ainda não lançada)</span></span>
              </div>
              {detalhe.ativo && (
                <>
                  <div className={styles.linha}>
                    <span className={styles.k}>Peso estimado hoje</span>
                    <span className={styles.v}>
                      <span className={`${styles.badge} ${badgeCrescimento(detalhe.cor_crescimento)}`}>
                        {detalhe.peso_estimado_hoje_g !== null ? `${nf(detalhe.peso_estimado_hoje_g)} g` : "—"}
                      </span>
                      {detalhe.semana_atual !== null && ` · semana ${detalhe.semana_atual}`}
                    </span>
                  </div>
                  <div className={styles.linha}>
                    <span className={styles.k}>Peso esperado p/ idade</span>
                    <span className={styles.v}>{detalhe.peso_esperado_pela_idade_g !== null ? `${nf(detalhe.peso_esperado_pela_idade_g)} g` : "—"}</span>
                  </div>
                  <div className={styles.linha}>
                    <span className={styles.k}>Biomassa atual</span>
                    <span className={styles.v}>{detalhe.biomassa_atual_kg !== null ? `${nf(detalhe.biomassa_atual_kg)} kg` : "—"}</span>
                  </div>
                  <div className={styles.linha}>
                    <span className={styles.k}>Densidade</span>
                    <span className={styles.v}>{detalhe.densidade_kg_m2 !== null ? `${nf(detalhe.densidade_kg_m2, 2)} kg/m²` : "—"}</span>
                  </div>
                  <div className={styles.linha}>
                    <span className={styles.k}>Conversão alimentar</span>
                    <span className={styles.v}>{detalhe.conversao_alimentar !== null ? `${nf(detalhe.conversao_alimentar, 2)} kg ração/kg` : "—"}</span>
                  </div>
                  <div className={styles.linha}>
                    <span className={styles.k}>Ração acumulada</span>
                    <span className={styles.v}>{detalhe.racao_acumulada_kg !== null ? `${nf(detalhe.racao_acumulada_kg)} kg` : "—"}</span>
                  </div>
                  <div className={styles.linha}>
                    <span className={styles.k}>Previsão de abate</span>
                    <span className={styles.v}>
                      {detalhe.pronto_para_abate ? (
                        <span className={`${styles.badge} ${styles.badgeCrit}`}>PRONTO PARA ABATE</span>
                      ) : (
                        <span className={`${styles.badge} ${styles.badgeNeutro}`}>
                          {detalhe.previsao_abate ? dataBr(detalhe.previsao_abate) : "—"}
                        </span>
                      )}
                      {" "}(peso ideal {nf(detalhe.peso_ideal_abate_g)} g)
                    </span>
                  </div>
                </>
              )}

              <div className={styles.section} style={{ marginTop: 16 }}>Totais do lote</div>
              <div className={styles.cards}>
                <div className={styles.card}>
                  <div className={styles.cardLabel}>Despescado</div>
                  <div className={styles.cardValue}>{nf(detalhe.total_despescado_un)} un</div>
                  <div className={styles.cardSub}>{nf(detalhe.total_despescado_kg)} kg</div>
                </div>
                <div className={styles.card}>
                  <div className={styles.cardLabel}>Produzido</div>
                  <div className={styles.cardValue}>{nf(detalhe.total_producao_kg)} kg</div>
                  <div className={styles.cardSub}>em todos os produtos</div>
                </div>
              </div>

              <div className={styles.section} style={{ marginTop: 16 }}>Curva de crescimento — real e projetada</div>
              <Chart
                dados={pontosCrescimento} series={["Peso real (g)", "Peso esperado (g)"]} tipo="linha"
                formatarBucket={dataBr} formatarValor={(v) => `${nf(v, 0)} g`}
                caberNaTela
              />

              {detalhe.pontos.length > 1 && (
                <>
                  <div className={styles.section} style={{ marginTop: 16 }}>Conversão alimentar realizada x esperada</div>
                  <Chart
                    dados={pontosConversao} series={["Conversão realizada", "Conversão esperada"]} tipo="linha"
                    formatarBucket={dataBr} formatarValor={(v) => nf(v, 2)}
                  />
                </>
              )}

              <div className={styles.section} style={{ marginTop: 16 }}>Biometrias</div>
              <div className={styles.tableWrap}>
                <table className={`${styles.tabela} ${styles.tabelaCompacta}`}>
                  <thead>
                    <tr>
                      <th>Data</th><th>Peso real</th><th>Peso esperado</th><th>Saldo</th><th>Densidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalhe.pontos.map((p, i) => (
                      <tr key={i}>
                        <td>{dataBr(p.data)}</td>
                        <td>{nf(p.peso_real_g, 1)} g</td>
                        <td>{nf(p.peso_esperado_g, 1)} g</td>
                        <td>{nf(p.saldo_un)}</td>
                        <td>{p.densidade_kg_m2 !== null ? `${nf(p.densidade_kg_m2, 2)} kg/m²` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {detalhe.despescas.length > 0 && (
                <>
                  <div className={styles.section} style={{ marginTop: 16 }}>Despescas</div>
                  <div className={styles.tableWrap}>
                    <table className={`${styles.tabela} ${styles.tabelaCompacta}`}>
                      <thead>
                        <tr>
                          <th>Data</th><th>Destino</th><th>Quantidade</th><th>Peso médio</th><th>Kg</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalhe.despescas.map((d, i) => (
                          <tr key={i}>
                            <td>{dataBr(d.data)}</td>
                            <td>{DESTINO_LABEL[d.destino] ?? d.destino}</td>
                            <td>{nf(d.quantidade_un)}</td>
                            <td>{nf(d.peso_medio_g, 1)} g</td>
                            <td>{nf(d.peso_total_kg)} kg</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {detalhe.repicagens_saida.length > 0 && (
                <>
                  <div className={styles.section} style={{ marginTop: 16 }}>Repicagens de saída</div>
                  <div className={styles.tableWrap}>
                    <table className={`${styles.tabela} ${styles.tabelaCompacta}`}>
                      <thead>
                        <tr>
                          <th>Data</th><th>Destino</th><th>Quantidade</th><th>Peso médio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalhe.repicagens_saida.map((r, i) => (
                          <tr key={i}>
                            <td>{dataBr(r.data)}</td>
                            <td>Tanque {r.viveiro_destino_codigo} — lote {r.lote_destino_codigo}</td>
                            <td>{nf(r.quantidade)}</td>
                            <td>{nf(r.peso_medio_g, 1)} g</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {detalhe.producao.length > 0 && (
                <>
                  <div className={styles.section} style={{ marginTop: 16 }}>Produção e rendimento</div>
                  <div className={styles.tableWrap}>
                    <table className={`${styles.tabela} ${styles.tabelaCompacta}`}>
                      <thead>
                        <tr>
                          <th>Data</th><th>Produto</th><th>Kg</th><th>Despesca de origem</th><th>Rendimento</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalhe.producao.map((p, i) => (
                          <tr key={i}>
                            <td>{dataBr(p.data)}</td>
                            <td>{p.produto_nome}</td>
                            <td>{nf(p.quantidade_kg)} kg</td>
                            <td>{p.data_despesca ? dataBr(p.data_despesca) : "—"}</td>
                            <td>{p.rendimento !== null ? pct(p.rendimento) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
