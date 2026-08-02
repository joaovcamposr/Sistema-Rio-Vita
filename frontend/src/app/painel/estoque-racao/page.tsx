"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { painelEstoqueRacao, type EstoqueRacao } from "@/lib/paineis";
import styles from "../painel.module.css";

function nf(v: number, casas = 1): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export default function PainelEstoqueRacao() {
  const router = useRouter();
  const [dados, setDados] = useState<EstoqueRacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    painelEstoqueRacao().then(setDados).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/painel")}>
          ←
        </button>
        <div>
          <h1>Estoque de ração</h1>
          <div className={styles.sub}>Chegadas menos consumo, acumulado por tipo</div>
        </div>
      </div>
      <div className={styles.body}>
        {erro && <div className={styles.erro}>{erro}</div>}
        {!dados && !erro && <div className={styles.carregando}>Carregando…</div>}

        {dados && (
          <>
            <div className={styles.cards}>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Estoque total</div>
                <div className={styles.cardValue}>{nf(dados.saldo_total_sacos, 0)} sacos</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Consumo previsto por dia</div>
                <div className={styles.cardValue}>{nf(dados.consumo_total_sacos_dia, 1)} sacos</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Acaba em</div>
                <div className={styles.cardValue}>
                  {dados.dias_restantes_total !== null ? `${Math.round(dados.dias_restantes_total)} dias` : "—"}
                </div>
                {dados.data_prevista_proxima_carga && (
                  <div className={styles.cardSub}>Pedir a próxima carga até {dataBr(dados.data_prevista_proxima_carga)}</div>
                )}
              </div>
            </div>

            {dados.sacos_sem_tipo_informado_ultimos_30_dias > 0 && (
              <p className={styles.hint} style={{ color: "var(--warn)" }}>
                {nf(dados.sacos_sem_tipo_informado_ultimos_30_dias, 1)} sacos lançados nos últimos 30 dias sem tipo de
                ração informado no arraçoamento — não entram nesse cálculo.
              </p>
            )}

            <div className={styles.section}>Por tipo</div>
            <p className={styles.hint}>
              &quot;Sugestão&quot; é quanto pedir pra manter 30 dias de estoque desse tipo, com base no consumo
              previsto de hoje.
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.tabela}>
                <thead>
                  <tr>
                    <th>Fornecedor</th><th>Tipo</th><th>Chegou</th><th>Consumido</th><th>Saldo</th>
                    <th>Consumo/dia</th><th>Acaba em</th><th>Sugestão p/ próxima carga</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.por_tipo.map((t) => (
                    <tr key={t.tipo_racao_id}>
                      <td>{t.fornecedor_nome}</td>
                      <td>{t.tipo_racao_codigo}</td>
                      <td>{nf(t.chegou_sacos, 0)}</td>
                      <td>{nf(t.consumido_sacos, 0)}</td>
                      <td style={{ fontWeight: 700 }}>{nf(t.saldo_sacos, 0)}</td>
                      <td>{t.consumo_sacos_dia !== null ? nf(t.consumo_sacos_dia, 1) : "—"}</td>
                      <td>{t.dias_restantes !== null ? `${Math.round(t.dias_restantes)} dias` : "—"}</td>
                      <td>{t.sacos_sugeridos_proxima_carga !== null ? `${nf(t.sacos_sugeridos_proxima_carga, 0)} sacos` : "—"}</td>
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
