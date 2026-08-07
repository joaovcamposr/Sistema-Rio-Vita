"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { listarViveiros, type Viveiro } from "@/lib/api";
import { enfileirar } from "@/lib/offline-queue";
import styles from "../form.module.css";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function RegistrarRepicagem() {
  const router = useRouter();
  const [viveiros, setViveiros] = useState<Viveiro[]>([]);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);

  const [data, setData] = useState(hojeISO());
  const [destinoId, setDestinoId] = useState<number | null>(null);
  const [pesoMedio, setPesoMedio] = useState("");
  const [selecionados, setSelecionados] = useState<Record<number, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    listarViveiros()
      .then((lista) => {
        setViveiros(lista);
        const destinos = lista.filter((v) => v.tipo !== "decantacao");
        if (destinos.length > 0) setDestinoId(destinos[0].id);
      })
      .catch(() => setErroCarregar("Sem conexão e sem dados salvos deste aparelho ainda. Conecte-se ao menos uma vez."));
  }, []);

  // sem separação por pré-engorda/engorda — qualquer tanque com lote pode
  // ser origem, e repicar pra qualquer outro tanque vazio (menos
  // decantação, que não é usado pra cultivo)
  const origensDisponiveis = useMemo(
    () => viveiros.filter((v) => v.lote_atual !== null),
    [viveiros]
  );
  // destino pode ser um viveiro vazio (cria lote novo) ou um já povoado
  // (soma nesse lote existente) — só decantação fica de fora
  const destinosDisponiveis = useMemo(
    () => viveiros.filter((v) => v.tipo !== "decantacao"),
    [viveiros]
  );
  const destino = useMemo(() => destinosDisponiveis.find((v) => v.id === destinoId) ?? null, [destinosDisponiveis, destinoId]);

  function alternarOrigem(viveiroId: number, marcado: boolean) {
    setSelecionados((s) => {
      const novo = { ...s };
      if (marcado) novo[viveiroId] = novo[viveiroId] ?? "";
      else delete novo[viveiroId];
      return novo;
    });
  }

  const origensEscolhidas = Object.entries(selecionados)
    .map(([id, qtd]) => ({ viveiro_origem_id: Number(id), quantidade: parseInt(qtd, 10) || 0 }))
    .filter((o) => o.quantidade > 0);

  const quantidadeTotal = origensEscolhidas.reduce((soma, o) => soma + o.quantidade, 0);
  const pesoNum = parseFloat(pesoMedio.replace(",", ".")) || 0;

  const podeSalvar = destinoId !== null && origensEscolhidas.length > 0 && pesoNum > 0 && !enviando;

  async function salvar() {
    if (destinoId === null) return;
    setEnviando(true);
    try {
      await enfileirar("repicagem", {
        data,
        viveiro_destino_id: destinoId,
        peso_medio_g: pesoNum,
        origens: origensEscolhidas,
      });
      setToast("Repicagem registrada");
      setSelecionados({});
      setPesoMedio("");
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
          <h1>Registrar repicagem</h1>
          <div className={styles.sub}>{new Date().toLocaleDateString("pt-BR")}</div>
        </div>
      </div>

      <div className={styles.body}>
        {erroCarregar && <div className={styles.error}>{erroCarregar}</div>}

        <div className={styles.field}>
          <label>Data</label>
          <input className={styles.inp} type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>

        <p className={styles.hint}>
          Marque um ou mais viveiros de origem (qualquer tanque com lote ativo) e informe quanto foi contado na
          repicagem de cada um.
        </p>

        <div className={styles.field}>
          <label>Viveiros de origem</label>
          {origensDisponiveis.length === 0 && <p className={styles.hint}>Nenhum viveiro com lote ativo.</p>}
          {origensDisponiveis.map((v) => {
            const marcado = v.id in selecionados;
            return (
              <div key={v.id} className={styles.checkRow}>
                <input
                  type="checkbox"
                  id={`origem-${v.id}`}
                  checked={marcado}
                  onChange={(e) => alternarOrigem(v.id, e.target.checked)}
                />
                <label htmlFor={`origem-${v.id}`} style={{ flex: 1 }}>
                  <div className="nm" style={{ fontWeight: 600 }}>Viveiro {v.codigo}</div>
                  <div className={styles.hint} style={{ margin: 0 }}>
                    lote {v.lote_atual!.codigo} · {v.lote_atual!.saldo_un.toLocaleString("pt-BR")} peixes povoados
                  </div>
                </label>
                <input
                  className={`${styles.inp} ${styles.num} ${styles.qtd}`}
                  type="number"
                  inputMode="numeric"
                  placeholder="0"
                  disabled={!marcado}
                  value={selecionados[v.id] ?? ""}
                  onChange={(e) => setSelecionados((s) => ({ ...s, [v.id]: e.target.value }))}
                />
              </div>
            );
          })}
        </div>

        <div className={styles.field}>
          <label>Viveiro de destino</label>
          <select
            className={styles.inp}
            value={destinoId ?? ""}
            disabled={destinosDisponiveis.length === 0}
            onChange={(e) => setDestinoId(Number(e.target.value))}
          >
            {destinosDisponiveis.length === 0 && <option>Nenhum viveiro disponível</option>}
            {destinosDisponiveis.map((v) => (
              <option key={v.id} value={v.id}>
                Viveiro {v.codigo}{v.lote_atual ? ` — já povoado (lote ${v.lote_atual.codigo}, ${v.lote_atual.saldo_un.toLocaleString("pt-BR")} peixes)` : " — vazio"}
              </option>
            ))}
          </select>
          {destino?.lote_atual && (
            <p className={styles.hint} style={{ margin: "6px 0 0" }}>
              Esse tanque já tem o lote {destino.lote_atual.codigo}, com {destino.lote_atual.saldo_un.toLocaleString("pt-BR")}{" "}
              peixes — a repicagem vai somar a esse lote (não cria um lote novo).
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label>Peso médio na repicagem (g)</label>
          <input
            className={`${styles.inp} ${styles.num}`}
            type="number"
            inputMode="decimal"
            placeholder="0"
            value={pesoMedio}
            onChange={(e) => setPesoMedio(e.target.value)}
          />
        </div>

        {quantidadeTotal > 0 && (
          <div className={styles.derived}>
            <span className={styles.l}>Quantidade total repicada</span>
            <span className={styles.v}>{quantidadeTotal.toLocaleString("pt-BR")}</span>
          </div>
        )}
      </div>

      <div className={styles.savebar}>
        <button className={styles.btnPrimary} disabled={!podeSalvar} onClick={salvar}>
          {enviando ? "Salvando…" : "Salvar repicagem"}
        </button>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
