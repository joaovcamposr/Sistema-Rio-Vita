"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { listarViveirosTodos, type ViveiroAtivo } from "@/lib/api";
import { painelViveiros, painelAbate, type PainelViveiro, type Abate } from "@/lib/paineis";
import PainelSugestaoRepicagem from "@/components/PainelSugestaoRepicagem";
import styles from "../painel.module.css";

const TIPO_LABEL: Record<string, string> = {
  pre_engorda: "Pré-engorda",
  engorda: "Engorda",
  decantacao: "Decantação",
};

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
  abate: Abate | null;
}

export default function ProgramacaoRepicagem() {
  const router = useRouter();
  const [viveiros, setViveiros] = useState<ViveiroAtivo[] | null>(null);
  const [detalhes, setDetalhes] = useState<PainelViveiro[] | null>(null);
  const [abates, setAbates] = useState<Abate[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listarViveirosTodos(), painelViveiros(), painelAbate()])
      .then(([v, d, a]) => { setViveiros(v); setDetalhes(d); setAbates(a); })
      .catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }, []);

  const linhas: LinhaTanque[] | null = useMemo(() => {
    if (!viveiros || !detalhes || !abates) return null;
    const detalhePorCodigo = new Map(detalhes.map((d) => [d.codigo, d]));
    const abatePorCodigo = new Map(abates.map((a) => [a.viveiro_codigo, a]));
    return viveiros.map((v) => {
      const detalhe = detalhePorCodigo.get(v.codigo) ?? null;
      const abate = abatePorCodigo.get(v.codigo) ?? null;
      let status: Status;
      if (!v.ativo) status = "inativo";
      else if (v.tipo === "decantacao") status = "decantacao";
      else if (!detalhe?.lote_atual) status = "disponivel";
      else status = "ocupado";
      return { viveiro: v, status, detalhe, abate };
    });
  }, [viveiros, detalhes, abates]);

  const disponiveisAgora = useMemo(() => linhas?.filter((l) => l.status === "disponivel") ?? [], [linhas]);

  const disponibilidadePrevista = useMemo(() => {
    if (!linhas) return [];
    return linhas
      .filter((l) => l.status === "ocupado" && l.abate !== null)
      .map((l) => ({ ...l, abate: l.abate as Abate }))
      .sort((a, b) => {
        if (a.abate.pronto !== b.abate.pronto) return a.abate.pronto ? -1 : 1;
        const da = a.abate.previsao_abate ?? "9999-99-99";
        const db_ = b.abate.previsao_abate ?? "9999-99-99";
        return da.localeCompare(db_);
      });
  }, [linhas]);

  const emBreveCount = useMemo(
    () =>
      disponibilidadePrevista.filter(
        (l) => l.abate.pronto || (l.abate.previsao_abate && diasAtePrevisao(l.abate.previsao_abate) <= HORIZONTE_EM_BREVE_DIAS)
      ).length,
    [disponibilidadePrevista]
  );

  const areaTotalM2 = useMemo(
    () => linhas?.filter((l) => l.viveiro.ativo).reduce((s, l) => s + l.viveiro.area_m2, 0) ?? 0,
    [linhas]
  );

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
                    ? `${nf(disponiveisAgora.reduce((s, l) => s + l.viveiro.area_m2, 0))} m² livres`
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
                  <tr><th>Viveiro</th><th>Tipo</th><th>Área (m²)</th><th>Status</th><th>Detalhe</th></tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.viveiro.id}>
                      <td>{l.viveiro.codigo}</td>
                      <td>{TIPO_LABEL[l.viveiro.tipo]}</td>
                      <td>{nf(l.viveiro.area_m2, 1)}</td>
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
                            {l.abate && (
                              l.abate.pronto
                                ? " · pronto para abate"
                                : l.abate.previsao_abate
                                  ? ` · disponível a partir de ${dataBr(l.abate.previsao_abate)}`
                                  : ""
                            )}
                          </>
                        )}
                        {l.status === "disponivel" && "Pronto para receber lote ou repicagem"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.section}>Vão ficar disponíveis em breve</div>
            <p className={styles.hint} style={{ margin: "0 0 8px" }}>
              Projeção pela última biometria + curva de crescimento — mesma base da Programação de abate. Assume
              despesca total do tanque quando o lote atinge a idade de abate (semana {abates?.[0]?.semana_limite ?? 26}).
            </p>
            {disponibilidadePrevista.length === 0 && (
              <p className={styles.hint}>Nenhum tanque ocupado com previsão calculada.</p>
            )}
            {disponibilidadePrevista.length > 0 && (
              <div className={styles.tableWrap}>
                <table className={styles.tabela}>
                  <thead>
                    <tr><th>Viveiro</th><th>Lote</th><th>Peso atual</th><th>Semana atual / limite</th><th>Disponível a partir de</th></tr>
                  </thead>
                  <tbody>
                    {disponibilidadePrevista.map((l) => (
                      <tr key={l.viveiro.id}>
                        <td>{l.viveiro.codigo}</td>
                        <td>{l.abate.lote_codigo}</td>
                        <td>{nf(l.abate.peso_medio_g)} g</td>
                        <td>{l.abate.semana_atual} / {l.abate.semana_limite}</td>
                        <td>
                          {l.abate.pronto ? (
                            <span className={`${styles.badge} ${styles.badgeCrit}`}>Pronto agora — falta despescar</span>
                          ) : (
                            <span className={`${styles.badge} ${styles.badgeNeutro}`}>
                              {l.abate.previsao_abate ? dataBr(l.abate.previsao_abate) : "—"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className={styles.section}>Sugestões de repicagem</div>
            <PainelSugestaoRepicagem />
          </>
        )}
      </div>
    </div>
  );
}
