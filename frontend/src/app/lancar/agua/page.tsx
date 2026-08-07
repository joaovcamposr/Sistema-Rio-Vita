"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listarViveiros, type Viveiro } from "@/lib/api";
import { enfileirar } from "@/lib/offline-queue";
import styles from "../form.module.css";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const CAMPOS: { chave: "oxigenio" | "temperatura_c" | "amonia" | "ph" | "nitrito" | "nitrato"; rotulo: string; dica: string }[] = [
  { chave: "oxigenio", rotulo: "Oxigênio", dica: "mg/L · ideal > 4" },
  { chave: "temperatura_c", rotulo: "Temperatura", dica: "°C" },
  { chave: "amonia", rotulo: "Amônia", dica: "mg/L · ideal < 1" },
  { chave: "ph", rotulo: "pH", dica: "ideal 6 a 8" },
  { chave: "nitrito", rotulo: "Nitrito", dica: "mg/L" },
  { chave: "nitrato", rotulo: "Nitrato", dica: "mg/L" },
];

export default function RegistrarAnaliseAgua() {
  const router = useRouter();
  const [viveiros, setViveiros] = useState<Viveiro[]>([]);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);
  const [viveiroId, setViveiroId] = useState<number | null>(null);
  const [data, setData] = useState(hojeISO());
  const [valores, setValores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    listarViveiros()
      .then((lista) => {
        setViveiros(lista);
        if (lista.length > 0) setViveiroId(lista[0].id);
      })
      .catch(() => setErroCarregar("Sem conexão e sem dados salvos deste aparelho ainda. Conecte-se ao menos uma vez."));
  }, []);

  const viveiro = viveiros.find((v) => v.id === viveiroId) ?? null;
  const algumPreenchido = CAMPOS.some((c) => (valores[c.chave] ?? "") !== "");
  const podeSalvar = viveiro !== null && algumPreenchido && !enviando;

  async function salvar() {
    if (!viveiro) return;
    setEnviando(true);
    try {
      const payload: Record<string, unknown> = { viveiro_id: viveiro.id, data };
      for (const c of CAMPOS) {
        const v = valores[c.chave];
        payload[c.chave] = v ? parseFloat(v.replace(",", ".")) : null;
      }
      await enfileirar("analise_agua", payload);
      setToast("Análise registrada");
      setValores({});
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
          <h1>Análise da água</h1>
          <div className={styles.sub}>{new Date().toLocaleDateString("pt-BR")}</div>
        </div>
      </div>

      <div className={styles.body}>
        {erroCarregar && <div className={styles.error}>{erroCarregar}</div>}

        <div className={styles.field}>
          <label>Viveiro</label>
          <select
            className={styles.inp}
            value={viveiroId ?? ""}
            disabled={viveiros.length === 0}
            onChange={(e) => setViveiroId(Number(e.target.value))}
          >
            {viveiros.map((v) => (
              <option key={v.id} value={v.id}>
                {v.tipo === "decantacao" ? `${v.codigo} — decantação` : `Viveiro ${v.codigo}`}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label>Data</label>
          <input className={styles.inp} type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>

        <p className={styles.hint}>Preencha só os parâmetros medidos nessa data.</p>
        {CAMPOS.map((c) => (
          <div key={c.chave} className={styles.lrow}>
            <div>
              <div className="nm" style={{ fontWeight: 700, fontSize: ".9rem" }}>{c.rotulo}</div>
              <div className={styles.mt}>{c.dica}</div>
            </div>
            <input
              className={styles.inp}
              style={{ padding: "9px 10px", fontSize: "1rem", textAlign: "right" }}
              type="number"
              inputMode="decimal"
              placeholder="—"
              value={valores[c.chave] ?? ""}
              onChange={(e) => setValores((s) => ({ ...s, [c.chave]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      <div className={styles.savebar}>
        <button className={styles.btnPrimary} disabled={!podeSalvar} onClick={salvar}>
          {enviando ? "Salvando…" : "Salvar análise"}
        </button>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
