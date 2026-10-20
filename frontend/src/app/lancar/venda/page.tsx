"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { listarClientes, listarProdutos, type Cliente, type Produto, type VendaParcelaEntrada } from "@/lib/api";
import { creditoDoCliente, listarPrecosCliente, type CreditoCliente } from "@/lib/cadastros";
import { enfileirar } from "@/lib/offline-queue";
import ParcelasEditor, { parcelaUnicaAVista } from "@/components/ParcelasEditor";
import styles from "../form.module.css";

import HistoricoLancamentos from "@/components/HistoricoLancamentos";
// data local, não UTC: depois das 21h em Brasília toISOString() já é "amanhã"
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function nf(v: number, casas = 2): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Uma linha do pedido: um produto, com sua quantidade e preço. */
interface ItemVenda {
  chave: number;
  produtoId: number | null;
  quantidade: string;
  unidades: string; // só pra produto de peso digitado: quantas peças/pacotes (o estoque em unidades baixa por isso)
  preco: string;
  precoEditado: boolean; // true = o operador digitou o preço (não sobrescrever pelo preço do cliente)
}

function kgDoItem(item: ItemVenda, produto: Produto | undefined): number {
  const qtd = parseFloat(item.quantidade.replace(",", ".")) || 0;
  return produto?.kg_digitado ? qtd : qtd * (produto?.fator_kg ?? 1);
}

