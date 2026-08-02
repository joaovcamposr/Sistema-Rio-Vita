"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { listarFornecedoresRacao, type FornecedorRacao } from "@/lib/cadastros";
import { enfileirar } from "@/lib/offline-queue";
import styles from "../form.module.css";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function RegistrarChegadaRacao() {
  const router = useRouter();
  const [fornecedores, setFornecedores] = useState<FornecedorRacao[]>([]);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);

  const [fornecedorId, setFornecedorId] = useState<number | null>(null);
  const [valores, setValores] = useState<Record<number, string>>({});
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    listarFornecedoresRacao()
      .then((fs) => {
        setFornecedores(fs);
        if (fs.length > 0) setFornecedorId(fs[0].id);
      })
      .catch(() => setErroCarregar("Sem conexão e sem dados salvos deste aparelho ainda. Conecte-se ao menos uma vez."));
  }, []);

  const fornecedor = useMemo(() => fornecedores.find((f) => f.id === fornecedorId) ?? null, [fornecedores, fornecedorId]);

  const preenchidos = Object.entries(valores).filter(([, v]) => (parseFloat(v.replace(",", ".")) || 0) > 0);
  const podeSalvar = fornecedorId !== null && preenchidos.length > 0 && !enviando;

  async function salvar() {
    if (!fornecedorId) return;
    setEnviando(true);
    try {
      const itens = preenchidos.map(([tipoId, valor]) => ({
        tipo_racao_id: Number(tipoId),
        quantidade_sacos: parseFloat(valor.replace(",", ".")),
      }));
      await enfileirar("chegada_racao", {
        data: hojeISO(),
        fornecedor_id: fornecedorId,
        observacao: observacao.trim() || null,
        itens,
      });
      setToast("Chegada de ração registrada");
      setValores({});
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
          <h1>Chegada de ração</h1>
          <div className={styles.sub}>{new Date().toLocaleDateString("pt-BR")} · sacos por tipo</div>
        </div>
      </div>

      <div className={styles.body}>
        {erroCarregar && <div className={styles.error}>{erroCarregar}</div>}

        <div className={styles.field}>
          <label>Fornecedor</label>
          <div className={styles.chips}>
            {fornecedores.map((f) => (
              <button
                key={f.id}
                type="button"
                className={styles.chip}
                aria-pressed={fornecedorId === f.id}
                onClick={() => { setFornecedorId(f.id); setValores({}); }}
              >
                {f.nome}
              </button>
            ))}
          </div>
          {fornecedores.length === 0 && (
            <p className={styles.hint}>
              Nenhum fornecedor cadastrado ainda. Cadastre em Cadastros → Fornecedores de ração.
            </p>
          )}
        </div>

        {fornecedor && (
          <>
            <p className={styles.hint}>Preencha a quantidade de sacos de cada tipo que chegou.</p>
            {fornecedor.tipos.length === 0 && (
              <p className={styles.hint}>Esse fornecedor ainda não tem tipos cadastrados.</p>
            )}
            {fornecedor.tipos.map((t) => (
              <div key={t.id} className={styles.lrow}>
                <div>
                  <div className="nm" style={{ fontWeight: 700, fontSize: ".9rem" }}>{t.codigo}</div>
                  <div className={styles.mt}>sacos</div>
                </div>
                <input
                  className={styles.inp}
                  style={{ padding: "9px 10px", fontSize: "1rem", textAlign: "right" }}
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={valores[t.id] ?? ""}
                  onChange={(e) => setValores((s) => ({ ...s, [t.id]: e.target.value }))}
                />
              </div>
            ))}

            <div className={styles.field} style={{ marginTop: 12 }}>
              <label>Observação (opcional)</label>
              <input className={styles.inp} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </div>
          </>
        )}
      </div>

      <div className={styles.savebar}>
        <button className={styles.btnPrimary} disabled={!podeSalvar} onClick={salvar}>
          {enviando ? "Salvando…" : "Salvar chegada"}
        </button>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
