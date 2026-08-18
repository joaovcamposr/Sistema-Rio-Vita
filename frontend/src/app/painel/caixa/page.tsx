"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { painelCaixa, type CaixaResumo } from "@/lib/paineis";
import styles from "../painel.module.css";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function diasAtras(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function PainelCaixa() {
  const router = useRouter();
  const [de, setDe] = useState(diasAtras(30));
  const [ate, setAte] = useState(hojeISO());
  const [dados, setDados] = useState<CaixaResumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setDados(null);
    painelCaixa(de, ate).then(setDados).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }, [de, ate]);

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/painel")}>
          ←
        </button>
        <div>
          <h1>Caixa</h1>
          <div className={styles.sub}>Conferência do dinheiro — vendas em dinheiro menos despesas em dinheiro</div>
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
            <div className={styles.cards}>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Vendas em dinheiro</div>
                <div className={styles.cardValue}>{moeda(dados.total_vendas_dinheiro)}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Despesas em dinheiro</div>
                <div className={styles.cardValue}>{moeda(dados.total_despesas_dinheiro)}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Saldo do período</div>
                <div className={styles.cardValue}>{moeda(dados.saldo)}</div>
              </div>
            </div>

            {dados.expedicoes_abertas.length > 0 && (
              <>
                <div className={styles.section}>Expedições em aberto agora</div>
                <div className={styles.tableWrap}>
                  <table className={styles.tabela}>
                    <thead><tr><th>Entregador</th><th>Saída</th><th>Dias em aberto</th></tr></thead>
                    <tbody>
                      {dados.expedicoes_abertas.map((e) => (
                        <tr key={e.id}>
                          <td>{e.vendedor_nome}</td>
                          <td>{dataBr(e.data_saida)}</td>
                          <td>{e.dias_em_aberto}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className={styles.section}>Histórico diário</div>
            {dados.dias.length === 0 && <p className={styles.hint}>Nenhuma venda ou despesa em dinheiro no período.</p>}
            {dados.dias.length > 0 && (
              <div className={styles.tableWrap}>
                <table className={styles.tabela}>
                  <thead><tr><th>Dia</th><th>Vendas</th><th>Despesas</th><th>Saldo</th></tr></thead>
                  <tbody>
                    {[...dados.dias].reverse().map((d) => (
                      <tr key={d.dia}>
                        <td>{dataBr(d.dia)}</td>
                        <td>{moeda(d.vendas_dinheiro)}</td>
                        <td>{moeda(d.despesas_dinheiro)}</td>
                        <td style={{ fontWeight: 700 }}>{moeda(d.saldo)}</td>
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
