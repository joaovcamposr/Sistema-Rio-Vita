"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { encerrarLote, listarViveiros, type Viveiro } from "@/lib/api";
import { enfileirar } from "@/lib/offline-queue";
import styles from "../form.module.css";

const DESTINOS = [
  { valor: "file", rotulo: "Filé" },
  { valor: "postas", rotulo: "Postas" },
  { valor: "inteira_limpa", rotulo: "Inteira limpa" },
  { valor: "inteira_suja", rotulo: "Inteira suja" },
] as const;

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function nf(v: number, casas = 1): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export default function RegistrarDespesca() {
  const router = useRouter();
  const [viveiros, setViveiros] = useState<Viveiro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);

  const [data, setData] = useState(hojeISO());
  const [destino, setDestino] = useState<(typeof DESTINOS)[number]["valor"]>("file");
  const [viveiroId, setViveiroId] = useState<number | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [pesoMedio, setPesoMedio] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [encerrarTanque, setEncerrarTanque] = useState(true);

  useEffect(() => {
    listarViveiros()
      .then((lista) => {
        const comLote = lista.filter((v) => v.lote_atual !== null);
        setViveiros(comLote);
        if (comLote.length > 0) setViveiroId(comLote[0].id);
      })
      .catch(() => setErroCarregar("Sem conexão e sem dados salvos deste aparelho ainda. Conecte-se ao menos uma vez."))
      .finally(() => setCarregando(false));
  }, []);

  const viveiro = useMemo(() => viveiros.find((v) => v.id === viveiroId) ?? null, [viveiros, viveiroId]);
  const lote = viveiro?.lote_atual ?? null;

  const qtdNum = parseFloat(quantidade.replace(",", ".")) || 0;
  const pesoNum = parseFloat(pesoMedio.replace(",", ".")) || 0;
  const pesoTotalKg = (qtdNum * pesoNum) / 1000;
  const saldoDepois = lote ? lote.saldo_un - qtdNum : null;

  const podeSalvar = lote !== null && qtdNum > 0 && pesoNum > 0 && !enviando;

  async function salvar() {
    if (!lote) return;
    setEnviando(true);
    try {
      await enfileirar("despesca", {
        lote_id: lote.id,
        data,
        destino,
        quantidade_un: Math.round(qtdNum),
        peso_medio_g: pesoNum,
      });
      let msg = "Despesca registrada";
      if (encerrarTanque && saldoDepois !== null && saldoDepois <= 0) {
        try {
          await encerrarLote(lote.id, data);
          msg = "Despesca registrada — lote encerrado";
        } catch {
          msg = "Despesca registrada — não deu pra encerrar o lote agora, tente de novo com conexão";
        }
      }
      setToast(msg);
      setQuantidade("");
      setPesoMedio("");
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
          <h1>Registrar despesca</h1>
          <div className={styles.sub}>{new Date().toLocaleDateString("pt-BR")}</div>
        </div>
      </div>

      <div className={styles.body}>
        {erroCarregar && <div className={styles.error}>{erroCarregar}</div>}

        <div className={styles.field}>
          <label>Data</label>
          <input className={styles.inp} type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>

        <div className={styles.field}>
          <label>Destino</label>
          <div className={styles.chips}>
            {DESTINOS.map((d) => (
              <button
                key={d.valor}
                type="button"
                className={styles.chip}
                aria-pressed={destino === d.valor}
                onClick={() => setDestino(d.valor)}
              >
                {d.rotulo}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label>Viveiro</label>
          <select
            className={styles.inp}
            value={viveiroId ?? ""}
            disabled={carregando || viveiros.length === 0}
            onChange={(e) => setViveiroId(Number(e.target.value))}
          >
            {viveiros.length === 0 && <option>Nenhum viveiro com lote ativo</option>}
            {viveiros.map((v) => (
              <option key={v.id} value={v.id}>
                Viveiro {v.codigo} — {v.lote_atual!.saldo_un.toLocaleString("pt-BR")} peixes
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

        <div className={styles.derived}>
          <span className={styles.l}>Peso total</span>
          <span className={styles.v}>{nf(pesoTotalKg)} Kg</span>
        </div>

        {saldoDepois !== null && (
          <div className={styles.note}>
            Saldo do viveiro {viveiro?.codigo} depois deste lançamento:{" "}
            <strong>{saldoDepois.toLocaleString("pt-BR")} peixes</strong>
            {saldoDepois < 0 && (
              <span style={{ color: "var(--crit)", display: "block", marginTop: 4 }}>
                Isso é mais do que o saldo atual — confira a quantidade antes de salvar.
              </span>
            )}
            {saldoDepois <= 0 && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontWeight: 600, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  style={{ width: 18, height: 18, accentColor: "var(--brand)" }}
                  checked={encerrarTanque}
                  onChange={(e) => setEncerrarTanque(e.target.checked)}
                />
                Tanque zerou — encerrar este lote
              </label>
            )}
          </div>
        )}
      </div>

      <div className={styles.savebar}>
        <button className={styles.btnPrimary} disabled={!podeSalvar} onClick={salvar}>
          {enviando ? "Salvando…" : "Salvar despesca"}
        </button>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
