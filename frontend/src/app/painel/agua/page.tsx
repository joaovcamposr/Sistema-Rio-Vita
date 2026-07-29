"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { painelAgua, type AguaViveiro } from "@/lib/paineis";
import styles from "../painel.module.css";

function nf(v: number, casas = 1): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function Sparkline({ valores, cor }: { valores: number[]; cor: string }) {
  if (valores.length < 2) return null;
  const w = 220;
  const h = 44;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const faixa = max - min || 1;
  const pontos = valores
    .map((v, i) => {
      const x = (i / (valores.length - 1)) * (w - 6) + 3;
      const y = h - 4 - ((v - min) / faixa) * (h - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={styles.sparkline}>
      <polyline points={pontos} fill="none" stroke={cor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PainelAgua() {
  const router = useRouter();
  const [dados, setDados] = useState<AguaViveiro[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    painelAgua().then(setDados).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/painel")}>
          ←
        </button>
        <div>
          <h1>Análise da água</h1>
          <div className={styles.sub}>Últimos 60 dias, por viveiro</div>
        </div>
      </div>
      <div className={styles.body}>
        {erro && <div className={styles.erro}>{erro}</div>}
        {!dados && !erro && <div className={styles.carregando}>Carregando…</div>}
        {dados && dados.length === 0 && <p className={styles.hint}>Nenhuma análise nos últimos 60 dias.</p>}
        {dados && dados.length > 0 && (
          <div className={styles.grid}>
            {dados.map((v) => {
              const ultimo = v.serie[v.serie.length - 1];
              return (
                <div key={v.viveiro_id} className={styles.pond}>
                  <div className={styles.pondHead}>
                    <span className={styles.pondNome}>Viveiro {v.viveiro_codigo}</span>
                    <span className={styles.pondTipo}>{v.serie.length} medições</span>
                  </div>

                  {ultimo.oxigenio !== null && (
                    <div style={{ marginBottom: 10 }}>
                      <div className={styles.linha} style={{ border: "none", padding: "0 0 4px" }}>
                        <span className={styles.k}>Oxigênio (ideal &gt; 4)</span>
                        <span className={styles.v}>{nf(ultimo.oxigenio)} mg/L</span>
                      </div>
                      <Sparkline
                        valores={v.serie.filter((p) => p.oxigenio !== null).map((p) => p.oxigenio as number)}
                        cor="var(--brand)"
                      />
                    </div>
                  )}

                  {ultimo.ph !== null && (
                    <div style={{ marginBottom: 10 }}>
                      <div className={styles.linha} style={{ border: "none", padding: "0 0 4px" }}>
                        <span className={styles.k}>pH (ideal 6 a 8)</span>
                        <span className={styles.v}>{nf(ultimo.ph)}</span>
                      </div>
                      <Sparkline
                        valores={v.serie.filter((p) => p.ph !== null).map((p) => p.ph as number)}
                        cor="var(--brand-deep)"
                      />
                    </div>
                  )}

                  {ultimo.amonia !== null && (
                    <div className={styles.linha}>
                      <span className={styles.k}>Amônia (ideal &lt; 1)</span>
                      <span className={styles.v}>{nf(ultimo.amonia, 2)} mg/L</span>
                    </div>
                  )}
                  {ultimo.temperatura_c !== null && (
                    <div className={styles.linha}>
                      <span className={styles.k}>Temperatura</span>
                      <span className={styles.v}>{nf(ultimo.temperatura_c)} °C</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
