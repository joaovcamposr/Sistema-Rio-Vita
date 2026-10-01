"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { caixaConferencia, type CaixaConferencia, type VendaConferencia, type DespesaConferencia } from "@/lib/paineis";
import Modal from "@/components/Modal";
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

type Modalidade =
  | { tipo: "recebido" }
  | { tipo: "pendente" }
  | { tipo: "fora_periodo" }
  | { tipo: "despesas" }
  | { tipo: "dia"; dia: string };

function TabelaVendas({ vendas, busca = false }: { vendas: VendaConferencia[]; busca?: boolean }) {
  const [filtro, setFiltro] = useState("");
  const filtradas = useMemo(() => {
    const alvo = filtro.trim().toLowerCase();
    if (!alvo) return vendas;
    return vendas.filter(
      (v) => v.cliente_nome.toLowerCase().includes(alvo) || v.produto_nome.toLowerCase().includes(alvo)
    );
  }, [vendas, filtro]);

  return (
    <>
      {busca && vendas.length > 8 && (
        <input
          type="text" placeholder="Filtrar por cliente ou produto…" value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          style={{
            width: "100%", padding: "9px 12px", borderRadius: 9, border: "1px solid var(--rule-strong)",
            background: "var(--surface)", color: "var(--ink)", fontSize: "0.85rem", marginBottom: 10,
          }}
        />
      )}
      {filtradas.length === 0 && <p className={styles.hint}>Nenhuma venda aqui.</p>}
      {filtradas.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.tabela}>
            <thead><tr><th>Cliente</th><th>Produto</th><th>Valor</th><th>Vendida em</th><th>Paga em</th><th></th></tr></thead>
            <tbody>
              {filtradas.map((v) => (
                <tr key={v.parcela_id}>
                  <td>{v.cliente_nome}</td>
                  <td>{v.produto_nome}</td>
                  <td>{moeda(v.valor)}</td>
                  <td>
                    {dataBr(v.data)}
                    {v.fora_do_periodo && (
                      <span className={`${styles.badge} ${styles.badgeWarn}`} style={{ marginLeft: 6 }}>
                        antes do período
                      </span>
                    )}
                  </td>
                  <td>{v.data_pagamento ? dataBr(v.data_pagamento) : "—"}</td>
                  <td>
                    <Link href={`/lancar/recebimentos?editar=${v.venda_id}`} style={{ color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.82rem" }}>
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function TabelaDespesas({ despesas }: { despesas: DespesaConferencia[] }) {
  if (despesas.length === 0) return <p className={styles.hint}>Nenhuma despesa aqui.</p>;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.tabela}>
        <thead><tr><th>Categoria</th><th>Origem</th><th>Forma</th><th>Valor</th><th></th></tr></thead>
        <tbody>
          {despesas.map((d) => (
            <tr key={d.id}>
              <td>{d.categoria}</td>
              <td>{d.origem}</td>
              <td>{d.forma_pgto ?? <em>vazio</em>}</td>
              <td>{moeda(d.valor)}</td>
              <td>
                {d.origem === "Solta" ? (
                  <Link href={`/painel/despesas?editar=${d.id}`} style={{ color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.82rem" }}>
                    Editar
                  </Link>
                ) : (
                  <Link href="/painel/acertos" style={{ color: "var(--ink-faint)", fontSize: "0.78rem" }}>
                    ver acerto
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PainelCaixa() {
  const router = useRouter();
  const [de, setDe] = useState(diasAtras(30));
  const [ate, setAte] = useState(hojeISO());
  const [conferencia, setConferencia] = useState<CaixaConferencia | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modal, setModal] = useState<Modalidade | null>(null);

  useEffect(() => {
    setConferencia(null);
    caixaConferencia(de, ate).then(setConferencia).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }, [de, ate]);

  const vendasDoDia = useMemo(() => {
    if (!conferencia || modal?.tipo !== "dia") return [];
    return conferencia.vendas_recebidas.filter((v) => v.data_pagamento === modal.dia);
  }, [conferencia, modal]);
  const despesasDoDia = useMemo(() => {
    if (!conferencia || modal?.tipo !== "dia") return [];
    return conferencia.despesas_detalhe.filter((d) => d.data === modal.dia);
  }, [conferencia, modal]);
  const vendasForaPeriodo = useMemo(
    () => conferencia?.vendas_recebidas.filter((v) => v.fora_do_periodo) ?? [],
    [conferencia]
  );
  const despesasDinheiro = useMemo(
    () => conferencia?.despesas_detalhe.filter((d) => d.forma_pgto?.trim().toLowerCase() === "dinheiro") ?? [],
    [conferencia]
  );

  function cardClicavel(): string {
    return `${styles.card} ${styles.cardClicavel}`;
  }

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/painel")}>
          ←
        </button>
        <div>
          <h1>Caixa</h1>
          <div className={styles.sub}>Efeito caixa — dinheiro que realmente entrou e saiu, não o que foi lançado</div>
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
        {!conferencia && !erro && <div className={styles.carregando}>Carregando…</div>}

        {conferencia && (
          <>
            <p className={styles.hint}>
              "Recebido" e "Despesas" são pela data em que o dinheiro realmente entrou/saiu — venda "a prazo" só
              conta aqui no dia em que for marcada como paga, não no dia em que foi vendida. Clique nos cartões pra
              ver quais foram.
            </p>
            <div className={styles.cards}>
              <button type="button" className={cardClicavel()} onClick={() => setModal({ tipo: "recebido" })}>
                <div className={styles.cardLabel}>Recebido em dinheiro no período</div>
                <div className={styles.cardValue}>{moeda(conferencia.total_recebido_dinheiro)}</div>
              </button>
              <button type="button" className={cardClicavel()} onClick={() => setModal({ tipo: "pendente" })}>
                <div className={styles.cardLabel}>Ainda a receber (vendido, não pago)</div>
                <div className={styles.cardValue}>{moeda(conferencia.total_pendente_dinheiro)}</div>
              </button>
              <button type="button" className={cardClicavel()} onClick={() => setModal({ tipo: "despesas" })}>
                <div className={styles.cardLabel}>Despesas em dinheiro</div>
                <div className={styles.cardValue}>{moeda(conferencia.total_despesas_dinheiro)}</div>
              </button>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Saldo real (recebido − despesas)</div>
                <div className={styles.cardValue}>{moeda(conferencia.saldo_recebido)}</div>
              </div>
            </div>

            {conferencia.total_recebido_fora_do_periodo > 0 && (
              <button
                type="button"
                onClick={() => setModal({ tipo: "fora_periodo" })}
                className={cardClicavel()}
                style={{ display: "block", width: "100%", marginBottom: 18, borderColor: "var(--warn)" }}
              >
                <div className={styles.cardLabel}>⚠ Recebido agora, mas vendido antes do período</div>
                <div className={styles.cardValue}>{moeda(conferencia.total_recebido_fora_do_periodo)}</div>
                <div className={styles.cardSub}>
                  Parte do "Recebido" acima é pagamento de venda feita antes de {dataBr(de)} — clique pra ver quais.
                </div>
              </button>
            )}

            {conferencia.expedicoes_abertas.length > 0 && (
              <>
                <div className={styles.section}>Expedições em aberto agora</div>
                <div className={styles.tableWrap} style={{ marginBottom: 18 }}>
                  <table className={styles.tabela}>
                    <thead><tr><th>Entregador</th><th>Saída</th><th>Dias em aberto</th></tr></thead>
                    <tbody>
                      {conferencia.expedicoes_abertas.map((e) => (
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
            <p className={styles.hint}>Clique num dia pra ver quais vendas e despesas o compõem.</p>
            {conferencia.dias.length === 0 && <p className={styles.hint}>Nenhuma venda recebida ou despesa em dinheiro no período.</p>}
            {conferencia.dias.length > 0 && (
              <div className={styles.tableWrap} style={{ marginBottom: 18 }}>
                <table className={styles.tabela}>
                  <thead><tr><th>Dia</th><th>Recebido</th><th>Despesas</th><th>Saldo</th></tr></thead>
                  <tbody>
                    {[...conferencia.dias].reverse().map((d) => (
                      <tr key={d.dia} style={{ cursor: "pointer" }} onClick={() => setModal({ tipo: "dia", dia: d.dia })}>
                        <td style={{ color: "var(--brand-deep)", fontWeight: 700 }}>{dataBr(d.dia)}</td>
                        <td>{moeda(d.recebido_dinheiro)}</td>
                        <td>{moeda(d.despesas_dinheiro)}</td>
                        <td style={{ fontWeight: 700 }}>{moeda(d.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className={styles.section}>Todas as despesas do período, por forma de pagamento</div>
            <p className={styles.hint}>
              O Caixa só soma despesas em Dinheiro. Aqui embaixo entram todas, de qualquer forma, pra comparar o
              total geral com o total só de dinheiro e ver se sobrou alguma coisa de fora.
            </p>
            <div className={styles.tableWrap} style={{ marginBottom: 18 }}>
              <table className={styles.tabela}>
                <thead><tr><th>Forma de pagamento</th><th>Quantidade</th><th>Total</th></tr></thead>
                <tbody>
                  {conferencia.despesas_por_forma.length === 0 && (
                    <tr><td colSpan={3} className={styles.hint}>Nenhuma despesa no período.</td></tr>
                  )}
                  {conferencia.despesas_por_forma.map((d) => (
                    <tr key={d.forma_pgto}>
                      <td>{d.forma_pgto}</td>
                      <td>{d.quantidade}</td>
                      <td>{moeda(d.total)}</td>
                    </tr>
                  ))}
                  {conferencia.despesas_por_forma.length > 0 && (
                    <tr style={{ fontWeight: 700 }}>
                      <td>Total geral</td>
                      <td></td>
                      <td>{moeda(conferencia.total_despesas_todas_formas)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className={styles.section}>Despesas do período, uma por uma</div>
            <p className={styles.hint}>
              Inclui as despesas soltas e as lançadas dentro de um acerto de expedição — essas últimas aparecem
              como "Expedição — nome do entregador".
            </p>
            <div className={styles.tableWrap} style={{ marginBottom: 18 }}>
              <TabelaDespesas despesas={conferencia.despesas_detalhe} />
            </div>

            {conferencia.formas_fora_padrao.length > 0 && (
              <>
                <div className={styles.section}>
                  Forma de pagamento fora do padrão ({conferencia.formas_fora_padrao.length})
                </div>
                <p className={styles.hint}>
                  Nem Dinheiro, nem Pix, Boleto ou Cheque — provável erro de digitação. Esses lançamentos não entram
                  em nenhum total de dinheiro do Caixa.
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
      </div>

      {modal?.tipo === "recebido" && (
        <Modal titulo="Recebido em dinheiro no período" subtitulo="Pela data em que a venda foi marcada como paga" onFechar={() => setModal(null)}>
          <TabelaVendas vendas={conferencia?.vendas_recebidas ?? []} busca />
        </Modal>
      )}
      {modal?.tipo === "pendente" && (
        <Modal titulo="Ainda a receber" subtitulo="Vendida em dinheiro no período, ainda sem data de pagamento" onFechar={() => setModal(null)}>
          <TabelaVendas vendas={conferencia?.vendas_pendentes ?? []} busca />
        </Modal>
      )}
      {modal?.tipo === "fora_periodo" && (
        <Modal titulo="Recebido agora, vendido antes do período" subtitulo={`Vendas anteriores a ${dataBr(de)}, pagas dentro do período filtrado`} onFechar={() => setModal(null)}>
          <TabelaVendas vendas={vendasForaPeriodo} busca />
        </Modal>
      )}
      {modal?.tipo === "despesas" && (
        <Modal titulo="Despesas em dinheiro no período" subtitulo="Mesmas despesas que compõem o cartão — pela data da despesa" onFechar={() => setModal(null)}>
          <TabelaDespesas despesas={despesasDinheiro} />
        </Modal>
      )}
      {modal?.tipo === "dia" && (
        <Modal titulo={dataBr(modal.dia)} subtitulo="Vendas recebidas e despesas desse dia" onFechar={() => setModal(null)}>
          <div className={styles.section} style={{ marginTop: 0 }}>Vendas recebidas</div>
          <TabelaVendas vendas={vendasDoDia} />
          <div className={styles.section}>Despesas</div>
          <TabelaDespesas despesas={despesasDoDia} />
        </Modal>
      )}
    </div>
  );
}
