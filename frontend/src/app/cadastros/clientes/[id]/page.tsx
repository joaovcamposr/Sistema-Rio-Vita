"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  atualizarCliente,
  definirPrecoCliente,
  excluirCliente,
  listarPrecosCliente,
  listarVendedores,
  obterCliente,
  type ClienteDetalhe,
  type ClienteProdutoPreco,
  type Vendedor,
} from "@/lib/cadastros";
import styles from "../../cadastros.module.css";

export default function EditarCliente() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const clienteId = Number(params.id);

  const [cliente, setCliente] = useState<ClienteDetalhe | null>(null);
  const [precos, setPrecos] = useState<ClienteProdutoPreco[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [precoEditando, setPrecoEditando] = useState<Record<number, string>>({});

  useEffect(() => {
    Promise.all([obterCliente(clienteId), listarPrecosCliente(clienteId), listarVendedores()])
      .then(([c, ps, vs]) => {
        setCliente(c);
        setPrecos(ps);
        setVendedores(vs);
        setPrecoEditando(Object.fromEntries(ps.map((p) => [p.produto_id, p.preco > 0 ? String(p.preco) : ""])));
      })
      .catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }, [clienteId]);

  function atualizarCampo<K extends keyof ClienteDetalhe>(campo: K, valor: ClienteDetalhe[K]) {
    setCliente((c) => (c ? { ...c, [campo]: valor } : c));
  }

  async function salvarCadastro() {
    if (!cliente) return;
    setSalvando(true);
    try {
      const atualizado = await atualizarCliente(clienteId, {
        nome: cliente.nome, cnpj: cliente.cnpj, contato: cliente.contato, cidade: cliente.cidade,
        prazo_dias: cliente.prazo_dias, emite_nf: cliente.emite_nf, emite_boleto: cliente.emite_boleto,
        vendedor_id: cliente.vendedor_id, vendedor_nome: cliente.vendedor_nome,
      });
      setCliente(atualizado);
      setToast("Cadastro atualizado");
      setTimeout(() => setToast(null), 2200);
    } catch {
      setErro("Não foi possível salvar — verifique a conexão.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!cliente) return;
    if (!window.confirm(`Excluir ${cliente.nome}? Vendas já feitas para ele continuam no histórico.`)) return;
    try {
      await excluirCliente(clienteId);
      router.push("/cadastros/clientes");
    } catch {
      setErro("Não foi possível excluir — verifique a conexão.");
    }
  }

  async function salvarPreco(produtoId: number) {
    const valor = parseFloat((precoEditando[produtoId] ?? "").replace(",", "."));
    if (!(valor >= 0)) return;
    try {
      const novos = await definirPrecoCliente(clienteId, produtoId, valor);
      setPrecos(novos);
      setToast("Preço atualizado");
      setTimeout(() => setToast(null), 1800);
    } catch {
      setErro("Não foi possível salvar o preço — verifique a conexão.");
    }
  }

  if (erro) {
    return (
      <div className={styles.page}>
        <div className={styles.appbar}>
          <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/cadastros/clientes")}>←</button>
          <div><h1>Cliente</h1></div>
        </div>
        <div className={styles.body}><div className={styles.error}>{erro}</div></div>
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className={styles.page}>
        <div className={styles.body}><p className={styles.hint}>Carregando…</p></div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/cadastros/clientes")}>
          ←
        </button>
        <div>
          <h1>{cliente.nome}</h1>
        </div>
      </div>
      <div className={styles.body}>
        <p className={styles.section}>Cadastro</p>
        <div className={styles.field}>
          <label>Nome</label>
          <input className={styles.inp} value={cliente.nome} onChange={(e) => atualizarCampo("nome", e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>CNPJ</label>
          <input className={styles.inp} value={cliente.cnpj ?? ""} onChange={(e) => atualizarCampo("cnpj", e.target.value || null)} />
        </div>
        <div className={styles.field}>
          <label>Contato</label>
          <input className={styles.inp} value={cliente.contato ?? ""} onChange={(e) => atualizarCampo("contato", e.target.value || null)} />
        </div>
        <div className={styles.field}>
          <label>Cidade</label>
          <input className={styles.inp} value={cliente.cidade ?? ""} onChange={(e) => atualizarCampo("cidade", e.target.value || null)} />
        </div>
        <div className={styles.field}>
          <label>Prazo (dias)</label>
          <input
            className={styles.inp} type="number" inputMode="numeric"
            value={cliente.prazo_dias ?? ""}
            onChange={(e) => atualizarCampo("prazo_dias", e.target.value ? Number(e.target.value) : null)}
          />
        </div>
        <div className={styles.field}>
          <label>Vendedor</label>
          <select
            className={styles.inp}
            value={cliente.vendedor_id ?? ""}
            onChange={(e) => atualizarCampo("vendedor_id", e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Sem vendedor definido</option>
            {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
        </div>
        <div className={styles.checkRow}>
          <input type="checkbox" id="nf" checked={cliente.emite_nf} onChange={(e) => atualizarCampo("emite_nf", e.target.checked)} />
          <label htmlFor="nf">Emite NF</label>
        </div>
        <div className={styles.checkRow}>
          <input type="checkbox" id="boleto" checked={cliente.emite_boleto} onChange={(e) => atualizarCampo("emite_boleto", e.target.checked)} />
          <label htmlFor="boleto">Emite boleto</label>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className={styles.btnPrimary} disabled={salvando} onClick={salvarCadastro}>
            {salvando ? "Salvando…" : "Salvar cadastro"}
          </button>
          <button className={styles.btnLink} style={{ color: "var(--crit)" }} onClick={excluir}>
            Excluir cliente
          </button>
        </div>

        <p className={styles.section}>Preço por produto (R$/Kg)</p>
        <p className={styles.hint}>Sempre em preço por Kg. Puxa automaticamente na tela de venda/acerto — pode ser alterado ali para um caso específico.</p>
        {precos.map((p) => (
          <div key={p.produto_id} className={styles.precoRow}>
            <span>{p.produto_nome}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                className={styles.inp}
                type="number"
                inputMode="decimal"
                placeholder="0,00"
                value={precoEditando[p.produto_id] ?? ""}
                onChange={(e) => setPrecoEditando((s) => ({ ...s, [p.produto_id]: e.target.value }))}
              />
              <button className={styles.btnLink} onClick={() => salvarPreco(p.produto_id)}>Salvar</button>
            </div>
          </div>
        ))}
      </div>
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
