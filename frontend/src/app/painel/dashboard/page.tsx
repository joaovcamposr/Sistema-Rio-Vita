"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  painelDashboard, sugestaoRepicagem, projecaoCapacidade,
  type Dashboard, type SerieDiaria, type SugestaoRepicagemGeral, type NivelRepicagem,
  type ProjecaoCapacidade,
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
function dataBr(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
function dataBrLonga(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

type SerieAtiva = "producao" | "vendas_kg" | "vendas_valor" | "rendimento" | "mortalidade";

const CONFIG_SERIE: Record<SerieAtiva, {
  titulo: string;
  nomeSerie: string;
  extrair: (d: Dashboard) => SerieDiaria[];
  formatarValor: (v: number) => string;
}> = {
  producao: {
    titulo: "Produção diária no período",
    nomeSerie: "Produção (kg)",
    extrair: (d) => d.serie_producao_diaria.map((p) => ({ data: p.data, valor: p.quantidade_kg })),
    formatarValor: (v) => `${nf(v)} kg`,
  },
  vendas_kg: {
    titulo: "Vendas diárias no período (Kg)",
    nomeSerie: "Vendas (kg)",
    extrair: (d) => d.serie_vendas_kg_diaria,
    formatarValor: (v) => `${nf(v)} kg`,
  },
  vendas_valor: {
    titulo: "Vendas diárias no período (R$)",
    nomeSerie: "Vendas (R$)",
    extrair: (d) => d.serie_vendas_valor_diaria,
    formatarValor: (v) => moeda(v),
  },
  rendimento: {
    titulo: "Rendimento diário no período",
    nomeSerie: "Rendimento (%)",
    extrair: (d) => d.serie_rendimento_diario,
    formatarValor: (v) => `${nf(v, 1)}%`,
  },
  mortalidade: {
    titulo: "Mortalidade diária no período (lotes encerrados no dia)",
    nomeSerie: "Mortalidade (%)",
    extrair: (d) => d.serie_mortalidade_diaria,
    formatarValor: (v) => `${nf(v, 1)}%`,
  },
};

function NivelItens({ nivel }: { nivel: NivelRepicagem }) {
  if (nivel.itens.length === 0) {
    return <p className={styles.hint} style={{ margin: 0 }}>Nenhuma repicagem possível.</p>;
  }
  return (
    <>
      <ul style={{ margin: "0 0 8px", paddingLeft: 18, fontSize: "0.86rem" }}>
        {nivel.itens.map((item, i) => (
          <li key={i}>
            Repicar {nf(item.un_repicado, 0)} peixes de {item.viveiro_origem} (lote {item.lote_codigo}) para o
            viveiro {item.viveiro_destino}
          </li>
        ))}
      </ul>
      {nivel.misturas.map((m) => (
        <p key={m.viveiro_destino} className={styles.hint} style={{ margin: "0 0 6px", color: "var(--warn)" }}>
          ⚠ {m.origens.join(" e ")} serão repicados juntos para o viveiro {m.viveiro_destino} — lotes de peso
          compatível, tanque será compartilhado.
        </p>
      ))}
      {Object.entries(nivel.restante_un).some(([, v]) => v > 0) && (
        <p className={styles.hint} style={{ margin: 0 }}>
          Ainda ficam acima do limite:{" "}
          {Object.entries(nivel.restante_un)
            .filter(([, v]) => v > 0)
            .map(([c, v]) => `${c} (${nf(v, 0)} peixes)`)
            .join(", ")}
        </p>
      )}
    </>
  );
}

function NivelCard({ titulo, nivel }: { titulo: string; nivel: NivelRepicagem }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardLabel}>{titulo}</div>
      <p className={styles.hint} style={{ margin: "6px 0" }}>{nivel.resumo}</p>
      <NivelItens nivel={nivel} />
    </div>
  );
}

