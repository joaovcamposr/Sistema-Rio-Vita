"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  atualizarObservacoesVenda,
  listarClientes,
  listarVendas,
  listarVendedoresDeVenda,
  marcarPagamentoVenda,
  type Cliente,
  type VendaLista,
} from "@/lib/api";
import styles from "../../cadastros/cadastros.module.css";

const FORMAS_RECEBIMENTO = ["Pix", "Dinheiro", "Boleto", "Cheque"];

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
function estaPago(situacao: string | null): boolean {
  return (situacao ?? "").trim().toLowerCase().startsWith("pag");
}
function estaVencida(v: VendaLista): boolean {
  if (estaPago(v.situacao) || !v.cliente_prazo_dias) return false;
  const vencimento = new Date(v.data);
  vencimento.setDate(vencimento.getDate() + v.cliente_prazo_dias);
  return vencimento < new Date(hojeISO());
}

export default function Recebimentos() {
  const router = useRouter();
  const [de, setDe] = useState(diasAtras(90));
  const [ate, setAte] = useState(hojeISO());
  const [situacaoFiltro, setSituacaoFiltro] = useState("Em aberto");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteFiltro, setClienteFiltro] = useState<number | null>(null);
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [vendedorFiltro, setVendedorFiltro] = useState("");
  const [vendas, setVendas] = useState<VendaLista[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [dataPag, setDataPag] = useState(hojeISO());
  const [formaPag, setFormaPag] = useState(FORMAS_RECEBIMENTO[0]);
  const [salvando, setSalvando] = useState(false);
  const [editandoObs, setEditandoObs] = useState<number | null>(null);
  const [obsValor, setObsValor] = useState("");
  const [salvandoObs, setSalvandoObs] = useState(false);

  function carregar() {
    setErro(null);
    listarVendas({
      de, ate,
      situacao: situacaoFiltro === "Todas" ? undefined : situacaoFiltro,
      clienteId: clienteFiltro,
      vendedor: vendedorFiltro || null,
    })
      .then(setVendas)
      .catch(() => setErro("Não foi possível carregar as vendas."));
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [de, ate, situacaoFiltro, clienteFiltro, vendedorFiltro]);

  useEffect(() => {
    listarClientes().then(setClientes).catch(() => undefined);
    listarVendedoresDeVenda().then(setVendedores).catch(() => undefined);
  }, []);

  const totalEmAberto = useMemo(() => {
    if (!vendas) return 0;
    return vendas.filter((v) => !estaPago(v.situacao)).reduce((s, v) => s + v.valor_total, 0);
  }, [vendas]);

  function iniciarPagamento(v: VendaLista) {
    setEditando(v.id);
    setDataPag(hojeISO());
    setFormaPag(v.forma_pgto && FORMAS_RECEBIMENTO.includes(v.forma_pgto) ? v.forma_pgto : FORMAS_RECEBIMENTO[0]);
  }

  async function confirmarPagamento(vendaId: number) {
    setSalvando(true);
    try {
      await marcarPagamentoVenda(vendaId, "Pago", dataPag, formaPag);
      setEditando(null);
      carregar();
    } catch {
      setErro("Não foi possível salvar o pagamento.");
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicaoObs(v: VendaLista) {
    setEditandoObs(v.id);
    setObsValor(v.observacoes ?? "");
  }

  async function salvarObs(vendaId: number) {
    setSalvandoObs(true);
    try {
      await atualizarObservacoesVenda(vendaId, obsValor.trim() || null);
      setEditandoObs(null);
      carregar();
    } catch {
      setErro("Não foi possível salvar a observação.");
    } finally {
      setSalvandoObs(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/")}>
          ←
        </button>
        <div>
          <h1>Recebimentos</h1>
          <div className={styles.sub}>Vendas a prazo — controle de quem já pagou</div>
        </div>
      </div>
      <div className={styles.body}>
        {erro && <div className={styles.error}>{erro}</div>}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, alignItems: "flex-end" }}>
          <div className={styles.field} style={{ margin: 0 }}>
            <label>De</label>
            <input className={styles.inp} type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className={styles.field} style={{ margin: 0 }}>
            <label>Até</label>
            <input className={styles.inp} type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div className={styles.field} style={{ margin: 0 }}>
            <label>Situação</label>
            <select className={styles.inp} value={situacaoFiltro} onChange={(e) => setSituacaoFiltro(e.target.value)}>
              <option value="Em aberto">Em aberto</option>
              <option value="Pago">Pago</option>
              <option value="Todas">Todas</option>
            </select>
          </div>
          <div className={styles.field} style={{ margin: 0 }}>
            <label>Cliente</label>
            <select
              className={styles.inp}
              value={clienteFiltro ?? ""}
              onChange={(e) => setClienteFiltro(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Todos os clientes</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className={styles.field} style={{ margin: 0 }}>
            <label>Vendedor</label>
            <select className={styles.inp} value={vendedorFiltro} onChange={(e) => setVendedorFiltro(e.target.value)}>
              <option value="">Todos</option>
              {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>

        {vendas && situacaoFiltro !== "Pago" && (
          <p className={styles.hint} style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--ink)" }}>
            Total em aberto no período: {moeda(totalEmAberto)}
          </p>
        )}

        {!vendas && !erro && <p className={styles.hint}>Carregando…</p>}
        {vendas && vendas.length === 0 && <p className={styles.hint}>Nenhuma venda encontrada com esses filtros.</p>}

        {vendas && vendas.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.tabela}>
              <thead>
                <tr>
                  <th>Data</th><th>Cliente</th><th>Produto</th><th>Valor</th>
                  <th>Forma</th><th>Vendedor</th><th>Situação</th><th>Observações</th><th></th>
                </tr>
              </thead>
              <tbody>
                {vendas.map((v) => {
                  const pago = estaPago(v.situacao);
                  const vencida = estaVencida(v);
                  return (
                    <tr key={v.id} style={{ cursor: "default" }}>
                      <td>{dataBr(v.data)}</td>
                      <td>{v.cliente_nome}</td>
                      <td>{v.produto_nome}</td>
                      <td>{moeda(v.valor_total)}</td>
                      <td>{v.forma_pgto ?? "—"}</td>
                      <td>{v.vendedor ?? "—"}</td>
                      <td>
                        <span style={{
                          padding: "3px 9px", borderRadius: 999, fontSize: "0.72rem", fontWeight: 700,
                          background: pago ? "var(--ok-soft)" : vencida ? "var(--crit-soft)" : "var(--warn-soft)",
                          color: pago ? "var(--ok)" : vencida ? "var(--crit)" : "var(--warn)",
                        }}>
                          {pago ? `Pago${v.data_pagamento ? ` em ${dataBr(v.data_pagamento)}` : ""}` : vencida ? "Vencida" : (v.situacao ?? "Em aberto")}
                        </span>
                      </td>
                      <td style={{ minWidth: 160 }}>
                        {editandoObs === v.id ? (
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <input
                              className={styles.inp}
                              style={{ padding: "6px 8px", width: 160 }}
                              value={obsValor}
                              onChange={(e) => setObsValor(e.target.value)}
                              placeholder="Observação"
                            />
                            <button
                              className={styles.btnPrimary}
                              style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                              disabled={salvandoObs}
                              onClick={() => salvarObs(v.id)}
                            >
                              OK
                            </button>
                            <button className={styles.btnLink} onClick={() => setEditandoObs(null)}>Cancelar</button>
                          </div>
                        ) : (
                          <button
                            className={styles.btnLink}
                            style={{ textAlign: "left", whiteSpace: "normal" }}
                            onClick={() => iniciarEdicaoObs(v)}
                          >
                            {v.observacoes || "+ adicionar"}
                          </button>
                        )}
                      </td>
                      <td>
                        {!pago && editando !== v.id && (
                          <button className={styles.btnLink} onClick={() => iniciarPagamento(v)}>
                            Marcar como pago
                          </button>
                        )}
                        {!pago && editando === v.id && (
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <input
                              className={styles.inp}
                              style={{ padding: "6px 8px", width: 130 }}
                              type="date"
                              value={dataPag}
                              onChange={(e) => setDataPag(e.target.value)}
                            />
                            <select
                              className={styles.inp}
                              style={{ padding: "6px 8px", width: 100 }}
                              value={formaPag}
                              onChange={(e) => setFormaPag(e.target.value)}
                            >
                              {FORMAS_RECEBIMENTO.map((f) => <option key={f} value={f}>{f}</option>)}
                            </select>
                            <button
                              className={styles.btnPrimary}
                              style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                              disabled={salvando}
                              onClick={() => confirmarPagamento(v.id)}
                            >
                              OK
                            </button>
                            <button className={styles.btnLink} onClick={() => setEditando(null)}>Cancelar</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
