"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listarDespescasDoLote,
  listarProdutos,
  listarViveiros,
  resumoDespesca,
  type Despesca,
  type Produto,
  type Viveiro,
} from "@/lib/api";
import { enfileirar } from "@/lib/offline-queue";
import styles from "../form.module.css";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function nf(v: number, casas = 1): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function pct(v: number): string {
  return (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

export default function RegistrarProducao() {
  const router = useRouter();

  const [viveiros, setViveiros] = useState<Viveiro[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [despescas, setDespescas] = useState<Despesca[]>([]);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);

  const [data, setData] = useState(hojeISO());
  const [produtoId, setProdutoId] = useState<number | null>(null);
  const [viveiroId, setViveiroId] = useState<number | null>(null);
  const [despescaId, setDespescaId] = useState<number | null>(null);
  const [bandejas, setBandejas] = useState("");
  const [kgDigitado, setKgDigitado] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [resumo, setResumo] = useState<{ peso_despescado_kg: number; kg_file_lancado: number } | null>(null);

  useEffect(() => {
    Promise.all([listarViveiros(), listarProdutos()])
      .then(([lv, lp]) => {
        const comLote = lv.filter((v) => v.lote_atual !== null);
        setViveiros(comLote);
        setProdutos(lp);
        if (comLote.length > 0) setViveiroId(comLote[0].id);
        if (lp.length > 0) setProdutoId(lp[0].id);
      })
      .catch(() => setErroCarregar("Sem conexão e sem dados salvos deste aparelho ainda. Conecte-se ao menos uma vez."));
  }, []);

  const viveiro = useMemo(() => viveiros.find((v) => v.id === viveiroId) ?? null, [viveiros, viveiroId]);
  const lote = viveiro?.lote_atual ?? null;
  const produto = useMemo(() => produtos.find((p) => p.id === produtoId) ?? null, [produtos, produtoId]);
  const ehFile = produto?.nome.startsWith("Filé") ?? false;

  // recarrega as despescas desse lote sempre que o viveiro muda
  useEffect(() => {
    setDespescaId(null);
    setResumo(null);
    if (!lote) {
      setDespescas([]);
      return;
    }
    listarDespescasDoLote(lote.id)
      .then((lista) => {
        setDespescas(lista);
        if (lista.length > 0) setDespescaId(lista[0].id);
      })
      .catch(() => setDespescas([]));
  }, [lote?.id]);

  // busca o resumo (peso despescado + Kg de filé já lançado) da despesca escolhida
  useEffect(() => {
    if (despescaId === null) {
      setResumo(null);
      return;
    }
    resumoDespesca(despescaId)
      .then(setResumo)
      .catch(() => setResumo(null));
  }, [despescaId]);

  const despescaSelecionada = despescas.find((d) => d.id === despescaId) ?? null;

  const qtdBandejasNum = parseFloat(bandejas.replace(",", ".")) || 0;
  const kgDigitadoNum = parseFloat(kgDigitado.replace(",", ".")) || 0;
  const kgConvertido = produto && !produto.kg_digitado && produto.fator_kg ? qtdBandejasNum * produto.fator_kg : 0;
  const kgFinal = produto?.kg_digitado ? kgDigitadoNum : kgConvertido;

  const rendimento =
    ehFile && resumo && resumo.peso_despescado_kg > 0
      ? (resumo.kg_file_lancado + kgFinal) / resumo.peso_despescado_kg
      : null;

  const podeSalvar =
    produto !== null &&
    (produto.kg_digitado ? kgDigitadoNum > 0 : qtdBandejasNum > 0) &&
    !enviando;

  async function salvar() {
    if (!produto) return;
    setEnviando(true);
    try {
      await enfileirar("producao", {
        data,
        produto_id: produto.id,
        quantidade_embalagens: produto.kg_digitado ? (qtdBandejasNum > 0 ? qtdBandejasNum : null) : qtdBandejasNum,
        quantidade_kg: produto.kg_digitado ? kgDigitadoNum : 0,
        lote_id: lote?.id ?? null,
        data_despesca: despescaSelecionada?.data ?? null,
      });
      setToast("Produção registrada");
      setBandejas("");
      setKgDigitado("");
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
          <h1>Registrar produção</h1>
          <div className={styles.sub}>{new Date().toLocaleDateString("pt-BR")}</div>
        </div>
        <button
          type="button"
          onClick={() => router.push("/lancar/producao-foto")}
          style={{
            marginLeft: "auto", border: "1px solid var(--rule-strong)", background: "var(--surface)",
            color: "var(--ink)", borderRadius: 10, padding: "8px 12px", fontSize: "0.8rem",
            fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          📸 Por foto
        </button>
      </div>

      <div className={styles.body}>
        {erroCarregar && <div className={styles.error}>{erroCarregar}</div>}

        <div className={styles.field}>
          <label>Data</label>
          <input className={styles.inp} type="date" value={data} onChange={(e) => setData(e.target.value)} />
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

        {produto?.kg_digitado ? (
          <>
            <div className={styles.field}>
              <label>Quantidade (unidades)</label>
              <input
                className={`${styles.inp} ${styles.num}`}
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={bandejas}
                onChange={(e) => setBandejas(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label>Peso total (Kg)</label>
              <input
                className={`${styles.inp} ${styles.num}`}
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={kgDigitado}
                onChange={(e) => setKgDigitado(e.target.value)}
              />
            </div>
          </>
        ) : (
          <>
            <div className={styles.field}>
              <label>{produto?.unidade_embalagem === "pacote" ? "Pacotes" : "Bandejas"} produzidas</label>
              <input
                className={`${styles.inp} ${styles.num}`}
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={bandejas}
                onChange={(e) => setBandejas(e.target.value)}
              />
            </div>
            <div className={styles.derived}>
              <span className={styles.l}>Produção em Kg</span>
              <span className={styles.v}>{nf(kgConvertido)}</span>
            </div>
          </>
        )}

        <div className={styles.field}>
          <label>Viveiro de origem</label>
          <select
            className={styles.inp}
            value={viveiroId ?? ""}
            disabled={viveiros.length === 0}
            onChange={(e) => setViveiroId(Number(e.target.value))}
          >
            {viveiros.length === 0 && <option>Nenhum viveiro com lote ativo</option>}
            {viveiros.map((v) => (
              <option key={v.id} value={v.id}>
                Viveiro {v.codigo} — lote {v.lote_atual!.codigo}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label>Despesca de origem</label>
          <select
            className={styles.inp}
            value={despescaId ?? ""}
            disabled={despescas.length === 0}
            onChange={(e) => setDespescaId(Number(e.target.value))}
          >
            {despescas.length === 0 && <option>Nenhuma despesca lançada para este lote</option>}
            {despescas.map((d) => (
              <option key={d.id} value={d.id}>
                {new Date(d.data + "T00:00:00").toLocaleDateString("pt-BR")} — {nf(d.peso_total_kg)} Kg ·{" "}
                {nf(d.peso_medio_g, 0)} g médio
              </option>
            ))}
          </select>
        </div>

        {ehFile && rendimento !== null && (
          <div className={styles.derived}>
            <span className={styles.l}>
              Rendimento da despesca
              {resumo && (
                <>
                  <br />
                  <span style={{ fontWeight: 400, opacity: 0.85 }}>
                    {nf(resumo.kg_file_lancado)} Kg de filé já lançados
                  </span>
                </>
              )}
            </span>
            <span className={styles.v}>{pct(rendimento)}</span>
          </div>
        )}
      </div>

      <div className={styles.savebar}>
        <button className={styles.btnPrimary} disabled={!podeSalvar} onClick={salvar}>
          {enviando ? "Salvando…" : "Salvar produção"}
        </button>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