export default function PainelDashboard() {
  const router = useRouter();
  const [de, setDe] = useState(diasAtras(30));
  const [ate, setAte] = useState(hojeISO());
  const [dados, setDados] = useState<Dashboard | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [serieAtiva, setSerieAtiva] = useState<SerieAtiva>("producao");
  const [sugestoes, setSugestoes] = useState<SugestaoRepicagemGeral | null>(null);
  const [projecao, setProjecao] = useState<ProjecaoCapacidade | null>(null);

  useEffect(() => {
    setDados(null);
    painelDashboard(de, ate).then(setDados).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }, [de, ate]);

  useEffect(() => {
    sugestaoRepicagem().then(setSugestoes).catch(() => {});
    projecaoCapacidade().then(setProjecao).catch(() => {});
  }, []);

  const pontos: SeriePonto[] = useMemo(() => {
    if (!dados) return [];
    const config = CONFIG_SERIE[serieAtiva];
    return config.extrair(dados).map((p) => ({ bucket: p.data, valores: { [config.nomeSerie]: p.valor } }));
  }, [dados, serieAtiva]);

  function cardClicavel(chave: SerieAtiva): string {
    return `${styles.card} ${styles.cardClicavel} ${serieAtiva === chave ? styles.cardAtivo : ""}`;
  }

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/painel")}>
          ←
        </button>
        <div>
          <h1>Dashboard</h1>
          <div className={styles.sub}>Visão geral do período</div>
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
            <p className={styles.hint}>Clique num card para ver a evolução diária dele no gráfico abaixo.</p>
            <div className={styles.cards}>
              <button type="button" className={cardClicavel("producao")} onClick={() => setSerieAtiva("producao")}>
                <div className={styles.cardLabel}>Produção total</div>
                <div className={styles.cardValue}>{nf(dados.producao_total_kg)} kg</div>
                <div className={styles.cardSub}>{dados.dias_trabalhados} dia(s) com produção lançada</div>
              </button>
              <button type="button" className={cardClicavel("producao")} onClick={() => setSerieAtiva("producao")}>
                <div className={styles.cardLabel}>Produção por dia trabalhado</div>
                <div className={styles.cardValue}>
                  {dados.producao_por_dia_kg !== null ? `${nf(dados.producao_por_dia_kg)} kg/dia` : "—"}
                </div>
              </button>
              <button type="button" className={cardClicavel("vendas_kg")} onClick={() => setSerieAtiva("vendas_kg")}>
                <div className={styles.cardLabel}>Vendas</div>
                <div className={styles.cardValue}>{nf(dados.vendas_kg)} kg</div>
              </button>
              <button type="button" className={cardClicavel("vendas_valor")} onClick={() => setSerieAtiva("vendas_valor")}>
                <div className={styles.cardLabel}>Vendas (R$)</div>
                <div className={styles.cardValue}>{moeda(dados.vendas_valor)}</div>
              </button>
            </div>

            <div className={styles.cards}>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Biomassa total</div>
                <div className={styles.cardValue}>{nf(dados.biomassa_total_kg)} kg</div>
                <div className={styles.cardSub}>Agora, somando todos os viveiros ativos</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Conversão alimentar média ponderada</div>
                <div className={styles.cardValue}>
                  {dados.conversao_media_ponderada !== null ? `${nf(dados.conversao_media_ponderada, 2)} kg ração/kg` : "—"}
                </div>
                <div className={styles.cardSub}>Agora, lotes ativos, vida inteira do lote</div>
              </div>
              <button type="button" className={cardClicavel("mortalidade")} onClick={() => setSerieAtiva("mortalidade")}>
                <div className={styles.cardLabel}>Mortalidade média ponderada</div>
                <div className={styles.cardValue}>
                  {dados.mortalidade_media_ponderada !== null ? `${nf(dados.mortalidade_media_ponderada * 100, 1)}%` : "—"}
                </div>
                <div className={styles.cardSub}>Lotes encerrados no período</div>
              </button>
              <button type="button" className={cardClicavel("rendimento")} onClick={() => setSerieAtiva("rendimento")}>
                <div className={styles.cardLabel}>Rendimento médio ponderado de Filé</div>
                <div className={styles.cardValue}>
                  {dados.rendimento_medio_ponderado !== null ? `${nf(dados.rendimento_medio_ponderado * 100, 1)}%` : "—"}
                </div>
                <div className={styles.cardSub}>Filé ÷ peso despescado no período</div>
              </button>
            </div>

            <div className={styles.section}>{CONFIG_SERIE[serieAtiva].titulo}</div>
            {pontos.length === 0 && <p className={styles.hint}>Nada lançado nessa métrica, no período.</p>}
            {pontos.length > 0 && (
              <Chart
                dados={pontos} series={[CONFIG_SERIE[serieAtiva].nomeSerie]} tipo="linha"
                formatarBucket={dataBr} formatarValor={CONFIG_SERIE[serieAtiva].formatarValor}
              />
            )}

            <div className={styles.section}>Viveiros com densidade próxima ou acima do limite</div>
            {dados.viveiros_alerta.length === 0 && (
              <p className={styles.hint}>Nenhum viveiro perto do limite agora.</p>
            )}
            {dados.viveiros_alerta.length > 0 && (
              <div className={styles.tableWrap}>
                <table className={styles.tabela}>
                  <thead>
                    <tr><th>Viveiro</th><th>Lote</th><th>Densidade</th><th>Limite</th><th>Situação</th></tr>
                  </thead>
                  <tbody>
                    {dados.viveiros_alerta.map((v) => (
                      <tr key={v.viveiro_codigo}>
                        <td>{v.viveiro_codigo}</td>
                        <td>{v.lote_codigo}</td>
                        <td>{nf(v.densidade_kg_m2, 2)} kg/m²</td>
                        <td>{nf(v.limite_kg_m2, 2)} kg/m²</td>
                        <td>
                          <span className={`${styles.badge} ${v.situacao === "acima" ? styles.badgeCrit : styles.badgeWarn}`}>
                            {v.situacao === "acima" ? "Acima do limite" : "Próximo do limite"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {sugestoes && sugestoes.tanques_acima_do_limite.length > 0 && (
              <>
                <div className={styles.section}>
                  Sugestão de repicagem/despesca — tanques acima do limite: {sugestoes.tanques_acima_do_limite.join(", ")}
                </div>
                <div className={styles.cards}>
                  <NivelCard titulo="Nível 1 — repicagem total" nivel={sugestoes.nivel_1} />
                  <NivelCard titulo="Nível 2 — repicagem parcial (equalizada)" nivel={sugestoes.nivel_2} />
                  <div className={styles.card}>
                    <div className={styles.cardLabel}>Nível 3 — zerar e repicar</div>
                    <p className={styles.hint} style={{ margin: "6px 0" }}>{sugestoes.nivel_3.resumo}</p>
                    {sugestoes.nivel_3.despescar.length > 0 && (
                      <>
                        <p style={{ fontSize: "0.82rem", fontWeight: 700, margin: "8px 0 4px" }}>Despescar:</p>
                        <ul style={{ margin: "0 0 8px", paddingLeft: 18, fontSize: "0.86rem" }}>
                          {sugestoes.nivel_3.despescar.map((d) => (
                            <li key={d.viveiro_codigo}>
                              Viveiro {d.viveiro_codigo} (lote {d.lote_codigo}, {nf(d.peso_estimado_g, 0)}g,{" "}
                              {nf(d.saldo_un, 0)} peixes) — libera espaço para até {nf(d.capacidade_liberada_un, 0)} peixes
                            </li>
                          ))}
                        </ul>
                        <p style={{ fontSize: "0.82rem", fontWeight: 700, margin: "8px 0 4px" }}>Depois, repicar:</p>
                      </>
                    )}
                    <NivelItens nivel={sugestoes.nivel_3.repicagem} />
                  </div>
                </div>
              </>
            )}

            <div className={styles.section}>Projeção de capacidade dos tanques</div>
            {projecao && projecao.eventos.length === 0 && (
              <p className={styles.hint}>
                Nenhum tanque deve estourar o limite de densidade dentro do horizonte de {projecao.horizonte_semanas}{" "}
                semanas — os lotes atuais devem chegar à idade de abate antes disso.
              </p>
            )}
            {projecao && projecao.eventos.length > 0 && (
              <>
                <p className={styles.hint} style={{ margin: "0 0 8px" }}>
                  Projeção considerando a curva de crescimento de cada lote ativo, na ordem em que cada necessidade
                  deve surgir. Prioridade: repicar primeiro, despescar (≥ 600g) depois, ativar tanque hoje inativo só
                  por último.
                </p>
                <div className={styles.tableWrap}>
                  <table className={styles.tabela}>
                    <thead>
                      <tr><th>Viveiro</th><th>Lote</th><th>Quando</th><th>Como resolver</th></tr>
                    </thead>
                    <tbody>
                      {projecao.eventos.map((ev) => (
                        <tr key={ev.viveiro_codigo}>
                          <td>{ev.viveiro_codigo}</td>
                          <td>{ev.lote_codigo}</td>
                          <td>
                            Semana {ev.semanas_a_partir_de_hoje} a partir de hoje ({dataBrLonga(ev.data_prevista)})
                          </td>
                          <td>
                            <span
                              className={`${styles.badge} ${
                                !ev.resolvido ? styles.badgeCrit : ev.resolvido_com === "ativacao" ? styles.badgeWarn : ""
                              }`}
                            >
                              {ev.detalhe}
                            </span>
                            {ev.tanques_a_despescar.length > 0 && (
                              <div className={styles.hint} style={{ marginTop: 4 }}>
                                Despescar: {ev.tanques_a_despescar.join(", ")}
                              </div>
                            )}
                            {ev.tanques_a_ativar.length > 0 && (
                              <div className={styles.hint} style={{ marginTop: 4 }}>
                                Ativar (nessa ordem): {ev.tanques_a_ativar.join(", ")}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
