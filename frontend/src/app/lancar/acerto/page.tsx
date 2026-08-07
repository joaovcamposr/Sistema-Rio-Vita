"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listarClientes, listarProdutos, type Cliente, type Produto } from "@/lib/api";
import { listarExpedicoesAbertas, listarPrecosCliente, type Expedicao } from "@/lib/cadastros";
import { enfileirar } from "@/lib/offline-queue";
import styles from "../form.module.css";

const FORMAS = ["Dinheiro", "Pix", "Prazo"];
const CATEGORIAS_DESPESA = ["Abastecimento", "Alimentação", "Manutenção", "Outro"];

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function nf(v: number, casas = 1): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

interface VendaLinha {
  clienteId: number | null;
  produtoId: number | null;
  quantidade: string;
  preco: string;
  forma: string;
  prazoDias: string;
  emiteNf: boolean;
  emiteBoleto: boolean;
}
interface RetornoLinha { produtoId: number | null; quantidade: string }
interface DespesaLinha { categoria: string; valor: string; forma: string }

function novaVenda(produtoId: number | null): VendaLinha {
  return { clienteId: null, produtoId, quantidade: "", preco: "", forma: FORMAS[0], prazoDias: "", emiteNf: false, emiteBoleto: false };
}

export default function AcertoExpedicao() {
  const router = useRouter();
  const [expedicoes, setExpedicoes] = useState<Expedicao[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);

  const [expedicaoId, setExpedicaoId] = useState<number | null>(null);
  const [dataAcerto, setDataAcerto] = useState(hojeISO());
  const [vendas, setVendas] = useState<VendaLinha[]>([novaVenda(null)]);
  const [retornos, setRetornos] = useState<RetornoLinha[]>([{ produtoId: null, quantidade: "" }]);
  const [despesas, setDespesas] = useState<DespesaLinha[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listarExpedicoesAbertas(), listarClientes(), listarProdutos()])
      .then(([es, cs, ps]) => {
        setExpedicoes(es);
        setClientes(cs);
        setProdutos(ps);
        if (es.length > 0) setExpedicaoId(es[0].id);
      })
      .catch(() => setErroCarregar("Sem conexão e sem dados salvos deste aparelho ainda. Conecte-se ao menos uma vez."));
  }, []);

  const expedicao = expedicoes.find((e) => e.id === expedicaoId) ?? null;

  async function aoEscolherCliente(idx: number, clienteId: number | null) {
    const cliente = clientes.find((c) => c.id === clienteId) ?? null;
    setVendas((linhas) => {
      const copia = [...linhas];
      copia[idx] = {
        ...copia[idx],
        clienteId,
        prazoDias: cliente?.prazo_dias != null ? String(cliente.prazo_dias) : "",
        emiteNf: cliente?.emite_nf ?? false,
        emiteBoleto: cliente?.emite_boleto ?? false,
      };
      return copia;
    });
    if (clienteId && vendas[idx].produtoId) {
      try {
        const precos = await listarPrecosCliente(clienteId);
        const p = precos.find((pp) => pp.produto_id === vendas[idx].produtoId);
        if (p && p.preco > 0) {
          setVendas((linhas) => {
            const copia = [...linhas];
            copia[idx] = { ...copia[idx], preco: String(p.preco) };
            return copia;
          });
        }
      } catch {
        /* sem preço cadastrado — operador digita na mão */
      }
    }
  }

  function atualizarVenda(idx: number, campo: keyof VendaLinha, valor: string | number | boolean | null) {
    setVendas((linhas) => {
      const copia = [...linhas];
      copia[idx] = { ...copia[idx], [campo]: valor } as VendaLinha;
      return copia;
    });
  }

  function kgDe(produtoId: number | null, quantidade: string): number {
    const produto = produtos.find((p) => p.id === produtoId);
    const qtd = parseFloat(quantidade.replace(",", ".")) || 0;
    return produto?.kg_digitado ? qtd : qtd * (produto?.fator_kg ?? 1);
  }

  const diferencas = (expedicao?.itens ?? []).map((item) => {
    const vendidoKg = vendas
      .filter((v) => v.produtoId === item.produto_id)
      .reduce((s, v) => s + kgDe(v.produtoId, v.quantidade), 0);
    const retornadoKg = retornos
      .filter((r) => r.produtoId === item.produto_id)
      .reduce((s, r) => s + kgDe(r.produtoId, r.quantidade), 0);
    const diferenca = item.quantidade_kg - vendidoKg - retornadoKg;
    return { produto_nome: item.produto_nome, expedidoKg: item.quantidade_kg, vendidoKg, retornadoKg, diferenca };
  });
  const temDiferenca = diferencas.some((d) => Math.abs(d.diferenca) > 0.01);

  const totalVendidoDinheiro = vendas.reduce((s, v) => {
    if (v.forma !== "Dinheiro") return s;
    const produto = produtos.find((p) => p.id === v.produtoId);
    const qtd = parseFloat(v.quantidade.replace(",", ".")) || 0;
    const kg = produto?.kg_digitado ? qtd : qtd * (produto?.fator_kg ?? 1);
    const preco = parseFloat(v.preco.replace(",", ".")) || 0;
    return s + kg * preco;
  }, 0);
  const totalDespesasDinheiro = despesas
    .filter((d) => d.forma === "Dinheiro")
    .reduce((s, d) => s + (parseFloat(d.valor.replace(",", ".")) || 0), 0);

  const podeSalvar = expedicaoId !== null && !enviando;

  async function salvar() {
    if (!expedicaoId) return;
    if (temDiferenca) {
      const resumo = diferencas
        .filter((d) => Math.abs(d.diferenca) > 0.01)
        .map((d) => `${d.produto_nome}: expedido ${nf(d.expedidoKg)} kg, contabilizado ${nf(d.vendidoKg + d.retornadoKg)} kg (diferença de ${nf(d.diferenca)} kg)`)
        .join("\n");
      const confirmar = window.confirm(
        `Há diferença entre o que saiu e o que foi vendido + retornado:\n\n${resumo}\n\nSalvar mesmo assim?`
      );
      if (!confirmar) return;
    }
    setEnviando(true);
    try {
      const vendasValidas = vendas.filter((v) => v.produtoId && (parseFloat(v.quantidade.replace(",", ".")) || 0) > 0);
      const retornosValidos = retornos.filter((r) => r.produtoId && (parseFloat(r.quantidade.replace(",", ".")) || 0) > 0);
      const despesasValidas = despesas.filter((d) => d.categoria && (parseFloat(d.valor.replace(",", ".")) || 0) > 0);

      await enfileirar("expedicao_acerto", {
        expedicao_id: expedicaoId,
        data_acerto: dataAcerto,
        vendas: vendasValidas.map((v) => {
          const produto = produtos.find((p) => p.id === v.produtoId);
          const qtd = parseFloat(v.quantidade.replace(",", "."));
          return {
            cliente_id: v.clienteId,
            produto_id: v.produtoId,
            quantidade_un: produto?.kg_digitado ? null : qtd,
            quantidade_kg: produto?.kg_digitado ? qtd : qtd * (produto?.fator_kg ?? 1),
            preco_kg: parseFloat(v.preco.replace(",", ".")) || 0,
            forma_pgto: v.forma,
            prazo_dias: v.prazoDias ? Number(v.prazoDias) : null,
            emite_nf: v.emiteNf,
            emite_boleto: v.emiteBoleto,
          };
        }),
        retornos: retornosValidos.map((r) => {
          const produto = produtos.find((p) => p.id === r.produtoId);
          const qtd = parseFloat(r.quantidade.replace(",", "."));
          return {
            produto_id: r.produtoId,
            quantidade_embalagens: produto?.kg_digitado ? null : qtd,
            quantidade_kg: produto?.kg_digitado ? qtd : qtd * (produto?.fator_kg ?? 1),
          };
        }),
        despesas: despesasValidas.map((d) => ({
          categoria: d.categoria, valor: parseFloat(d.valor.replace(",", ".")), forma_pgto: d.forma,
        })),
      });
      setToast("Acerto registrado");
      setVendas([novaVenda(null)]);
      setRetornos([{ produtoId: null, quantidade: "" }]);
      setDespesas([]);
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
          <h1>Acerto de expedição</h1>
          <div className={styles.sub}>{new Date().toLocaleDateString("pt-BR")}</div>
        </div>
      </div>

      <div className={styles.body}>
        {erroCarregar && <div className={styles.error}>{erroCarregar}</div>}

        <div className={styles.field}>
          <label>Data do acerto</label>
          <input className={styles.inp} type="date" value={dataAcerto} onChange={(e) => setDataAcerto(e.target.value)} />
        </div>

        <div className={styles.field}>
          <label>Expedição</label>
          <select className={styles.inp} value={expedicaoId ?? ""} onChange={(e) => setExpedicaoId(Number(e.target.value))}>
            {expedicoes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.vendedor_nome} — saiu em {e.data_saida.split("-").reverse().join("/")}
              </option>
            ))}
          </select>
          {expedicoes.length === 0 && <p className={styles.hint}>Nenhuma expedição em aberto.</p>}
        </div>

        {expedicao && (
          <div className={styles.note}>
            Saiu com: {expedicao.itens.map((i) => `${i.produto_nome} (${nf(i.quantidade_kg, 1)} kg)`).join(" · ")}
          </div>
        )}

        {temDiferenca && (
          <div className={styles.error}>
            <strong>Atenção:</strong> o que saiu não bate com vendas + retorno ainda:
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {diferencas.filter((d) => Math.abs(d.diferenca) > 0.01).map((d) => (
                <li key={d.produto_nome}>
                  {d.produto_nome}: expedido {nf(d.expedidoKg)} kg, contabilizado {nf(d.vendidoKg + d.retornadoKg)} kg
                  {" "}({d.diferenca > 0 ? "faltam" : "sobram"} {nf(Math.abs(d.diferenca))} kg)
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className={styles.section} style={{ fontWeight: 700, fontSize: ".9rem", margin: "18px 0 8px" }}>Vendas realizadas</p>
        {vendas.map((v, idx) => (
          <div key={idx} style={{ border: "1px solid var(--rule)", borderRadius: 11, padding: 12, marginBottom: 10 }}>
            <div className={styles.field} style={{ marginBottom: 10 }}>
              <label>Cliente</label>
              <select className={styles.inp} value={v.clienteId ?? ""} onChange={(e) => aoEscolherCliente(idx, e.target.value ? Number(e.target.value) : null)}>
                <option value="">Consumidor final</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div className={styles.field} style={{ marginBottom: 10 }}>
              <label>Produto</label>
              <div className={styles.chips}>
                {produtos.map((p) => (
                  <button key={p.id} type="button" className={styles.chip} aria-pressed={v.produtoId === p.id}
                    onClick={() => atualizarVenda(idx, "produtoId", p.id)}>
                    {p.nome}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div className={styles.field} style={{ marginBottom: 0 }}>
                <label>Quantidade</label>
                <input className={styles.inp} type="number" inputMode="decimal" value={v.quantidade}
                  onChange={(e) => atualizarVenda(idx, "quantidade", e.target.value)} />
              </div>
              <div className={styles.field} style={{ marginBottom: 0 }}>
                <label>Preço/Kg</label>
                <input className={styles.inp} type="number" inputMode="decimal" value={v.preco}
                  onChange={(e) => atualizarVenda(idx, "preco", e.target.value)} />
              </div>
            </div>
            <div className={styles.chips} style={{ marginBottom: 10 }}>
              {FORMAS.map((f) => (
                <button key={f} type="button" className={styles.chip} aria-pressed={v.forma === f}
                  onClick={() => atualizarVenda(idx, "forma", f)}>
                  {f}
                </button>
              ))}
            </div>
            <div className={styles.checkRow}>
              <input type="checkbox" checked={v.emiteNf} onChange={(e) => atualizarVenda(idx, "emiteNf", e.target.checked)} id={`nf-${idx}`} />
              <label htmlFor={`nf-${idx}`}>Emite NF</label>
              <input type="checkbox" checked={v.emiteBoleto} onChange={(e) => atualizarVenda(idx, "emiteBoleto", e.target.checked)} id={`bol-${idx}`} style={{ marginLeft: 16 }} />
              <label htmlFor={`bol-${idx}`}>Emite boleto</label>
            </div>
            {vendas.length > 1 && (
              <button type="button" onClick={() => setVendas((ls) => ls.filter((_, i) => i !== idx))}
                style={{ marginTop: 8, background: "none", border: "none", color: "var(--crit)", fontSize: ".8rem", cursor: "pointer" }}>
                Remover
              </button>
            )}
          </div>
        ))}
        <button type="button" className={styles.chip} onClick={() => setVendas((ls) => [...ls, novaVenda(null)])}>
          + adicionar venda
        </button>

        <p className={styles.section} style={{ fontWeight: 700, fontSize: ".9rem", margin: "22px 0 8px" }}>Produtos retornados</p>
        {retornos.map((r, idx) => (
          <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 96px", gap: 10, marginBottom: 8, alignItems: "center" }}>
            <select className={styles.inp} value={r.produtoId ?? ""} onChange={(e) => {
              const val = e.target.value ? Number(e.target.value) : null;
              setRetornos((ls) => { const c = [...ls]; c[idx] = { ...c[idx], produtoId: val }; return c; });
            }}>
              <option value="">Selecione o produto</option>
              {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            <input className={styles.inp} style={{ padding: "9px 10px", textAlign: "right" }} type="number" inputMode="decimal"
              placeholder="0" value={r.quantidade}
              onChange={(e) => setRetornos((ls) => { const c = [...ls]; c[idx] = { ...c[idx], quantidade: e.target.value }; return c; })} />
          </div>
        ))}
        <button type="button" className={styles.chip} onClick={() => setRetornos((ls) => [...ls, { produtoId: null, quantidade: "" }])}>
          + adicionar retorno
        </button>

        <p className={styles.section} style={{ fontWeight: 700, fontSize: ".9rem", margin: "22px 0 8px" }}>Despesas da rota (em dinheiro)</p>
        {despesas.map((d, idx) => (
          <div key={idx} style={{ marginBottom: 10 }}>
            <div className={styles.chips} style={{ marginBottom: 8 }}>
              {CATEGORIAS_DESPESA.map((c) => (
                <button key={c} type="button" className={styles.chip} aria-pressed={d.categoria === c}
                  onClick={() => setDespesas((ls) => { const cp = [...ls]; cp[idx] = { ...cp[idx], categoria: c }; return cp; })}>
                  {c}
                </button>
              ))}
            </div>
            <input className={styles.inp} type="number" inputMode="decimal" placeholder="Valor (R$)" value={d.valor}
              onChange={(e) => setDespesas((ls) => { const c = [...ls]; c[idx] = { ...c[idx], valor: e.target.value }; return c; })} />
          </div>
        ))}
        <button type="button" className={styles.chip} onClick={() => setDespesas((ls) => [...ls, { categoria: "", valor: "", forma: "Dinheiro" }])}>
          + adicionar despesa
        </button>

        <div className={styles.derived} style={{ marginTop: 20 }}>
          <span className={styles.l}>Vendas em dinheiro − despesas em dinheiro</span>
          <span className={styles.v}>R$ {nf(totalVendidoDinheiro - totalDespesasDinheiro, 2)}</span>
        </div>
      </div>

      <div className={styles.savebar}>
        <button className={styles.btnPrimary} disabled={!podeSalvar} onClick={salvar}>
          {enviando ? "Salvando…" : "Salvar acerto"}
        </button>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
