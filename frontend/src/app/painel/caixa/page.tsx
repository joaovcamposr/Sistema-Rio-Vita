"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { caixaConferencia, painelCaixa, type CaixaConferencia, type CaixaResumo } from "@/lib/paineis";
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
  const [conferencia, setConferencia] = useState<CaixaConferencia | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setDados(null);
    setConferencia(null);
    painelCaixa(de, ate).then(setDados).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
    caixaConferencia(de, ate).then(setConferencia).catch(() => undefined);
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

            {conferencia && (
              <>
                <div className={styles.section}>Conferência — dinheiro que realmente entrou</div>
                <p className={styles.hint}>
                  Os cartões acima somam pela data da venda; venda "a prazo" já entra lá no dia em que foi lançada,
                  mesmo sem o dinheiro ter chegado ainda. Aqui embaixo é pela data em que a venda foi marcada como
                  paga — mais parecido com o que deveria estar na gaveta.
                </p>
                <div className={styles.cards}>
                  <div className={styles.card}>
                    <div className={styles.cardLabel}>Recebido em dinheiro no período</div>
                    <div className={styles.cardValue}>{moeda(conferencia.total_recebido_dinheiro)}</div>
                  </div>
                  <div className={styles.card}>
                    <div className={styles.cardLabel}>Ainda a receber (lançado, não pago)</div>
                    <div className={styles.cardValue}>{moeda(conferencia.total_pendente_dinheiro)}</div>
                  </div>
                  <div className={styles.card}>
                    <div className={styles.cardLabel}>Saldo real (recebido − despesas)</div>
                    <div className={styles.cardValue}>{moeda(conferencia.saldo_recebido)}</div>
                  </div>
                </div>

                {conferencia.formas_fora_padrao.length > 0 && (
                  <>
                    <div className={styles.section}>
                      Forma de pagamento fora do padrão ({conferencia.formas_fora_padrao.length})
                    </div>
                    <p className={styles.hint}>
                      Nem Dinheiro, nem Pix, Boleto ou Cheque — provável erro de digitação. Esses lançamentos não
                      entram em nenhum total de dinheiro do Caixa, nem no de cima nem no de baixo.
                    </p>
                    <div className={styles.tableWrap} style={{ marginBottom: 18 }}>
                      <table className={styles.tabela}>
                        <thead><tr><th>Tipo</th><th>Data</th><th>Quem/o quê</th><th>Valor</th><th>Forma digitada</th></tr></thead>
                        <tbody>
                          {conferencia.formas_fora_padrao.map((f) => (
                            <tr key={`${f.tipo}-${f.id}`}>
                              <td>{f.tipo === "venda" ? "Venda" : "Despesa"}</td>
                              <td>{dataBr(f.data)}</td>
                              <td>{f.referencia}</td>
                              <td>{moeda(f.valor)}</td>
                              <td>{f.forma_pgto ?? <em>vazio</em>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
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
