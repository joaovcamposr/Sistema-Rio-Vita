"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  alternarUsuarioAtivo,
  criarUsuario,
  listarUsuarios,
  obterSessao,
  type Papel,
  type UsuarioLista,
} from "@/lib/auth";
import styles from "../cadastros.module.css";

const PAPEIS: { valor: Papel; rotulo: string }[] = [
  { valor: "operador", rotulo: "Operador" },
  { valor: "comercial", rotulo: "Comercial" },
  { valor: "gerente", rotulo: "Gerente" },
];

export default function CadastroUsuarios() {
  const router = useRouter();
  const [ehGerente, setEhGerente] = useState<boolean | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioLista[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState<Papel>("operador");
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function carregar() {
    listarUsuarios().then(setUsuarios).catch(() => setErro("Não foi possível carregar os usuários."));
  }

  useEffect(() => {
    const gerente = obterSessao()?.usuario.papel === "gerente";
    setEhGerente(gerente);
    if (gerente) carregar();
  }, []);

  async function salvar() {
    if (!nome.trim() || !email.trim() || senha.length < 6) return;
    setSalvando(true);
    setErro(null);
    try {
      await criarUsuario(nome.trim(), email.trim(), senha, papel);
      setNome("");
      setEmail("");
      setSenha("");
      setPapel("operador");
      setToast("Usuário criado");
      carregar();
      setTimeout(() => setToast(null), 2200);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível criar o usuário.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(u: UsuarioLista) {
    const acao = u.ativo ? "desativar" : "reativar";
    if (!window.confirm(`Quer mesmo ${acao} o acesso de ${u.nome}?`)) return;
    try {
      await alternarUsuarioAtivo(u.id, !u.ativo);
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível alterar o usuário.");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/cadastros")}>
          ←
        </button>
        <div>
          <h1>Usuários do sistema</h1>
          <div className={styles.sub}>Só gerentes podem criar ou desativar acessos</div>
        </div>
      </div>
      <div className={styles.body}>
        {erro && <div className={styles.error}>{erro}</div>}

        {ehGerente === false && (
          <p className={styles.hint}>
            Esta tela é restrita a usuários com papel gerente.
          </p>
        )}

        {ehGerente && (
          <>
            <p className={styles.section}>Novo usuário</p>
            <div className={styles.field}>
              <label>Nome</label>
              <input className={styles.inp} value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>E-mail</label>
              <input className={styles.inp} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>Senha provisória (mínimo 6 caracteres)</label>
              <input className={styles.inp} type="password" value={senha} onChange={(e) => setSenha(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>Papel</label>
              <select className={styles.inp} value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
                {PAPEIS.map((p) => (
                  <option key={p.valor} value={p.valor}>{p.rotulo}</option>
                ))}
              </select>
            </div>
            <p className={styles.hint}>Por enquanto todo papel acessa todas as telas — o papel só decide quem pode gerenciar usuários.</p>
            <button
              className={styles.btnPrimary}
              disabled={!nome.trim() || !email.trim() || senha.length < 6 || salvando}
              onClick={salvar}
            >
              {salvando ? "Salvando…" : "Criar usuário"}
            </button>
          </>
        )}

        <p className={styles.section}>Cadastrados</p>
        {!usuarios && <p className={styles.hint}>Carregando…</p>}
        {usuarios && usuarios.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.tabela}>
              <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Situação</th><th></th></tr></thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id}>
                    <td>{u.nome}</td>
                    <td>{u.email}</td>
                    <td>{PAPEIS.find((p) => p.valor === u.papel)?.rotulo ?? u.papel}</td>
                    <td>{u.ativo ? "Ativo" : "Desativado"}</td>
                    <td>
                      {ehGerente && (
                        <button
                          className={styles.btnLink}
                          style={{ color: u.ativo ? "var(--crit)" : "var(--brand-deep)" }}
                          onClick={() => alternarAtivo(u)}
                        >
                          {u.ativo ? "Desativar" : "Reativar"}
                        </button>
                      )}
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
