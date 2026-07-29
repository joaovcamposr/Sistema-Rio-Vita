"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listarViveiros, type Viveiro } from "@/lib/api";
import { enfileirar } from "@/lib/offline-queue";
import styles from "../form.module.css";

const TRATOS = ["07:00", "09:00", "11:00", "13:00", "15:00", "17:00"];

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function RegistrarArracoamento() {
  const router = useRouter();
  const [viveiros, setViveiros] = useState<Viveiro[]>([]);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);
  const [trato, setTrato] = useState(TRATOS[0]);
  const [valores, setValores] = useState<Record<number, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    listarViveiros()
      .then((lista) => setViveiros(lista.filter((v) => v.lote_atual !== null)))
      .catch(() => setErroCarregar("Sem conexão e sem dados salvos deste aparelho ainda. Conecte-se ao menos uma vez."));
  }, []);

  const preenchidos = Object.entries(valores).filter(([, v]) => (parseFloat(v.replace(",", ".")) || 0) >= 0 && v !== "");
  const podeSalvar = preenchidos.length > 0 && !enviando;

  async function salvar() {
    setEnviando(true);
    try {
      const data = hojeISO();
      for (const [viveiroId, valor] of preenchidos) {
        const v = viveiros.find((vv) => vv.id === Number(viveiroId));
        if (!v?.lote_atual) continue;
        await enfileirar("arracoamento", {
          lote_id: v.lote_atual.id,
          data,
          trato,
          sacos: parseFloat(valor.replace(",", ".")),
        });
      }
      setToast(`Arraçoamento das ${trato} registrado`);
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
          <h1>Arraçoamento</h1>
          <div className={styles.sub}>{new Date().toLocaleDateString("pt-BR")} · sacos de 25 Kg</div>
        </div>
      </div>

      <div className={styles.body}>
        {erroCarregar && <div className={styles.error}>{erroCarregar}</div>}

        <div className={styles.field}>
          <label>Trato</label>
          <div className={styles.chips}>
            {TRATOS.map((t) => (
              <button
                key={t}
                type="button"
                className={styles.chip}
                aria-pressed={trato === t}
                onClick={() => setTrato(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <p className={styles.hint} style={{ margin: "6px 0 0" }}>
            Os horários acima são os padrão — se o trato foi feito num horário diferente, ajuste aqui.
          </p>
          <input
            className={styles.inp}
            style={{ marginTop: 6, width: 140 }}
            type="time"
            value={trato}
            onChange={(e) => setTrato(e.target.value)}
          />
        </div>

        {viveiros.length === 0 && <p className={styles.hint}>Nenhum viveiro com lote ativo.</p>}
        {viveiros.map((v) => (
          <div key={v.id} className={styles.lrow}>
            <div>
              <div className="nm" style={{ fontWeight: 700, fontSize: ".9rem" }}>Viveiro {v.codigo}</div>
            </div>
            <input
              className={styles.inp}
              style={{ padding: "9px 10px", fontSize: "1rem", textAlign: "right" }}
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={valores[v.id] ?? ""}
              onChange={(e) => setValores((s) => ({ ...s, [v.id]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      <div className={styles.savebar}>
        <button className={styles.btnPrimary} disabled={!podeSalvar} onClick={salvar}>
          {enviando ? "Salvando…" : `Salvar trato das ${trato}`}
        </button>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
