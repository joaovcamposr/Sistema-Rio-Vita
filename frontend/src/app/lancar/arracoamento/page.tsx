"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listarViveiros, type Viveiro } from "@/lib/api";
import { listarFornecedoresRacao, type FornecedorRacao } from "@/lib/cadastros";
import { enfileirar } from "@/lib/offline-queue";
import styles from "../form.module.css";

const TRATOS = ["08:30", "10:30", "12:00", "15:30"];

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function RegistrarArracoamento() {
  const router = useRouter();
  const [viveiros, setViveiros] = useState<Viveiro[]>([]);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);
  const [data, setData] = useState(hojeISO());
  const [trato, setTrato] = useState(TRATOS[0]);
  const [valores, setValores] = useState<Record<number, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tiposRacao, setTiposRacao] = useState<{ id: number; codigo: string; fornecedorNome: string }[]>([]);
  const [tipoRacaoId, setTipoRacaoId] = useState<number | null>(null);

  useEffect(() => {
    listarViveiros()
      .then((lista) => setViveiros(lista.filter((v) => v.lote_atual !== null)))
      .catch(() => setErroCarregar("Sem conexão e sem dados salvos deste aparelho ainda. Conecte-se ao menos uma vez."));
    listarFornecedoresRacao()
      .then((fs: FornecedorRacao[]) => {
        const todos = fs.flatMap((f) => f.tipos.map((t) => ({ id: t.id, codigo: t.codigo, fornecedorNome: f.nome })));
        setTiposRacao(todos);
        if (todos.length > 0) setTipoRacaoId(todos[0].id);
      })
      .catch(() => {});
  }, []);

  const preenchidos = Object.entries(valores).filter(([, v]) => (parseFloat(v.replace(",", ".")) || 0) >= 0 && v !== "");
  const podeSalvar = preenchidos.length > 0 && !enviando;

  async function salvar() {
    setEnviando(true);
    try {
      for (const [viveiroId, valor] of preenchidos) {
        const v = viveiros.find((vv) => vv.id === Number(viveiroId));
        if (!v?.lote_atual) continue;
        await enfileirar("arracoamento", {
          lote_id: v.lote_atual.id,
          data,
          trato,
          sacos: parseFloat(valor.replace(",", ".")),
          tipo_racao_id: tipoRacaoId,
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
        <button
          type="button"
          onClick={() => router.push("/lancar/arracoamento-foto")}
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

        <div className={styles.field}>
          <label>Tipo de ração</label>
          <div className={styles.chips}>
            {tiposRacao.map((t) => (
              <button
                key={t.id}
                type="button"
                className={styles.chip}
                aria-pressed={tipoRacaoId === t.id}
                onClick={() => setTipoRacaoId(t.id)}
              >
                {t.codigo}
              </button>
            ))}
          </div>
          {tiposRacao.length === 0 && (
            <p className={styles.hint}>Nenhum tipo de ração cadastrado — vale lançar mesmo assim, sem tipo.</p>
          )}
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