export default function RegistrarVenda() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);

  const [data, setData] = useState(hojeISO());
  const [clienteId, setClienteId] = useState<number | null>(null);
  const proximaChave = useRef(2);
  const [itens, setItens] = useState<ItemVenda[]>([{ chave: 1, produtoId: null, quantidade: "", unidades: "", preco: "", precoEditado: false }]);
  const [precosCliente, setPrecosCliente] = useState<Record<number, number>>({});
  const [credito, setCredito] = useState<CreditoCliente | null>(null);
  const [parcelas, setParcelas] = useState<VendaParcelaEntrada[]>(() => parcelaUnicaAVista(hojeISO(), 0));
  const [parcelasBatem, setParcelasBatem] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listarClientes(), listarProdutos()])
      .then(([cs, ps]) => {
        setClientes(cs);
        setProdutos(ps);
        if (ps.length > 0) setItens((its) => its.map((it) => (it.produtoId === null ? { ...it, produtoId: ps[0].id } : it)));
        // volta de "Cadastrar cliente" com o cliente recém-criado já selecionado
        const clienteCriado = searchParams.get("clienteId");
        if (clienteCriado) setClienteId(Number(clienteCriado));
      })
      .catch(() => setErroCarregar("Sem conexão e sem dados salvos deste aparelho ainda. Conecte-se ao menos uma vez."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // preços combinados com o cliente, de todos os produtos de uma vez
  useEffect(() => {
    if (!clienteId) {
      setPrecosCliente({});
      return;
    }
    let cancelado = false;
    listarPrecosCliente(clienteId)
      .then((precos) => {
        if (cancelado) return;
        setPrecosCliente(Object.fromEntries(precos.filter((p) => p.preco > 0).map((p) => [p.produto_id, p.preco])));
      })
      .catch(() => {
        /* sem preço cadastrado — operador digita na mão */
      });
    return () => {
      cancelado = true;
    };
  }, [clienteId]);

  // situação de crédito do cliente: limite, em aberto, vencido e disponível
  useEffect(() => {
    setCredito(null);
    if (!clienteId) return;
    let cancelado = false;
    creditoDoCliente(clienteId).then((c) => { if (!cancelado) setCredito(c); }).catch(() => undefined);
    return () => { cancelado = true; };
  }, [clienteId]);

  // aplica o preço do cliente nos itens cujo preço o operador ainda não digitou
  useEffect(() => {
    setItens((its) =>
      its.map((it) => {
        if (it.precoEditado || it.produtoId === null) return it;
        const p = precosCliente[it.produtoId];
        return p !== undefined ? { ...it, preco: String(p) } : it;
      })
    );
  }, [precosCliente]);

  const linhas = useMemo(
    () =>
      itens.map((it) => {
        const produto = produtos.find((p) => p.id === it.produtoId);
        const kg = kgDoItem(it, produto);
        const precoNum = parseFloat(it.preco.replace(",", ".")) || 0;
        const qtdNum = parseFloat(it.quantidade.replace(",", ".")) || 0;
        return { it, produto, kg, precoNum, qtdNum, total: kg * precoNum };
      }),
    [itens, produtos]
  );
  const totalPedido = linhas.reduce((s, l) => s + l.total, 0);
  const itensValidos = linhas.every((l) => l.produto && l.qtdNum > 0 && l.precoNum >= 0);
  const podeSalvar = itensValidos && parcelasBatem && !enviando;

  function atualizarItem(chave: number, mudanca: Partial<ItemVenda>) {
    setItens((its) => its.map((it) => (it.chave === chave ? { ...it, ...mudanca } : it)));
  }

  function trocarProduto(chave: number, produtoId: number) {
    const p = precosCliente[produtoId];
    atualizarItem(chave, { produtoId, precoEditado: false, ...(p !== undefined ? { preco: String(p) } : {}) });
  }

  function adicionarProduto() {
    const emUso = new Set(itens.map((i) => i.produtoId));
    const livre = produtos.find((p) => !emUso.has(p.id)) ?? produtos[0];
    const preco = livre && precosCliente[livre.id] !== undefined ? String(precosCliente[livre.id]) : "";
    setItens((its) => [...its, { chave: proximaChave.current++, produtoId: livre?.id ?? null, quantidade: "", unidades: "", preco, precoEditado: false }]);
  }

  // quanto o pedido passa do limite (só quando há limite definido)
  const excedente = credito && credito.disponivel !== null ? totalPedido - credito.disponivel : 0;

  async function salvar() {
    if (credito && credito.disponivel !== null && excedente > 0.005) {
      const ok = window.confirm(
        `${credito.nome} tem limite de ${moeda(credito.limite_credito ?? 0)} e já deve ${moeda(credito.em_aberto)}.\n` +
        `Esta venda de ${moeda(totalPedido)} passa do limite em ${moeda(excedente)}.\n\nLançar mesmo assim?`
      );
      if (!ok) return;
    }
    setEnviando(true);
    try {
      await enfileirar("pedido_venda", {
        data,
        cliente_id: clienteId,
        itens: linhas.map((l) => ({
          produto_id: l.produto!.id,
          quantidade_un: l.produto!.kg_digitado ? (parseFloat(l.it.unidades.replace(",", ".")) > 0 ? parseFloat(l.it.unidades.replace(",", ".")) : null) : l.qtdNum,
          quantidade_kg: l.kg,
          preco_kg: l.precoNum,
        })),
        parcelas,
      });
      setToast(linhas.length > 1 ? `Venda registrada (${linhas.length} produtos)` : "Venda registrada");
      setItens([{ chave: proximaChave.current++, produtoId: produtos[0]?.id ?? null, quantidade: "", unidades: "", preco: "", precoEditado: false }]);
      setResetKey((k) => k + 1);
      setTimeout(() => setToast(null), 2200);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/")}>
          ←
        </button>
        <div>
          <h1>Registrar venda</h1>
          <div className={styles.sub}>{new Date().toLocaleDateString("pt-BR")}</div>
        </div>
      </div>

      <div className={styles.body}>
        {erroCarregar && <div className={styles.error}>{erroCarregar}</div>}

        <div className={styles.field}>
          <label>Data</label>
          <input className={styles.inp} type="date" value={data} max={hojeISO()} onChange={(e) => setData(e.target.value)} />
        </div>

        <div className={styles.field}>
          <label>Cliente</label>
          <select className={styles.inp} value={clienteId ?? ""} onChange={(e) => setClienteId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Consumidor final</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}{c.cidade ? ` — ${c.cidade}` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => router.push("/cadastros/clientes/novo?retorno=/lancar/venda")}
            style={{
              marginTop: 8, background: "none", border: "none", padding: 0,
              color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
            }}
          >
            + Cadastrar cliente
          </button>
        </div>

        {credito && (
          <div
            className={styles.full}
            style={{
              marginBottom: 14, padding: "10px 14px", borderRadius: 12, fontSize: "0.88rem", lineHeight: 1.5,
              border: `1px solid ${credito.status === "estourado" || excedente > 0.005 ? "var(--crit)" : credito.status === "atencao" || credito.vencido > 0 ? "var(--warn)" : "var(--rule)"}`,
              background: credito.status === "estourado" || excedente > 0.005 ? "var(--crit-soft)" : credito.status === "atencao" || credito.vencido > 0 ? "var(--warn-soft)" : "var(--surface)",
            }}
          >
            <strong>Crédito de {credito.nome}</strong>
            {credito.limite_credito === null ? (
              <span> — sem limite definido. Em aberto: <strong>{moeda(credito.em_aberto)}</strong>.</span>
            ) : (
              <span>
                {" "}— limite {moeda(credito.limite_credito)} · em aberto <strong>{moeda(credito.em_aberto)}</strong> · disponível{" "}
                <strong>{moeda(credito.disponivel ?? 0)}</strong>
              </span>
            )}
            {credito.vencido > 0 && (
              <div style={{ color: "var(--crit)", fontWeight: 700 }}>
                ⚠ {moeda(credito.vencido)} já vencido{credito.maior_atraso_dias ? ` (atraso de até ${credito.maior_atraso_dias} dias)` : ""}.
              </div>
            )}
            {excedente > 0.005 && (
              <div style={{ color: "var(--crit)", fontWeight: 700 }}>
                ⚠ Esta venda passa do limite em {moeda(excedente)} — será pedida confirmação ao salvar.
              </div>
            )}
          </div>
        )}

        {linhas.map((l, idx) => (
          <div
            key={l.it.chave}
            style={{ border: "1px solid var(--rule)", borderRadius: 12, padding: 12, marginBottom: 12, background: "var(--surface)" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <strong style={{ fontSize: "0.85rem" }}>{linhas.length > 1 ? `Produto ${idx + 1}` : "Produto"}</strong>
              {linhas.length > 1 && (
                <button
                  type="button"
                  onClick={() => setItens((its) => its.filter((i) => i.chave !== l.it.chave))}
                  style={{ background: "none", border: "none", color: "var(--crit)", fontWeight: 700, fontSize: "0.8rem", cursor: "pointer" }}
                >
                  Remover
                </button>
              )}
            </div>

            <div className={styles.chips} style={{ marginBottom: 10 }}>
              {produtos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={styles.chip}
                  aria-pressed={l.it.produtoId === p.id}
                  onClick={() => trocarProduto(l.it.chave, p.id)}
                >
                  {p.nome}
                </button>
              ))}
            </div>

            <div className={styles.field}>
              <label>
                {l.produto?.kg_digitado
                  ? "Quantidade (Kg)"
                  : `Quantidade (${l.produto?.unidade_embalagem === "pacote" ? "pacotes" : "bandejas"})`}
              </label>
              <input
                className={`${styles.inp} ${styles.num}`}
                type="number"
                inputMode={l.produto?.kg_digitado ? "decimal" : "numeric"}
                placeholder="0"
                value={l.it.quantidade}
                onChange={(e) => atualizarItem(l.it.chave, { quantidade: e.target.value })}
              />
            </div>

            {l.produto?.kg_digitado && (
              <div className={styles.field}>
                <label>Unidades / pacotes (opcional — baixa o estoque em unidades)</label>
                <input
                  className={`${styles.inp} ${styles.num}`}
                  type="number"
                  inputMode="numeric"
                  placeholder="0"
                  value={l.it.unidades}
                  onChange={(e) => atualizarItem(l.it.chave, { unidades: e.target.value })}
                />
              </div>
            )}

            <div className={styles.field}>
              <label>Preço por Kg</label>
              <input
                className={`${styles.inp} ${styles.num}`}
                type="number"
                inputMode="decimal"
                placeholder="0,00"
                value={l.it.preco}
                onChange={(e) => atualizarItem(l.it.chave, { preco: e.target.value, precoEditado: true })}
              />
            </div>

            <div className={styles.derived}>
              <span className={styles.l}>{nf(l.kg, 1)} Kg × R$ {nf(l.precoNum)}</span>
              <span className={styles.v}>R$ {nf(l.total)}</span>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={adicionarProduto}
          disabled={produtos.length === 0}
          style={{
            width: "100%", padding: "11px 14px", borderRadius: 11, border: "1px dashed var(--rule-strong)",
            background: "none", color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", marginBottom: 14,
          }}
        >
          + Adicionar outro produto nesta venda
        </button>

        {linhas.length > 1 && (
          <div className={styles.derived}>
            <span className={styles.l}>Total da venda ({linhas.length} produtos)</span>
            <span className={styles.v}>R$ {nf(totalPedido)}</span>
          </div>
        )}

        <div className={`${styles.field} ${styles.full}`}>
          <label>Pagamento</label>
          <ParcelasEditor
            key={resetKey}
            dataBase={data}
            valorTotal={totalPedido}
            parcelasIniciais={parcelaUnicaAVista(data, totalPedido)}
            onChange={(ps, bate) => { setParcelas(ps); setParcelasBatem(bate); }}
          />
        </div>
        <HistoricoLancamentos tipos={["venda"]} titulo="Vendas lançadas" />
      </div>

      <div className={styles.savebar}>
        <button className={styles.btnPrimary} disabled={!podeSalvar} onClick={salvar}>
          {enviando ? "Salvando…" : linhas.length > 1 ? "Salvar venda" : "Salvar venda"}
        </button>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
