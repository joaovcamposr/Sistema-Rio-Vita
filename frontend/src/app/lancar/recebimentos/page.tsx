"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  atualizarObservacoesVenda,
  editarVenda,
  excluirVenda,
  listarClientes,
  listarProdutos,
  listarVendas,
  listarVendedoresDeVenda,
  marcarPagamentoVenda,
  restaurarVenda,
  type Cliente,
  type Produto,
  type VendaLista,
} from "@/lib/api";
import styles from "../../cadastros/cadastros.module.css";

const FORMAS_RECEBIMENTO = ["Pix", "Dinheiro", "Boleto", "Cheque"];
const FORMAS_VENDA = ["Pix", "Boleto", "Dinheiro", "Cheque"];

interface FormVenda {
  data: string;
  cliente_id: number | null;
  vendedor: string;
  produto_id: number;
  quantidade: string;
  preco_kg: string;
  forma_pgto: string;
  aVista: boolean;
  dataPrevista: string;
  situacao: string;
  dataPagamento: string;
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}
// "De" começa sempre no início — não dá pra saber de antemão até quando
// existe lançamento antigo, então o padrão traz tudo em vez de arriscar
// esconder venda em aberto de fora do período
const DESDE_SEMPRE = "2020-01-01";
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function nf(v: number, casas = 1): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function normaliza(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}
function estaPago(situacao: string | null): boolean {
  return (situacao ?? "").trim().toLowerCase().startsWith("pag");
}
/** Data prevista de recebimento: usa a data própria da venda quando tem
 * (lançamentos novos); pra vendas antigas, sem essa data, cai pro prazo
 * padrão do cliente, como já era calculado antes. */
