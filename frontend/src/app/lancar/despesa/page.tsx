"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enfileirar } from "@/lib/offline-queue";
import styles from "../form.module.css";

const CATEGORIAS = ["Abastecimento", "Alimentação", "Manutenção", "Material de escritório", "Outro"];
const FORMAS = ["Dinheiro", "Pix", "Cartão"];

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function RegistrarDespesa() {
  const router = useRouter();
  const [data, setData] = useState(hojeISO());
  const [categoria, setCategoria] = useState(CATEGORIAS[0]);
  const [valor, setValor] = useState("");
  const [forma, setForma] = useState(FORMAS[0]);
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const valorNum = parseFloat(valor.replace(",", ".")) || 0;
  const podeSalvar = valorNum > 0 && !enviando;

  async function salvar() {
    setEnviando(true);
    try {
      await enfileirar("despesa", {
        data,
        categoria,
        valor: valorNum,
        forma_pgto: forma,
        observacao: observacao || null,
      });
      setToast("Despesa registrada");
      setValor("");
      setObservacao("");
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
          <h1>Registrar despesa</h1>
          <div className={styles.sub}>{new Date().toLocaleDateString("pt-BR")} · sem vínculo com expedição</div>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.field}>
          <label>Data</label>
          <input className={styles.inp} type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>

        <div className={styles.field}>
          <label>Categoria</label>
          <div className={styles.chips}>
            {CATEGORIAS.map((c) => (
              <button key={c} type="button" className={styles.chip} aria-pressed={categoria === c} onClick={() => setCategoria(c)}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label>Valor</label>
          <input
            className={`${styles.inp} ${styles.num}`}
            type="number"
            inputMode="decimal"
            placeholder="0,00"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label>Forma de pagamento</label>
          <div className={styles.chips}>
            {FORMAS.map((f) => (
              <button key={f} type="button" className={styles.chip} aria-pressed={forma === f} onClick={() => setForma(f)}>
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label>Observação (opcional)</label>
          <input className={styles.inp} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </div>
      </div>

      <div className={styles.savebar}>
        <button className={styles.btnPrimary} disabled={!podeSalvar} onClick={salvar}>
          {enviando ? "Salvando…" : "Salvar despesa"}
        </button>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
