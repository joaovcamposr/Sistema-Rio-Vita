"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listarProdutos, type Produto } from "@/lib/api";
import { editarExpedicao, listarExpedicoesAbertas, listarVendedores, type Expedicao, type Vendedor } from "@/lib/cadastros";
import { enfileirar } from "@/lib/offline-queue";
import styles from "../form.module.css";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function RegistrarExpedicao() {
  const router = useRouter();
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);

  const [vendedorId, setVendedorId] = useState<number | null>(null);
  const [valores, setValores] = useState<Record<number, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [expedicoesAbertas, setExpedicoesAbertas] = useState<Expedicao[]>([]);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [dataSaidaEdicao, setDataSaidaEdicao] = useState(hojeISO());
  const [observacaoEdicao, setObservacaoEdicao] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listarVendedores(), listarProdutos(), listarExpedicoesAbertas()])
      .then(([vs, ps, es]) => {
        setVendedores(vs);
        setProdutos(ps);
        setExpedicoesAbertas(es);
        if (vs.length > 0) setVendedorId(vs[0].id);
      })
      .catch(() => setErroCarregar("Sem conexão e sem dados salvos deste aparelho ainda. Conecte-se ao menos uma vez."));
  }, []);

  function iniciarEdicao(id: number | "") {
    if (id === "") {
      setEditandoId(null);
      setValores({});
      setDataSaidaEdicao(hojeISO());
      setObservacaoEdicao(null);
      if (vendedores.length > 0) setVendedorId(vendedores[0].id);
      return;
    }
    const exp = expedicoesAbertas.find((e) => e.id === id);
    if (!exp) return;
    setEditandoId(exp.id);
    setVendedorId(exp.vendedor_id);
    setDataSaidaEdicao(exp.data_saida);
    setObservacaoEdicao(exp.observacao);
    const novosValores: Record<number, string> = {};
    for (const item of exp.itens) {
      const valor = item.quantidade_embalagens ?? item.quantidade_kg;
      novosValores[item.produto_id] = String(valor).replace(".", ",");
    }
    setValores(novosValores);
  }

  const preenchidos = Object.entries(valores).filter(([, v]) => (parseFloat(v.replace(",", ".")) || 0) > 0);
  const podeSalvar = vendedorId !== null && preenchidos.length > 0 && !enviando;

  async function salvar() {
    if (!vendedorId) return;
    setEnviando(true);
    try {
      const itens = preenchidos.map(([produtoId, valor]) => {
        const p = produtos.find((pp) => pp.id === Number(produtoId));
        const qtd = parseFloat(valor.replace(",", "."));
        return {
          produto_id: Number(produtoId),
          quantidade_embalagens: p?.kg_digitado ? null : qtd,
          quantidade_kg: p?.kg_digitado ? qtd : (p?.fator_kg ?? 1) * qtd,
        };
      });
      if (editandoId !== null) {
        await editarExpedicao(editandoId, {
          vendedor_id: vendedorId, data_saida: dataSaidaEdicao, observacao: observacaoEdicao, itens,
        });
        setToast("Expedição corrigida");
        setEditandoId(null);
        setValores({});
        listarExpedicoesAbertas().then(setExpedicoesAbertas).catch(() => {});
      } else {
        await enfileirar("expedicao", {
          vendedor_id: vendedorId,
          data_saida: dataSaidaEdicao,
          itens,
        });
        setToast("Expedição registrada");
        setValores({});
      }
      setTimeout(() => setToast(null), 2200);
    } catch {
      setToast("Não foi possível salvar — confira a conexão e tente de novo");
      setTimeout(() => setToast(null), 3200);
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
          <h1>{editandoId !== null ? "Editar expedição" : "Registrar expedição"}</h1>
          <div className={styles.sub}>{new Date().toLocaleDateString("pt-BR")} · saída de produtos</div>
        </div>
      </div>

      <div className={styles.body}>
        {erroCarregar && <div className={styles.error}>{erroCarregar}</div>}

        {expedicoesAbertas.length > 0 && (
          <div className={styles.field}>
            <label>Corrigir uma expedição em aberto (opcional)</label>
            <select
              className={styles.inp}
              value={editandoId ?? ""}
              onChange={(e) => iniciarEdicao(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">— Nova expedição —</option>
              {expedicoesAbertas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.vendedor_nome} — saiu em {e.data_saida.split("-").reverse().join("/")}
                </option>
              ))}
            </select>
            {editandoId !== null && (
              <p className={styles.hint} style={{ margin: "6px 0 0" }}>
                Só dá pra corrigir enquanto ainda não foi feito o acerto dela. A correção fica registrada.
              </p>
            )}
          </div>
        )}

        <div className={styles.field}>
          <label>Data de saída</label>
          <input
            className={styles.inp}
            type="date"
            value={dataSaidaEdicao}
            onChange={(e) => setDataSaidaEdicao(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label>Vendedor/entregador</label>
          <div className={styles.chips}>
            {vendedores.map((v) => (
              <button
                key={v.id}
                type="button"
                className={styles.chip}
                aria-pressed={vendedorId === v.id}
                onClick={() => setVendedorId(v.id)}
              >
                {v.nome}
              </button>
            ))}
          </div>
          {vendedores.length === 0 && <p className={styles.hint}>Nenhum vendedor cadastrado ainda.</p>}
        </div>

        <p className={styles.hint}>Preencha a quantidade de cada produto que sai com essa carga.</p>
        {produtos.map((p) => (
          <div key={p.id} className={styles.lrow}>
            <div>
              <div className="nm" style={{ fontWeight: 700, fontSize: ".9rem" }}>{p.nome}</div>
              <div className={styles.mt}>{p.kg_digitado ? "Kg" : p.unidade_embalagem === "pacote" ? "pacotes" : "bandejas"}</div>
            </div>
            <input
              className={styles.inp}
              style={{ padding: "9px 10px", fontSize: "1rem", textAlign: "right" }}
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={valores[p.id] ?? ""}
              onChange={(e) => setValores((s) => ({ ...s, [p.id]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      <div className={styles.savebar}>
        <button className={styles.btnPrimary} disabled={!podeSalvar} onClick={salvar}>
          {enviando ? "Salvando…" : editandoId !== null ? "Salvar correção" : "Salvar expedição"}
        </button>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
