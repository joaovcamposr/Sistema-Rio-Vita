"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { listarViveirosTodos, type ViveiroAtivo } from "@/lib/api";
import {
  painelViveiros, disponibilidadeTanques, listarParametros,
  type PainelViveiro, type DisponibilidadeTanque, type Parametro,
} from "@/lib/paineis";
import PainelSugestaoRepicagem from "@/components/PainelSugestaoRepicagem";
import styles from "../painel.module.css";

const TIPO_LABEL: Record<string, string> = {
  pre_engorda: "Pré-engorda",
  engorda: "Engorda",
  decantacao: "Decantação",
};

// peso alvo (kg) usado pra estimar capacidade — mesma conta que a
// sugestão de repicagem já faz no backend (area_m2 * limite_kg_m2 / 0.8),
// pensando na densidade quando os peixes chegarem a 800g
const PESO_ALVO_CAPACIDADE_KG = 0.8;
const HORIZONTE_EM_BREVE_DIAS = 60;

function nf(v: number, casas = 0): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
function diasAtePrevisao(iso: string): number {
  return Math.round((new Date(iso).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
}

type Status = "disponivel" | "ocupado" | "decantacao" | "inativo";

interface LinhaTanque {
  viveiro: ViveiroAtivo;
  status: Status;
  detalhe: PainelViveiro | null;
  disponibilidade: DisponibilidadeTanque | null;
}

export default function ProgramacaoRepicagem() {
  const router = useRouter();
  const [viveiros, setViveiros] = useState<ViveiroAtivo[] | null>(null);
  const [detalhes, setDetalhes] = useState<PainelViveiro[] | null>(null);
  const [disponibilidade, setDisponibilidade] = useState<DisponibilidadeTanque[] | null>(null);
  const [parametros, setParametros] = useState<Parametro[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listarViveirosTodos(), painelViveiros(), disponibilidadeTanques(), listarParametros()])
      .then(([v, d, disp, p]) => { setViveiros(v); setDetalhes(d); setDisponibilidade(disp); setParametros(p); })
      .catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }, []);

  const limitePorTipo = useMemo(() => {
    const preEngorda = parametros?.find((p) => p.chave === "limite_densidade_pre_engorda_kg_m2")?.valor ?? 2.5;
    const engorda = parametros?.find((p) => p.chave === "limite_densidade_engorda_kg_m2")?.valor ?? 2.5;
    return { pre_engorda: preEngorda, engorda };
  }, [parametros]);

  function capacidadeUn(areaM2: number, tipo: string): number {
    const limite = tipo === "pre_engorda" ? limitePorTipo.pre_engorda : limitePorTipo.engorda;
    return Math.floor((areaM2 * limite) / PESO_ALVO_CAPACIDADE_KG);
  }

  const linhas: LinhaTanque[] | null = useMemo(() => {
    if (!viveiros || !detalhes || !disponibilidade) return null;
    const detalhePorCodigo = new Map(detalhes.map((d) => [d.codigo, d]));
    const dispPorCodigo = new Map(disponibilidade.map((d) => [d.viveiro_codigo, d]));
    return viveiros.map((v) => {
      const detalhe = detalhePorCodigo.get(v.codigo) ?? null;
      const disp = dispPorCodigo.get(v.codigo) ?? null;
      let status: Status;
      if (!v.ativo) status = "inativo";
      else if (v.tipo === "decantacao") status = "decantacao";
      else if (!detalhe?.lote_atual) status = "disponivel";
      else status = "ocupado";
      return { viveiro: v, status, detalhe, disponibilidade: disp };
    });
  }, [viveiros, detalhes, disponibilidade]);

  const disponiveisAgora = useMemo(() => linhas?.filter((l) => l.status === "disponivel") ?? [], [linhas]);

  const disponibilidadePrevista = useMemo(() => {
    if (!linhas) return [];
    return linhas
      .filter((l): l is LinhaTanque & { disponibilidade: DisponibilidadeTanque } => l.status === "ocupado" && l.disponibilidade !== null)
      .sort((a, b) => {
        if (a.disponibilidade.pronto !== b.disponibilidade.pronto) return a.disponibilidade.pronto ? -1 : 1;
        const da = a.disponibilidade.data_prevista ?? "9999-99-99";
        const db_ = b.disponibilidade.data_prevista ?? "9999-99-99";
        return da.localeCompare(db_);
      });
  }, [linhas]);

  const emBreveCount = useMemo(
    () =>
      disponibilidadePrevista.filter(
        (l) =>
          l.disponibilidade.pronto ||
          (l.disponibilidade.data_prevista && diasAtePrevisao(l.disponibilidade.data_prevista) <= HORIZONTE_EM_BREVE_DIAS)
      ).length,
    [disponibilidadePrevista]
  );

  const areaTotalM2 = useMemo(
    () => linhas?.filter((l) => l.viveiro.ativo).reduce((s, l) => s + l.viveiro.area_m2, 0) ?? 0,
    [linhas]
  );
  const capacidadeDisponivelUn = useMemo(
    () => disponiveisAgora.reduce((s, l) => s + capacidadeUn(l.viveiro.area_m2, l.viveiro.tipo), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disponiveisAgora, limitePorTipo]
  );

  // horizonte da linha do tempo: até a previsão mais distante entre os
  // "vão ficar disponíveis em breve" com data conhecida, arredondado pra
  // cima em blocos de 4 semanas, com um mínimo de 8 pra não ficar apertado
  const horizonteSemanas = useMemo(() => {
    const max = disponibilidadePrevista.reduce(
      (m, l) => Math.max(m, l.disponibilidade.semanas_ate_disponivel ?? 0), 0
    );
    return Math.max(8, Math.ceil((max + 1) / 4) * 4);
  }, [disponibilidadePrevista]);

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/painel")}>
          ←
        </button>
        <div>
          <h1>Programação de repicagem</h1>
          <div className={styles.sub}>Metragem, disponibilidade dos tanques e sugestões de repicagem</div>
        </div>
      </div>
      <div className={styles.body}>
        {erro && <div className={styles.erro}>{erro}</div>}
        {!linhas && !erro && <div className={styles.carregando}>Carregando…</div>}

        {linhas && (
          <>
            <div className={styles.cards}>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Tanques ativos</div>
                <div className={styles.cardValue}>{linhas.filter((l) => l.viveiro.ativo).length}</div>
                <div className={styles.cardSub}>{nf(areaTotalM2)} m² no total</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Disponíveis agora</div>
                <div className={styles.cardValue}>{disponiveisAgora.length}</div>
                <div className={styles.cardSub}>
                  {disponiveisAgora.length > 0
                    ? `${nf(disponiveisAgora.reduce((s, l) => s + l.viveiro.area_m2, 0))} m² · até ${nf(capacidadeDisponivelUn)} peixes`
                    : "Nenhum tanque vazio"}
                </div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Vão ficar disponíveis em breve</div>
                <div className={styles.cardValue}>{emBreveCount}</div>
                <div className={styles.cardSub}>Prontos agora ou dentro de {HORIZONTE_EM_BREVE_DIAS} dias</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Tanques inativos</div>
                <div className={styles.cardValue}>{linhas.filter((l) => l.status === "inativo").length}</div>
                <div className={styles.cardSub}>
                  <Link href="/painel/viveiros" style={{ color: "var(--brand-deep)", fontWeight: 700 }}>
                    Ativar em Painel do viveiro
                  </Link>
                </div>
              </div>
            </div>

            <div className={styles.section}>Todos os tanques</div>
            <div className={styles.tableWrap}>
              <table className={styles.tabela}>
                <thead>
                  <tr><th>Viveiro</th><th>Tipo</th><th>Área (m²)</th><th>Densidade (kg/m²)</th><th>Status</th><th>Detalhe</th></tr>
                </thead>
                <tbody>
                  {linhas.map((l) => {
                    const densidade = l.detalhe?.densidade_kg_m2 ?? null;
                    const limite = l.viveiro.tipo === "pre_engorda" ? limitePorTipo.pre_engorda : limitePorTipo.engorda;
                    const densidadeAlerta = l.status === "ocupado" && densidade !== null && densidade >= limite * 0.9;
                    const densidadeAcima = l.status === "ocupado" && densidade !== null && densidade >= limite;
                    return (
                    <tr key={l.viveiro.id}>
                      <td>{l.viveiro.codigo}</td>
                      <td>{TIPO_LABEL[l.viveiro.tipo]}</td>
                      <td>{nf(l.viveiro.area_m2, 1)}</td>
                      <td>
                        {densidade === null ? "—" : densidadeAlerta ? (
                          <span className={`${styles.badge} ${densidadeAcima ? styles.badgeCrit : styles.badgeWarn}`}>
                            {nf(densidade, 2)}
                          </span>
                        ) : (
                          nf(densidade, 2)
                        )}
                      </td>
                      <td>
                        {l.status === "disponivel" && <span className={`${styles.badge} ${styles.badgeOk}`}>Disponível agora</span>}
                        {l.status === "ocupado" && <span className={`${styles.badge} ${styles.badgeNeutro}`}>Ocupado</span>}
                        {l.status === "decantacao" && <span className={`${styles.badge} ${styles.badgeNeutro}`}>Decantação</span>}
                        {l.status === "inativo" && <span className={`${styles.badge} ${styles.badgeWarn}`}>Inativo</span>}
                      </td>
                      <td>
                        {l.status === "ocupado" && l.detalhe?.lote_atual && (
                          <>
                            Lote {l.detalhe.lote_atual.codigo} · {nf(l.detalhe.lote_atual.saldo_un)} peixes
                            {l.detalhe.peso_estimado_hoje_g !== null && ` · ${nf(l.detalhe.peso_estimado_hoje_g)}g`}
                            {l.disponibilidade && (
                              l.disponibilidade.pronto
                                ? ` · pronto (${l.disponibilidade.motivo})`
                                : l.disponibilidade.data_prevista
                                  ? ` · disponível a partir de ${dataBr(l.disponibilidade.data_prevista)}`
                                  : ""
                            )}
                          </>
                        )}
                        {l.status === "disponivel" && `Cabem até ${nf(capacidadeUn(l.viveiro.area_m2, l.viveiro.tipo))} peixes`}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className={styles.section}>Vão ficar disponíveis em breve</div>
            <p className={styles.hint} style={{ margin: "0 0 8px" }}>
              Pré-engorda projeta pela repicagem (peso passa de 300g ou densidade passa do limite da fase — o que
              vier primeiro); engorda projeta pela idade de abate, mesma base da Programação de abate.
            </p>
            {disponibilidadePrevista.length === 0 && (
              <p className={styles.hint}>Nenhum tanque ocupado com previsão calculada.</p>
            )}
            {disponibilidadePrevista.length > 0 && (
              <>
                <div className={styles.tableWrap} style={{ marginBottom: 18 }}>
                  <table className={styles.tabela}>
                    <thead>
                      <tr><th>Viveiro</th><th>Lote</th><th>Peso atual</th><th>Semana atual</th><th>Disponível a partir de</th><th>Motivo</th></tr>
                    </thead>
                    <tbody>
                      {disponibilidadePrevista.map((l) => (
                        <tr key={l.viveiro.id}>
                          <td>{l.viveiro.codigo}</td>
                          <td>{l.disponibilidade.lote_codigo}</td>
                          <td>{nf(l.disponibilidade.peso_atual_g)} g</td>
                          <td>{l.disponibilidade.semana_atual}</td>
                          <td>
                            {l.disponibilidade.pronto ? (
                              <span className={`${styles.badge} ${styles.badgeCrit}`}>Pronto agora</span>
                            ) : (
                              <span className={`${styles.badge} ${styles.badgeNeutro}`}>
                                {l.disponibilidade.data_prevista ? dataBr(l.disponibilidade.data_prevista) : "—"}
                              </span>
                            )}
                          </td>
                          <td className={styles.hint} style={{ margin: 0 }}>{l.disponibilidade.motivo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: "flex", fontSize: "0.72rem", color: "var(--ink-faint)", marginBottom: 6, paddingLeft: 118 }}>
                  <span style={{ flex: 1 }}>Hoje</span>
                  <span style={{ flex: 1, textAlign: "center" }}>{Math.round(horizonteSemanas / 2)} sem.</span>
                  <span style={{ width: 90, textAlign: "right" }}>{horizonteSemanas} sem.</span>
                </div>
                {disponibilidadePrevista.map((l) => {
                  const semanas = l.disponibilidade.semanas_ate_disponivel;
                  const pct = semanas === null ? 100 : Math.min(100, (semanas / horizonteSemanas) * 100);
                  const cor = l.disponibilidade.fase === "pre_engorda" ? "var(--brand)" : "var(--ok)";
                  return (
                    <div key={l.viveiro.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 108, fontSize: "0.78rem", fontWeight: 700, flexShrink: 0 }}>
                        {l.viveiro.codigo}
                      </div>
                      <div style={{ flex: 1, position: "relative", height: 20, background: "var(--surface-sunk)", borderRadius: 6 }}>
                        <div
                          style={{
                            position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`,
                            background: cor, opacity: l.disponibilidade.pronto ? 1 : 0.55, borderRadius: 6,
                          }}
                        />
                      </div>
                      <div style={{ width: 90, fontSize: "0.76rem", textAlign: "right", flexShrink: 0 }}>
                        {l.disponibilidade.pronto
                          ? "Pronto"
                          : l.disponibilidade.data_prevista
                            ? dataBr(l.disponibilidade.data_prevista)
                            : "sem previsão"}
                      </div>
                    </div>
                  );
                })}
                <p className={styles.hint} style={{ margin: "6px 0 0" }}>
                  <span style={{ color: "var(--brand)" }}>■</span> Pré-engorda (repicagem) ·{" "}
                  <span style={{ color: "var(--ok)" }}>■</span> Engorda (abate)
                </p>
              </>
            )}

            <div className={styles.section}>Sugestões de repicagem</div>
            <PainelSugestaoRepicagem />
          </>
        )}
      </div>
    </div>
  );
}
