"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listarViveiros, type Viveiro } from "@/lib/api";
import { enfileirar } from "@/lib/offline-queue";
import styles from "../form.module.css";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function RegistrarBiometria() {
  const router = useRouter();
  const [viveiros, setViveiros] = useState<Viveiro[]>([]);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);
  const [valores, setValores] = useState<Record<number, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    listarViveiros()
      .then((lista) => setViveiros(lista.filter((v) => v.lote_atual !== null)))
      .catch(() => setErroCarregar("Sem conexão e sem dados salvos deste aparelho ainda. Conecte-se ao menos uma vez."));
  }, []);

  const preenchidos = Object.entries(valores).filter(([, v]) => (parseFloat(v.replace(",", ".")) || 0) > 0);
  const podeSalvar = preenchidos.length > 0 && !enviando;

  async function salvar() {
    setEnviando(true);
    try {
      const data = hojeISO();
      for (const [viveiroId, valor] of preenchidos) {
        const v = viveiros.find((vv) => vv.id === Number(viveiroId));
        if (!v?.lote_atual) continue;
        await enfileirar("biometria", {
          lote_id: v.lote_atual.id,
          data,
          peso_medio_g: parseFloat(valor.replace(",", ".")),
        });
      }
      setToast(`${preenchidos.length} ${preenchidos.length === 1 ? "biometria registrada" : "biometrias registradas"}`);
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
          <h1>Biometria</h1>
          <div className={styles.sub}>{new Date().toLocaleDateString("pt-BR")} · peso médio em gramas</div>
        </div>
      </div>

      <div className={styles.body}>
        {erroCarregar && <div className={styles.error}>{erroCarregar}</div>}
        <p className={styles.hint}>Preencha só os viveiros medidos hoje.</p>

        {viveiros.length === 0 && <p className={styles.hint}>Nenhum viveiro com lote ativo.</p>}
        {viveiros.map((v) => (
          <div key={v.id} className={styles.lrow}>
            <div>
              <div className="nm" style={{ fontWeight: 700, fontSize: ".9rem" }}>Viveiro {v.codigo}</div>
              <div className={styles.mt}>{v.lote_atual!.fase === "pre_engorda" ? "pré-engorda" : "engorda"}</div>
            </div>
            <input
              className={`${styles.inp} ${styles.num} ${styles.lrow}`}
              style={{ padding: "9px 10px" }}
              type="number"
              inputMode="decimal"
              placeholder="—"
              value={valores[v.id] ?? ""}
              onChange={(e) => setValores((s) => ({ ...s, [v.id]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      <div className={styles.savebar}>
        <button className={styles.btnPrimary} disabled={!podeSalvar} onClick={salvar}>
          {enviando
            ? "Salvando…"
            : `Salvar ${preenchidos.length > 0 ? preenchidos.length : ""} ${preenchidos.length === 1 ? "biometria" : "biometrias"}`}
        </button>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
