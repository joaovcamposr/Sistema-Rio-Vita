"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { painelAbate, type Abate } from "@/lib/paineis";
import styles from "../painel.module.css";

function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export default function PainelAbate() {
  const router = useRouter();
  const [dados, setDados] = useState<Abate[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    painelAbate().then(setDados).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }, []);

  const prontos = dados?.filter((a) => a.pronto).length ?? 0;

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/painel")}>
          ←
        </button>
        <div>
          <h1>Programação de abate</h1>
          <div className={styles.sub}>Projeção pela última biometria + curva de crescimento</div>
        </div>
      </div>
      <div className={styles.body}>
        {erro && <div className={styles.erro}>{erro}</div>}
        {!dados && !erro && <div className={styles.carregando}>Carregando…</div>}
        {dados && (
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
    </div>
  );
}
