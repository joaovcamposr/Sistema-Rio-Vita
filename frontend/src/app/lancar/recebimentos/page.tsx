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
  type Cliente,
  type Produto,
  type VendaLista,
} from "@/lib/api";
import styles from "../../cadastros/cadastros.module.css";

const FORMAS_RECEBIMENTO = ["Pix", "Dinheiro", "Boleto", "Cheque"];
const FORMAS_VENDA = ["Pix", "Dinheiro", "Prazo"];

interface FormVenda {
  data: string;
  cliente_id: number | null;
  vendedor: string;
  produto_id: number;
  quantidade: string;
  preco_kg: string;
  forma_pgto: string;
}

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
  const [buscaCliente, setBuscaCliente] = useState("");
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [vendedorFiltro, setVendedorFiltro] = useState("");
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [vendas, setVendas] = useState<VendaLista[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [dataPag, setDataPag] = useState(hojeISO());
  const [formaPag, setFormaPag] = useState(FORMAS_RECEBIMENTO[0]);
  const [salvando, setSalvando] = useState(false);
  const [editandoObs, setEditandoObs] = useState<number | null>(null);
  const [obsValor, setObsValor] = useState("");
  const [salvandoObs, setSalvandoObs] = useState(false);
  const [editandoVendaId, setEditandoVendaId] = useState<number | null>(null);
  const [formVenda, setFormVenda] = useState<FormVenda | null>(null);
  const [salvandoVenda, setSalvandoVenda] = useState(false);
  const [excluindoId, setExcluindoId] = useState<number | null>(null);

  function carregar() {
    setErro(null);
    listarVendas({
      de, ate,
      situacao: situacaoFiltro === "Todas" ? undefined : situacaoFiltro,
      clienteId: null,
      vendedor: vendedorFiltro || null,
    })
      .then(setVendas)
      .catch(() => setErro("Não foi possível carregar as vendas."));
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [de, ate, situacaoFiltro, vendedorFiltro]);

  const vendasFiltradas = useMemo(() => {
    if (!vendas) return null;
    const busca = normaliza(buscaCliente);
    if (!busca) return vendas;
    return vendas.filter((v) => normaliza(v.cliente_nome).includes(busca));
  }, [vendas, buscaCliente]);

  useEffect(() => {
    listarClientes().then(setClientes).catch(() => undefined);
    listarVendedoresDeVenda().then(setVendedores).catch(() => undefined);
    listarProdutos().then(setProdutos).catch(() => undefined);
  }, []);

  const totalEmAberto = useMemo(() => {
    if (!vendasFiltradas) return 0;
    return vendasFiltradas.filter((v) => !estaPago(v.situacao)).reduce((s, v) => s + v.valor_total, 0);
  }, [vendasFiltradas]);

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
      });
      setEditandoVendaId(null);
      setFormVenda(null);
      carregar();
    } catch {
      setErro("Não foi possível salvar a venda — confira os valores.");
    } finally {
      setSalvandoVenda(false);
    }
  }

  async function excluir(v: VendaLista) {
    const confirmar = window.confirm(
      `Excluir a venda de ${v.produto_nome} para ${v.cliente_nome} em ${dataBr(v.data)} (${moeda(v.valor_total)})?\n\n` +
      "Essa ação não pode ser desfeita."
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
        </div>

        {vendasFiltradas && situacaoFiltro !== "Pago" && (
          <p className={styles.hint} style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--ink)" }}>
            Total em aberto no período: {moeda(totalEmAberto)}
          </p>
        )}

        {!vendasFiltradas && !erro && <p className={styles.hint}>Carregando…</p>}
        {vendasFiltradas && vendasFiltradas.length === 0 && <p className={styles.hint}>Nenhuma venda encontrada com esses filtros.</p>}

        {vendasFiltradas && vendasFiltradas.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.tabela}>
              <thead>
                <tr>
                  <th>Data</th><th>Cliente</th><th>Produto</th><th>Quantidade</th><th>Valor</th>
                  <th>Forma</th><th>Vendedor</th><th>Situação</th><th>Observações</th><th></th><th></th>
                </tr>
              </thead>
              <tbody>
                {vendasFiltradas.map((v) => {
                  const pago = estaPago(v.situacao);
                  const vencida = estaVencida(v);
                  return (
                    <tr key={v.id} style={{ cursor: "default" }}>
                      <td>{dataBr(v.data)}</td>
                      <td>{v.cliente_nome}</td>
                      <td>{v.produto_nome}</td>
                      <td>{v.quantidade_un !== null ? `${nf(v.quantidade_un, 0)} un` : `${nf(v.quantidade_kg)} kg`}</td>
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
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button
                          className={styles.btnLink}
                          onClick={() => {
                            if (editandoVendaId === v.id) {
                              setEditandoVendaId(null);
                              setFormVenda(null);
                            } else {
                              iniciarEdicaoVenda(v);
                            }
                          }}
                        >
                          {editandoVendaId === v.id ? "Fechar" : "Editar"}
                        </button>
                        {" · "}
                        <button
                          className={styles.btnLink}
                          style={{ color: "var(--crit)" }}
                          disabled={excluindoId === v.id}
                          onClick={() => excluir(v)}
                        >
                          {excluindoId === v.id ? "Excluindo…" : "Excluir"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {editandoVendaId !== null && formVenda && (() => {
                  const vendaEditando = vendas?.find((v) => v.id === editandoVendaId);
                  const produtoSelecionado = produtos.find((p) => p.id === formVenda.produto_id);
                  if (!vendaEditando) return null;
                  return (
                    <tr key={`editar-${editandoVendaId}`}>
                      <td colSpan={11} style={{ background: "var(--surface-sunk)", padding: 14 }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
                          <div className={styles.field} style={{ margin: 0 }}>
                            <label>Data</label>
                            <input
                              className={styles.inp} type="date" value={formVenda.data}
                              onChange={(e) => setFormVenda({ ...formVenda, data: e.target.value })}
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
                          <button
                            className={styles.btnPrimary}
                            style={{ padding: "9px 16px" }}
                            disabled={salvandoVenda}
                            onClick={() => salvarEdicaoVenda(editandoVendaId)}
                          >
                            {salvandoVenda ? "Salvando…" : "Salvar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
