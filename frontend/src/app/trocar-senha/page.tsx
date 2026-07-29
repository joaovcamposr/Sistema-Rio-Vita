"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trocarSenha } from "@/lib/auth";
import styles from "../lancar/form.module.css";

export default function TrocarSenha() {
  const router = useRouter();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const naoConfere = senhaNova.length > 0 && confirmacao.length > 0 && senhaNova !== confirmacao;
  const podeSalvar = senhaAtual && senhaNova.length >= 6 && senhaNova === confirmacao && !enviando;

  async function salvar() {
    setErro(null);
    setEnviando(true);
    try {
      await trocarSenha(senhaAtual, senhaNova);
      setSenhaAtual("");
      setSenhaNova("");
      setConfirmacao("");
      setToast("Senha alterada");
      setTimeout(() => setToast(null), 2200);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível trocar a senha.");
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
          <h1>Trocar senha</h1>
        </div>
      </div>

      <div className={styles.body}>
        {erro && <div className={styles.error}>{erro}</div>}

        <div className={styles.field}>
          <label>Senha atual</label>
          <input
            className={styles.inp}
            type="password"
            autoComplete="current-password"
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label>Nova senha (mínimo 6 caracteres)</label>
          <input
            className={styles.inp}
            type="password"
            autoComplete="new-password"
            value={senhaNova}
            onChange={(e) => setSenhaNova(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label>Confirmar nova senha</label>
          <input
            className={styles.inp}
            type="password"
            autoComplete="new-password"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
          />
          {naoConfere && <p className={styles.hint} style={{ color: "var(--crit)" }}>As senhas não conferem.</p>}
        </div>
      </div>

      <div className={styles.savebar}>
        <button className={styles.btnPrimary} disabled={!podeSalvar} onClick={salvar}>
          {enviando ? "Salvando…" : "Trocar senha"}
        </button>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
