"use client";

import { useState } from "react";
import { login } from "@/lib/auth";
import { LogoHorizontal } from "@/components/LogoRioVita";
import styles from "./page.module.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await login(email.trim(), senha);
      window.location.href = "/";
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível entrar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <span className={styles.logo}>
        <LogoHorizontal />
      </span>
      <div className={styles.card}>
        <h1 className={styles.titulo}>Entrar</h1>
        {erro && <div className={styles.erro}>{erro}</div>}
        <form onSubmit={entrar}>
          <div className={styles.field}>
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              className={styles.inp}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="senha">Senha</label>
            <input
              id="senha"
              className={styles.inp}
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
          </div>
          <button className={styles.btnPrimary} type="submit" disabled={enviando || !email || !senha}>
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