function dataVencimento(v: VendaLista): string | null {
  if (v.data_prevista_recebimento) return v.data_prevista_recebimento;
  if (!v.cliente_prazo_dias) return null;
  const d = new Date(v.data + "T00:00:00");
  d.setDate(d.getDate() + v.cliente_prazo_dias);
  return d.toISOString().slice(0, 10);
}
function estaVencida(v: VendaLista): boolean {
  if (estaPago(v.situacao)) return false;
  const venc = dataVencimento(v);
  if (!venc) return false;
  return venc < hojeISO();
}
function dataHoraBr(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function Recebimentos() {
  const router = useRouter();
  const [de, setDe] = useState(DESDE_SEMPRE);
  const [ate, setAte] = useState(hojeISO());
  const [situacaoFiltro, setSituacaoFiltro] = useState("Em aberto");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [vendedorFiltro, setVendedorFiltro] = useState("");
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [produtoFiltro, setProdutoFiltro] = useState<number | "">("");
  const [formaFiltro, setFormaFiltro] = useState("");
  const [vendas, setVendas] = useState<VendaLista[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [marcandoPagoId, setMarcandoPagoId] = useState<number | null>(null);
  const [editandoObs, setEditandoObs] = useState<number | null>(null);
  const [obsValor, setObsValor] = useState("");
  const [salvandoObs, setSalvandoObs] = useState(false);
  const [editandoVendaId, setEditandoVendaId] = useState<number | null>(null);
  const [formVenda, setFormVenda] = useState<FormVenda | null>(null);
  const [salvandoVenda, setSalvandoVenda] = useState(false);
  const [excluindoId, setExcluindoId] = useState<number | null>(null);
  const [mostrarExcluidos, setMostrarExcluidos] = useState(false);
  const [restaurandoId, setRestaurandoId] = useState<number | null>(null);

  function carregar() {
    setErro(null);
    listarVendas({
      de, ate,
      situacao: mostrarExcluidos ? undefined : (situacaoFiltro === "Todas" ? undefined : situacaoFiltro),
      clienteId: null,
      vendedor: vendedorFiltro || null,
      excluidos: mostrarExcluidos,
    })
      .then(setVendas)
      .catch(() => setErro("Não foi possível carregar as vendas."));
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [de, ate, situacaoFiltro, vendedorFiltro, mostrarExcluidos]);

  const vendasFiltradas = useMemo(() => {
    if (!vendas) return null;
    const busca = normaliza(buscaCliente);
    return vendas
      .filter((v) => !busca || normaliza(v.cliente_nome).includes(busca))
      .filter((v) => !produtoFiltro || v.produto_id === produtoFiltro)
      .filter((v) => !formaFiltro || v.forma_pgto === formaFiltro);
  }, [vendas, buscaCliente, produtoFiltro, formaFiltro]);

  useEffect(() => {
    listarClientes().then(setClientes).catch(() => undefined);
    listarVendedoresDeVenda().then(setVendedores).catch(() => undefined);
    listarProdutos().then(setProdutos).catch(() => undefined);
  }, []);

  const totalEmAberto = useMemo(() => {
    if (!vendasFiltradas) return 0;
    return vendasFiltradas.filter((v) => !estaPago(v.situacao)).reduce((s, v) => s + v.valor_total, 0);
  }, [vendasFiltradas]);

  async function marcarComoPago(v: VendaLista) {
    setMarcandoPagoId(v.id);
    try {
      const forma = v.forma_pgto && FORMAS_RECEBIMENTO.includes(v.forma_pgto) ? v.forma_pgto : FORMAS_RECEBIMENTO[0];
      await marcarPagamentoVenda(v.id, "Pago", hojeISO(), forma);
      carregar();
    } catch {
      setErro("Não foi possível salvar o pagamento.");
    } finally {
      setMarcandoPagoId(null);
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

  function iniciarEdicaoVenda(v: VendaLista) {
    setEditandoVendaId(v.id);
    setFormVenda({
      data: v.data,
      cliente_id: v.cliente_id,
      vendedor: v.vendedor ?? "",
      produto_id: v.produto_id,
      quantidade: String(v.quantidade_un ?? v.quantidade_kg).replace(".", ","),
      preco_kg: String(v.preco_kg).replace(".", ","),
      forma_pgto: v.forma_pgto ?? FORMAS_VENDA[0],
      aVista: !v.data_prevista_recebimento,
      dataPrevista: v.data_prevista_recebimento ?? dataVencimento(v) ?? hojeISO(),
      situacao: estaPago(v.situacao) ? "Pago" : "Em aberto",
      dataPagamento: v.data_pagamento ?? hojeISO(),
    });
  }

  async function salvarEdicaoVenda(vendaId: number) {
    if (!formVenda) return;
    const produto = produtos.find((p) => p.id === formVenda.produto_id);
    if (!produto) return;
    const qtdNum = parseFloat(formVenda.quantidade.replace(",", ".")) || 0;
    const precoNum = parseFloat(formVenda.preco_kg.replace(",", ".")) || 0;
    const kg = produto.kg_digitado ? qtdNum : qtdNum * (produto.fator_kg ?? 1);
    setSalvandoVenda(true);
    try {
      await editarVenda(vendaId, {
        data: formVenda.data,
        cliente_id: formVenda.cliente_id,
        vendedor: formVenda.vendedor.trim() || null,
        produto_id: formVenda.produto_id,
        quantidade_un: produto.kg_digitado ? null : qtdNum,
        quantidade_kg: kg,
        preco_kg: precoNum,
        forma_pgto: formVenda.forma_pgto,
        a_vista: formVenda.aVista,
        data_prevista_recebimento: formVenda.aVista ? null : formVenda.dataPrevista,
        situacao: formVenda.situacao,
        data_pagamento: formVenda.situacao === "Pago" ? formVenda.dataPagamento : null,
      });
      setEditandoVendaId(null);
      setFormVenda(null);
      carregar();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setErro(
        msg.includes("venda_prevista_apos_venda")
          ? "A data de recebimento previsto não pode ser antes da data da venda — ajuste o campo \"Recebimento previsto\" também."
          : "Não foi possível salvar a venda — confira os valores."
      );
    } finally {
      setSalvandoVenda(false);
    }
  }

  async function excluir(v: VendaLista) {
    const confirmar = window.confirm(
      `Excluir a venda de ${v.produto_nome} para ${v.cliente_nome} em ${dataBr(v.data)} (${moeda(v.valor_total)})?\n\n` +
      "Pode ser restaurada depois em \"Ver excluídas\"."
    );
    if (!confirmar) return;
    setExcluindoId(v.id);
    try {
      await excluirVenda(v.id);
      carregar();
    } catch {
      setErro("Não foi possível excluir a venda.");
    } finally {
      setExcluindoId(null);
    }
  }

  async function restaurar(v: VendaLista) {
    setRestaurandoId(v.id);
    try {
      await restaurarVenda(v.id);
      carregar();
    } catch {
      setErro("Não foi possível restaurar a venda.");
    } finally {
      setRestaurandoId(null);
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
            <label>Buscar cliente</label>
            <input
              className={styles.inp}
              type="text"
              placeholder="Qualquer parte do nome"
              value={buscaCliente}
              onChange={(e) => setBuscaCliente(e.target.value)}
            />
          </div>
          <div className={styles.field} style={{ margin: 0 }}>
            <label>Vendedor</label>
            <select className={styles.inp} value={vendedorFiltro} onChange={(e) => setVendedorFiltro(e.target.value)}>
              <option value="">Todos</option>
              {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className={styles.field} style={{ margin: 0 }}>
            <label>Produto</label>
            <select
              className={styles.inp}
              value={produtoFiltro}
              onChange={(e) => setProdutoFiltro(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Todos</option>
              {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div className={styles.field} style={{ margin: 0 }}>
            <label>Forma de pagamento</label>
            <select className={styles.inp} value={formaFiltro} onChange={(e) => setFormaFiltro(e.target.value)}>
              <option value="">Todas</option>
              {FORMAS_VENDA.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <button
            type="button"
            onClick={() => setMostrarExcluidos((v) => !v)}
            style={{
              padding: "9px 16px", borderRadius: 9, border: "1px solid var(--rule-strong)",
              background: mostrarExcluidos ? "var(--brand)" : "var(--surface)",
              color: mostrarExcluidos ? "var(--brand-ink)" : "var(--ink)",
              fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
            }}
          >
            {mostrarExcluidos ? "Vendo excluídas" : "Ver excluídas"}
          </button>
        </div>

        {!mostrarExcluidos && vendasFiltradas && situacaoFiltro !== "Pago" && (
          <p className={styles.hint} style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--ink)" }}>
            Total em aberto no período: {moeda(totalEmAberto)}
          </p>
        )}

        {!vendasFiltradas && !erro && <p className={styles.hint}>Carregando…</p>}
        {vendasFiltradas && vendasFiltradas.length === 0 && (
          <p className={styles.hint}>
            {mostrarExcluidos ? "Nenhuma venda excluída no período." : "Nenhuma venda encontrada com esses filtros."}
          </p>
        )}

        {vendasFiltradas && vendasFiltradas.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.tabela} style={{ fontSize: "0.78rem", tableLayout: "fixed", width: "100%" }}>
              <colgroup>
                <col style={{ width: "9%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "6%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "6%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "17%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ padding: "8px 6px" }}>Data</th>
                  <th style={{ padding: "8px 6px" }}>Cliente</th>
                  <th style={{ padding: "8px 6px" }}>Produto</th>
                  <th style={{ padding: "8px 6px" }}>Qtd.</th>
                  <th style={{ padding: "8px 6px" }}>Valor</th>
                  <th style={{ padding: "8px 6px" }}>Forma</th>
                  <th style={{ padding: "8px 6px" }}>Vendedor</th>
                  <th style={{ padding: "8px 6px" }}>Situação</th>
                  <th style={{ padding: "8px 6px" }}>Obs.</th>
                  <th style={{ padding: "8px 6px" }}></th>
                </tr>
              </thead>
              <tbody>
                {vendasFiltradas.map((v) => {
                  const pago = estaPago(v.situacao);
                  const vencida = estaVencida(v);
                  const venc = dataVencimento(v);
                  return (
                    <tr key={v.id} style={{ cursor: "default" }}>
                      <td style={{ padding: "6px", whiteSpace: "nowrap" }}>{dataBr(v.data)}</td>
                      <td style={{ padding: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v.cliente_nome}>
                        {v.cliente_nome}
                      </td>
                      <td style={{ padding: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v.produto_nome}>
                        {v.produto_nome}
                      </td>
                      <td style={{ padding: "6px" }}>{v.quantidade_un !== null ? `${nf(v.quantidade_un, 0)} un` : `${nf(v.quantidade_kg)} kg`}</td>
                      <td style={{ padding: "6px" }}>{moeda(v.valor_total)}</td>
                      <td style={{ padding: "6px" }}>{v.forma_pgto ?? "—"}</td>
                      <td style={{ padding: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v.vendedor ?? ""}>
                        {v.vendedor ?? "—"}
                      </td>
                      <td style={{ padding: "6px" }}>
                        <span style={{
                          display: "inline-block", padding: "2px 7px", borderRadius: 999, fontSize: "0.68rem", fontWeight: 700,
                          background: pago ? "var(--ok-soft)" : vencida ? "var(--crit-soft)" : "var(--warn-soft)",
                          color: pago ? "var(--ok)" : vencida ? "var(--crit)" : "var(--warn)",
                        }}>
                          {pago
                            ? `Pago${v.data_pagamento ? ` ${dataBr(v.data_pagamento)}` : ""}`
                            : vencida
                              ? `Vencida${venc ? ` (${dataBr(venc)})` : ""}`
                              : `Em aberto${venc ? ` (${dataBr(venc)})` : ""}`}
                        </span>
                      </td>
                      <td style={{ padding: "6px" }}>
                        {editandoObs === v.id ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <input
                              className={styles.inp}
                              style={{ padding: "5px 6px", fontSize: "0.78rem", width: "100%" }}
                              value={obsValor}
                              onChange={(e) => setObsValor(e.target.value)}
                              placeholder="Observação"
                            />
                            <div>
                              <button
                                className={styles.btnPrimary}
                                style={{ padding: "4px 10px", fontSize: "0.72rem" }}
                                disabled={salvandoObs}
                                onClick={() => salvarObs(v.id)}
                              >
                                OK
                              </button>
                              {" "}
                              <button className={styles.btnLink} style={{ fontSize: "0.72rem" }} onClick={() => setEditandoObs(null)}>Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            className={styles.btnLink}
                            style={{
                              textAlign: "left", fontSize: "0.76rem", display: "block", width: "100%",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}
                            title={v.observacoes ?? ""}
                            onClick={() => iniciarEdicaoObs(v)}
                          >
                            {v.observacoes || "+ adicionar"}
                          </button>
                        )}
                      </td>
                      <td style={{ padding: "6px", fontSize: "0.76rem" }}>
                        {mostrarExcluidos ? (
                          <>
                            <span className={styles.hint} style={{ display: "block", fontSize: "0.7rem" }}>
                              {v.excluido_em ? `Excl. ${dataHoraBr(v.excluido_em)}` : ""}
                              {v.excluido_por ? ` · ${v.excluido_por}` : ""}
                            </span>
                            <button
                              className={styles.btnLink}
                              style={{ fontSize: "0.76rem" }}
                              disabled={restaurandoId === v.id}
                              onClick={() => restaurar(v)}
                            >
                              {restaurandoId === v.id ? "Restaurando…" : "Restaurar"}
                            </button>
                          </>
                        ) : (
                          <>
                            {!pago && (
                              <button
                                className={styles.btnLink} style={{ fontSize: "0.76rem", display: "block" }}
                                disabled={marcandoPagoId === v.id}
                                onClick={() => marcarComoPago(v)}
                              >
                                {marcandoPagoId === v.id ? "Marcando…" : "Marcar pago"}
                              </button>
                            )}
                            <button
                              className={styles.btnLink}
                              style={{ fontSize: "0.76rem" }}
                              onClick={() => iniciarEdicaoVenda(v)}
                            >
                              Editar
                            </button>
                            {" · "}
                            <button
                              className={styles.btnLink}
                              style={{ fontSize: "0.76rem", color: "var(--crit)" }}
                              disabled={excluindoId === v.id}
                              onClick={() => excluir(v)}
                            >
                              {excluindoId === v.id ? "Excluindo…" : "Excluir"}
                            </button>
                          </>
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

      {editandoVendaId !== null && formVenda && (() => {
        const vendaEditando = vendas?.find((v) => v.id === editandoVendaId);
        const produtoSelecionado = produtos.find((p) => p.id === formVenda.produto_id);
        if (!vendaEditando) return null;
        return (
          <div
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 100,
              display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
            }}
            onClick={() => { setEditandoVendaId(null); setFormVenda(null); }}
          >
            <div
              style={{
                background: "var(--surface)", borderRadius: 14, padding: 20,
                width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto",
                boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Editar venda</h2>
                <button
                  type="button"
                  onClick={() => { setEditandoVendaId(null); setFormVenda(null); }}
                  aria-label="Fechar"
                  style={{ background: "none", border: "none", fontSize: "1.4rem", lineHeight: 1, color: "var(--ink-muted)", cursor: "pointer" }}
                >
                  ×
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
                <div className={styles.field} style={{ margin: 0 }}>
                  <label>Data</label>
                  <input
                    className={styles.inp} type="date" value={formVenda.data}
                    onChange={(e) => {
                      const novaData = e.target.value;
                      setFormVenda({
                        ...formVenda,
                        data: novaData,
                        // recebimento previsto não pode ficar antes da data da venda — se
                        // só a data mudou (ex.: corrigindo um erro de digitação) e isso
                        // deixaria o previsto no passado, empurra o previsto junto
                        dataPrevista:
                          !formVenda.aVista && formVenda.dataPrevista < novaData
                            ? novaData
                            : formVenda.dataPrevista,
                      });
                    }}
                  />
                </div>
                <div className={styles.field} style={{ margin: 0 }}>
                  <label>Cliente</label>
                  <select
                    className={styles.inp}
                    value={formVenda.cliente_id ?? ""}
                    onChange={(e) => setFormVenda({ ...formVenda, cliente_id: e.target.value ? Number(e.target.value) : null })}
                  >
                    <option value="">Consumidor final</option>
                    {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div className={styles.field} style={{ margin: 0 }}>
                  <label>Produto</label>
                  <select
                    className={styles.inp}
                    value={formVenda.produto_id}
                    onChange={(e) => setFormVenda({ ...formVenda, produto_id: Number(e.target.value) })}
                  >
                    {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
                <div className={styles.field} style={{ margin: 0 }}>
                  <label>{produtoSelecionado?.kg_digitado ? "Quantidade (Kg)" : "Quantidade (un)"}</label>
                  <input
                    className={styles.inp} style={{ width: 100 }} type="text" inputMode="decimal"
                    value={formVenda.quantidade}
                    onChange={(e) => setFormVenda({ ...formVenda, quantidade: e.target.value })}
                  />
                </div>
                <div className={styles.field} style={{ margin: 0 }}>
                  <label>Preço/Kg</label>
                  <input
                    className={styles.inp} style={{ width: 100 }} type="text" inputMode="decimal"
                    value={formVenda.preco_kg}
                    onChange={(e) => setFormVenda({ ...formVenda, preco_kg: e.target.value })}
                  />
                </div>
                <div className={styles.field} style={{ margin: 0 }}>
                  <label>Vendedor</label>
                  <input
                    className={styles.inp} style={{ width: 120 }}
                    value={formVenda.vendedor}
                    onChange={(e) => setFormVenda({ ...formVenda, vendedor: e.target.value })}
                  />
                </div>
                <div className={styles.field} style={{ margin: 0 }}>
                  <label>Forma</label>
                  <select
                    className={styles.inp}
                    value={formVenda.forma_pgto}
                    onChange={(e) => setFormVenda({ ...formVenda, forma_pgto: e.target.value })}
                  >
                    {FORMAS_VENDA.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className={styles.field} style={{ margin: 0 }}>
                  <label>À vista / a prazo</label>
                  <select
                    className={styles.inp}
                    value={formVenda.aVista ? "vista" : "prazo"}
                    onChange={(e) => setFormVenda({ ...formVenda, aVista: e.target.value === "vista" })}
                  >
                    <option value="vista">À vista</option>
                    <option value="prazo">A prazo</option>
                  </select>
                </div>
                {!formVenda.aVista && (
                  <div className={styles.field} style={{ margin: 0 }}>
                    <label>Recebimento previsto</label>
                    <input
                      className={styles.inp} type="date" value={formVenda.dataPrevista}
                      onChange={(e) => setFormVenda({ ...formVenda, dataPrevista: e.target.value })}
                    />
                  </div>
                )}
                <div className={styles.field} style={{ margin: 0 }}>
                  <label>Situação</label>
                  <select
                    className={styles.inp}
                    value={formVenda.situacao}
                    onChange={(e) => setFormVenda({ ...formVenda, situacao: e.target.value })}
                  >
                    <option value="Em aberto">Em aberto</option>
                    <option value="Pago">Pago</option>
                  </select>
                </div>
                {formVenda.situacao === "Pago" && (
                  <div className={styles.field} style={{ margin: 0 }}>
                    <label>Data de pagamento</label>
                    <input
                      className={styles.inp} type="date" value={formVenda.dataPagamento}
                      onChange={(e) => setFormVenda({ ...formVenda, dataPagamento: e.target.value })}
                    />
                  </div>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
                <button
                  type="button"
                  onClick={() => { setEditandoVendaId(null); setFormVenda(null); }}
                  style={{ background: "none", border: "none", color: "var(--ink-muted)", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer" }}
                >
                  Cancelar
                </button>
                <button
                  className={styles.btnPrimary}
                  style={{ padding: "9px 20px" }}
                  disabled={salvandoVenda}
                  onClick={() => salvarEdicaoVenda(editandoVendaId)}
                >
                  {salvandoVenda ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
