"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { painelMortalidade, type MortalidadeResumo } from "@/lib/paineis";
import styles from "../painel.module.css";

function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
function pct(v: number): string {
  return `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export default function PainelMortalidade() {
  const router = useRouter();
  const [dados, setDados] = useState<MortalidadeResumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    painelMortalidade().then(setDados).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/painel")}>
          ←
        </button>
        <div>
          <h1>Mortalidade por fase</h1>
          <div className={styles.sub}>Só entra aqui o lote já encerrado (repicagem ou despesca total)</div>
        </div>
      </div>
      <div className={styles.body}>
        {erro && <div className={styles.erro}>{erro}</div>}
        {!dados && !erro && <div className={styles.carregando}>Carregando…</div>}
        {dados && (
          <>
            <div className={styles.cards}>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Pré-engorda (povoamento → repicagem)</div>
                <div className={styles.cardValue}>
                  {dados.taxa_media_pre_engorda !== null ? pct(dados.taxa_media_pre_engorda) : "—"}
                </div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Engorda (repicagem/povoamento → abate)</div>
                <div className={styles.cardValue}>
                  {dados.taxa_media_engorda !== null ? pct(dados.taxa_media_engorda) : "—"}
                </div>
              </div>
            </div>

            {dados.lotes.length === 0 && <p className={styles.hint}>Nenhum lote encerrado ainda.</p>}
            {dados.lotes.length > 0 && (
              <div className={styles.tableWrap}>
                <table className={styles.tabela}>
                  <thead>
                    <tr>
                      <th>Lote</th>
                      <th>Fase</th>
                      <th>Viveiro</th>
                      <th>Início → Fim</th>
                      <th>Dias</th>
                      <th>Inicial</th>
                      <th>Perdida</th>
                      <th>Taxa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.lotes.map((l) => (
                      <tr key={l.lote_id}>
                        <td>{l.lote_codigo}</td>
                        <td>{l.fase === "pre_engorda" ? "Pré-engorda" : "Engorda"}</td>
                        <td>{l.viveiro_codigo}</td>
                        <td>{dataBr(l.data_inicio)} → {dataBr(l.data_fim)}</td>
                        <td>{l.dias}</td>
                        <td>{l.quantidade_inicial.toLocaleString("pt-BR")}</td>
                        <td>{l.quantidade_perdida.toLocaleString("pt-BR")}</td>
                        <td style={{ fontWeight: 700 }}>{pct(l.taxa)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
