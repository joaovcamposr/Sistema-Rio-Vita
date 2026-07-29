"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listarViveiros, type Viveiro } from "@/lib/api";
import { enfileirar } from "@/lib/offline-queue";
import styles from "../form.module.css";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function RegistrarPovoamento() {
  const router = useRouter();
  const [viveiros, setViveiros] = useState<Viveiro[]>([]);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);

  const [viveiroId, setViveiroId] = useState<number | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [pesoMedio, setPesoMedio] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    listarViveiros()
      .then((lista) => {
        const vazios = lista.filter((v) => v.lote_atual === null && v.tipo !== "decantacao");
        setViveiros(vazios);
        if (vazios.length > 0) setViveiroId(vazios[0].id);
      })
      .catch(() => setErroCarregar("Sem conexão e sem dados salvos deste aparelho ainda. Conecte-se ao menos uma vez."));
  }, []);

  const viveiro = viveiros.find((v) => v.id === viveiroId) ?? null;
  const qtdNum = parseFloat(quantidade.replace(",", ".")) || 0;
  const pesoNum = parseFloat(pesoMedio.replace(",", ".")) || 0;
  const podeSalvar = viveiro !== null && qtdNum > 0 && pesoNum > 0 && !enviando;

  async function salvar() {
    if (!viveiro) return;
    setEnviando(true);
    try {
      await enfileirar("povoamento", {
        viveiro_id: viveiro.id,
        data: hojeISO(),
        quantidade_inicial: Math.round(qtdNum),
        peso_medio_inicial_g: pesoNum,
        observacao: observacao || null,
      });
      setToast("Povoamento registrado");
      setQuantidade("");
      setPesoMedio("");
      setObservacao("");
      setViveiros((vs) => vs.filter((v) => v.id !== viveiro.id));
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
          <h1>Registrar povoamento</h1>
          <div className={styles.sub}>{new Date().toLocaleDateString("pt-BR")}</div>
        </div>
      </div>

      <div className={styles.body}>
        {erroCarregar && <div className={styles.error}>{erroCarregar}</div>}
        <p className={styles.hint}>Só aparecem viveiros vazios. O código do lote é gerado automaticamente.</p>

        <div className={styles.field}>
          <label>Viveiro</label>
          <select
            className={styles.inp}
            value={viveiroId ?? ""}
            disabled={viveiros.length === 0}
            onChange={(e) => setViveiroId(Number(e.target.value))}
          >
            {viveiros.length === 0 && <option>Nenhum viveiro vazio disponível</option>}
            {viveiros.map((v) => (
              <option key={v.id} value={v.id}>
                Viveiro {v.codigo} ({v.tipo === "pre_engorda" ? "pré-engorda" : "engorda"})
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label>Quantidade (peixes)</label>
          <input
            className={`${styles.inp} ${styles.num}`}
            type="number"
            inputMode="numeric"
            placeholder="0"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label>Peso médio (g)</label>
          <input
            className={`${styles.inp} ${styles.num}`}
            type="number"
            inputMode="decimal"
            placeholder="0"
            value={pesoMedio}
            onChange={(e) => setPesoMedio(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label>Observação (opcional)</label>
          <input
            className={styles.inp}
            type="text"
            placeholder=""
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.savebar}>
        <button className={styles.btnPrimary} disabled={!podeSalvar} onClick={salvar}>
          {enviando ? "Salvando…" : "Salvar povoamento"}
        </button>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
