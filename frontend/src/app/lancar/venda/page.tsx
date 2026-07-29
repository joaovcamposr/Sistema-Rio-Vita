"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { listarClientes, listarProdutos, type Cliente, type Produto } from "@/lib/api";
import { listarPrecosCliente } from "@/lib/cadastros";
import { enfileirar } from "@/lib/offline-queue";
import styles from "../form.module.css";

const FORMAS = ["Pix", "Dinheiro", "Prazo"];

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function nf(v: number, casas = 2): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export default function RegistrarVenda() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);

  const [clienteId, setClienteId] = useState<number | null>(null);
  const [produtoId, setProdutoId] = useState<number | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [preco, setPreco] = useState("");
  const [forma, setForma] = useState(FORMAS[0]);
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listarClientes(), listarProdutos()])
      .then(([cs, ps]) => {
        setClientes(cs);
        setProdutos(ps);
        if (ps.length > 0) setProdutoId(ps[0].id);
        // volta de "Cadastrar cliente" com o cliente recém-criado já selecionado
        const clienteCriado = searchParams.get("clienteId");
        if (clienteCriado) setClienteId(Number(clienteCriado));
      })
      .catch(() => setErroCarregar("Sem conexão e sem dados salvos deste aparelho ainda. Conecte-se ao menos uma vez."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!clienteId || !produtoId) return;
    let cancelado = false;
    listarPrecosCliente(clienteId)
      .then((precos) => {
        if (cancelado) return;
        const p = precos.find((pp) => pp.produto_id === produtoId);
        if (p && p.preco > 0) setPreco(String(p.preco));
      })
      .catch(() => {
        /* sem preço cadastrado — operador digita na mão */
      });
    return () => {
      cancelado = true;
    };
  }, [clienteId, produtoId]);

  const produto = useMemo(() => produtos.find((p) => p.id === produtoId) ?? null, [produtos, produtoId]);
  const qtdNum = parseFloat(quantidade.replace(",", ".")) || 0;
  const precoNum = parseFloat(preco.replace(",", ".")) || 0;
  const kg = produto?.kg_digitado ? qtdNum : qtdNum * (produto?.fator_kg ?? 1);
  const total = kg * precoNum;

  const podeSalvar = produto !== null && qtdNum > 0 && precoNum >= 0 && !enviando;

  async function salvar() {
    if (!produto) return;
    setEnviando(true);
    try {
      await enfileirar("venda", {
        data: hojeISO(),
        cliente_id: clienteId,
        produto_id: produto.id,
        quantidade_un: produto.kg_digitado ? null : qtdNum,
        quantidade_kg: kg,
        preco_kg: precoNum,
        forma_pgto: forma,
      });
      setToast("Venda registrada");
      setQuantidade("");
      setPreco("");
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

        <div className={styles.field}>
          <label>Produto</label>
          <div className={styles.chips}>
            {produtos.map((p) => (
              <button
                key={p.id}
                type="button"
                className={styles.chip}
                aria-pressed={produtoId === p.id}
                onClick={() => setProdutoId(p.id)}
              >
                {p.nome}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label>{produto?.kg_digitado ? "Quantidade (Kg)" : `Quantidade (${produto?.unidade_embalagem === "pacote" ? "pacotes" : "bandejas"})`}</label>
          <input
            className={`${styles.inp} ${styles.num}`}
            type="number"
            inputMode={produto?.kg_digitado ? "decimal" : "numeric"}
            placeholder="0"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label>Preço por Kg</label>
          <input
            className={`${styles.inp} ${styles.num}`}
            type="number"
            inputMode="decimal"
            placeholder="0,00"
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
          />
        </div>

        <div className={styles.derived}>
          <span className={styles.l}>{nf(kg, 1)} Kg × R$ {nf(precoNum)}</span>
          <span className={styles.v}>R$ {nf(total)}</span>
        </div>

        <div className={styles.field}>
          <label>Forma de pagamento</label>
          <div className={styles.chips}>
            {FORMAS.map((f) => (
              <button
                key={f}
                type="button"
                className={styles.chip}
                aria-pressed={forma === f}
                onClick={() => setForma(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.savebar}>
        <button className={styles.btnPrimary} disabled={!podeSalvar} onClick={salvar}>
          {enviando ? "Salvando…" : "Salvar venda"}
        </button>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
