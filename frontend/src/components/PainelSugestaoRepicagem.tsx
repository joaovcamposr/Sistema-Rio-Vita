"use client";

import { useEffect, useState } from "react";
import {
  sugestaoRepicagem, projecaoCapacidade,
  type SugestaoRepicagemGeral, type NivelRepicagem, type ProjecaoCapacidade,
} from "@/lib/paineis";
import styles from "@/app/painel/painel.module.css";

function nf(v: number, casas = 0): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function dataBrLonga(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

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

/**
 * Sugestão de repicagem (3 níveis, situação de hoje) + projeção de
 * capacidade (quando cada tanque ativo vai estourar a densidade, e como
 * resolver com antecedência) — mesmo motor usado pelo Dashboard, extraído
 * pra ser reaproveitado também na Programação de repicagem.
 */
export default function PainelSugestaoRepicagem() {
  const [sugestoes, setSugestoes] = useState<SugestaoRepicagemGeral | null>(null);
  const [projecao, setProjecao] = useState<ProjecaoCapacidade | null>(null);

  useEffect(() => {
    sugestaoRepicagem().then(setSugestoes).catch(() => {});
    projecaoCapacidade().then(setProjecao).catch(() => {});
  }, []);

  return (
    <>
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
      {sugestoes && sugestoes.tanques_acima_do_limite.length === 0 && (
        <p className={styles.hint}>Nenhum tanque está acima do limite de densidade agora.</p>
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
            Projeção considerando a curva de crescimento de cada lote ativo, na ordem em que cada necessidade deve
            surgir. Prioridade: repicar primeiro, despescar (≥ 600g) depois, ativar tanque hoje inativo só por
            último.
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
  );
}
