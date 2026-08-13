"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  descartarPendente,
  listarPendentes,
  tentarSincronizar,
  type ItemFila,
  type TipoLancamento,
} from "@/lib/offline-queue";
import styles from "../painel/painel.module.css";

const ROTULO_TIPO: Record<TipoLancamento, string> = {
  despesca: "Despesca",
  producao: "Produção",
  povoamento: "Povoamento",
  repicagem: "Repicagem",
  biometria: "Biometria",
  arracoamento: "Arraçoamento",
  analise_agua: "Análise de água",
  venda: "Venda",
  expedicao: "Expedição",
  expedicao_acerto: "Acerto de expedição",
  despesa: "Despesa",
  chegada_racao: "Chegada de ração",
};

function dataHoraBr(ms: number): string {
  return new Date(ms).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function Pendencias() {
  const router = useRouter();
  const [itens, setItens] = useState<ItemFila[] | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [descartandoId, setDescartandoId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function carregar() {
    listarPendentes().then((lista) =>
      setItens([...lista].sort((a, b) => b.criadoEm - a.criadoEm))
    );
  }

  useEffect(() => {
    carregar();
  }, []);

  async function sincronizarAgora() {
    setSincronizando(true);
    try {
      await tentarSincronizar();
      carregar();
    } finally {
      setSincronizando(false);
    }
  }

  async function descartar(item: ItemFila) {
    const confirmar = window.confirm(
      `Descartar este lançamento de ${ROTULO_TIPO[item.tipo]}? Ele não foi salvo no sistema — se ainda for válido, ` +
      "você vai precisar lançar de novo pela tela normal."
    );
    if (!confirmar) return;
    setDescartandoId(item.client_id);
    try {
      await descartarPendente(item.client_id);
      setToast("Lançamento descartado");
      carregar();
    } finally {
      setDescartandoId(null);
      setTimeout(() => setToast(null), 3000);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/")}>
          ←
        </button>
        <div>
          <h1>Lançamentos pendentes</h1>
          <div className={styles.sub}>
            Feitos neste aparelho mas ainda não confirmados pelo sistema — normalmente porque não tinha conexão. Se
            um item continua aqui mesmo com internet, o motivo do erro aparece embaixo dele.
          </div>
        </div>
      </div>
      <div className={styles.body}>
        <div className={styles.filtros}>
          <button
            type="button"
            onClick={sincronizarAgora}
            disabled={sincronizando}
            style={{
              padding: "9px 16px", borderRadius: 9, border: "1px solid var(--rule-strong)",
              background: "var(--surface)", color: "var(--ink)", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
            }}
          >
            {sincronizando ? "Sincronizando…" : "Tentar sincronizar agora"}
          </button>
        </div>

        {!itens && <div className={styles.carregando}>Carregando…</div>}
        {itens && itens.length === 0 && <p className={styles.hint}>Nenhum lançamento pendente — tudo sincronizado.</p>}

        {itens && itens.map((item) => (
          <div
            key={item.client_id}
            style={{
              border: "1px solid var(--rule)", borderRadius: 12, padding: 14, marginBottom: 12,
              borderColor: item.tentativas > 0 ? "var(--crit)" : "var(--rule)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <strong>{ROTULO_TIPO[item.tipo]}</strong>
                <span className={styles.hint} style={{ marginLeft: 8 }}>lançado {dataHoraBr(item.criadoEm)}</span>
              </div>
              <button
                type="button"
                disabled={descartandoId === item.client_id}
                onClick={() => descartar(item)}
                style={{ background: "none", border: "none", color: "var(--crit)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
              >
                {descartandoId === item.client_id ? "Descartando…" : "Descartar"}
              </button>
            </div>

            {item.tentativas > 0 && (
              <div style={{ marginTop: 8, color: "var(--crit)", fontSize: "0.85rem" }}>
                <strong>O sistema recusou este lançamento</strong> ({item.tentativas} {item.tentativas === 1 ? "tentativa" : "tentativas"}):
                <div style={{ marginTop: 4, fontFamily: "monospace", fontSize: "0.78rem", whiteSpace: "pre-wrap" }}>
                  {item.ultimoErro ?? "erro sem detalhe"}
                </div>
              </div>
            )}

            <details style={{ marginTop: 8 }}>
              <summary className={styles.hint} style={{ cursor: "pointer" }}>Ver dados do lançamento</summary>
              <pre style={{
                marginTop: 6, padding: 10, background: "var(--surface-sunk)", borderRadius: 8,
                fontSize: "0.76rem", overflowX: "auto",
              }}>
                {JSON.stringify(item.payload, null, 2)}
              </pre>
            </details>
          </div>
        ))}
      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
          background: "var(--ink)", color: "var(--ground)", padding: "10px 18px", borderRadius: 10,
          fontSize: "0.85rem", fontWeight: 600, zIndex: 50,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
