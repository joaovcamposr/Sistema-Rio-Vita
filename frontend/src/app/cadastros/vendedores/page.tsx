"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { criarVendedor, excluirVendedor, listarVendedores, type Vendedor } from "@/lib/cadastros";
import styles from "../cadastros.module.css";

export default function CadastroVendedores() {
  const router = useRouter();
  const [vendedores, setVendedores] = useState<Vendedor[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function carregar() {
    listarVendedores().then(setVendedores).catch(() => setErro("Sem conexão."));
  }

  useEffect(carregar, []);

  async function salvar() {
    if (!nome.trim()) return;
    setSalvando(true);
    try {
      await criarVendedor(nome.trim(), telefone.trim() || null);
      setNome("");
      setTelefone("");
      setToast("Vendedor cadastrado");
      carregar();
      setTimeout(() => setToast(null), 2200);
    } catch {
      setErro("Não foi possível salvar — verifique a conexão.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(v: Vendedor) {
    if (!window.confirm(`Excluir ${v.nome}? Expedições já feitas por ele continuam no histórico.`)) return;
    try {
      await excluirVendedor(v.id);
      carregar();
    } catch {
      setErro("Não foi possível excluir — verifique a conexão.");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/cadastros")}>
          ←
        </button>
        <div>
          <h1>Vendedores/entregadores</h1>
        </div>
      </div>
      <div className={styles.body}>
        {erro && <div className={styles.error}>{erro}</div>}

        <p className={styles.section}>Novo vendedor</p>
        <div className={styles.field}>
          <label>Nome</label>
          <input className={styles.inp} value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>Telefone (opcional)</label>
          <input className={styles.inp} value={telefone} onChange={(e) => setTelefone(e.target.value)} />
        </div>
        <button className={styles.btnPrimary} disabled={!nome.trim() || salvando} onClick={salvar}>
          {salvando ? "Salvando…" : "Cadastrar"}
        </button>

        <p className={styles.section}>Cadastrados</p>
        {!vendedores && <p className={styles.hint}>Carregando…</p>}
        {vendedores && vendedores.length === 0 && <p className={styles.hint}>Nenhum vendedor cadastrado ainda.</p>}
        {vendedores && vendedores.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.tabela}>
              <thead><tr><th>Nome</th><th>Telefone</th><th></th></tr></thead>
              <tbody>
                {vendedores.map((v) => (
                  <tr key={v.id}>
                    <td>{v.nome}</td>
                    <td>{v.telefone ?? "—"}</td>
                    <td>
                      <button className={styles.btnLink} style={{ color: "var(--crit)" }} onClick={() => excluir(v)}>
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
