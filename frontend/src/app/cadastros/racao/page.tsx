"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  atualizarTipoRacao,
  criarFornecedorRacao,
  criarTipoRacao,
  excluirFornecedorRacao,
  excluirTipoRacao,
  listarFornecedoresRacao,
  type FornecedorRacao,
} from "@/lib/cadastros";
import styles from "../cadastros.module.css";

export default function CadastroRacao() {
  const router = useRouter();
  const [fornecedores, setFornecedores] = useState<FornecedorRacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [nomeFornecedor, setNomeFornecedor] = useState("");
  const [salvandoFornecedor, setSalvandoFornecedor] = useState(false);

  const [novoTipoPorFornecedor, setNovoTipoPorFornecedor] = useState<Record<number, string>>({});
  const [editandoTipo, setEditandoTipo] = useState<{ fornecedorId: number; tipoId: number } | null>(null);
  const [codigoEditado, setCodigoEditado] = useState("");

  function carregar() {
    listarFornecedoresRacao().then(setFornecedores).catch(() => setErro("Sem conexão."));
  }

  useEffect(carregar, []);

  function avisar(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  async function salvarFornecedor() {
    if (!nomeFornecedor.trim()) return;
    setSalvandoFornecedor(true);
    try {
      await criarFornecedorRacao(nomeFornecedor.trim());
      setNomeFornecedor("");
      avisar("Fornecedor cadastrado");
      carregar();
    } catch {
      setErro("Não foi possível salvar — verifique a conexão ou se o nome já existe.");
    } finally {
      setSalvandoFornecedor(false);
    }
  }

  async function excluirForn(f: FornecedorRacao) {
    if (!window.confirm(`Excluir ${f.nome}? Chegadas já lançadas continuam no histórico.`)) return;
    try {
      await excluirFornecedorRacao(f.id);
      carregar();
    } catch {
      setErro("Não foi possível excluir — verifique a conexão.");
    }
  }

  async function salvarTipo(fornecedorId: number) {
    const codigo = (novoTipoPorFornecedor[fornecedorId] ?? "").trim();
    if (!codigo) return;
    try {
      await criarTipoRacao(fornecedorId, codigo);
      setNovoTipoPorFornecedor((s) => ({ ...s, [fornecedorId]: "" }));
      avisar("Tipo cadastrado");
      carregar();
    } catch {
      setErro("Não foi possível salvar — verifique a conexão ou se o código já existe pra esse fornecedor.");
    }
  }

  async function excluirTipo(fornecedorId: number, tipoId: number, codigo: string) {
    if (!window.confirm(`Excluir o tipo ${codigo}? Lançamentos já feitos com ele continuam no histórico.`)) return;
    try {
      await excluirTipoRacao(fornecedorId, tipoId);
      carregar();
    } catch {
      setErro("Não foi possível excluir — verifique a conexão.");
    }
  }

  function iniciarEdicaoTipo(fornecedorId: number, tipoId: number, codigoAtual: string) {
    setEditandoTipo({ fornecedorId, tipoId });
    setCodigoEditado(codigoAtual);
  }

  async function confirmarEdicaoTipo() {
    if (!editandoTipo || !codigoEditado.trim()) return;
    try {
      await atualizarTipoRacao(editandoTipo.fornecedorId, editandoTipo.tipoId, codigoEditado.trim());
      setEditandoTipo(null);
      avisar("Tipo atualizado");
      carregar();
    } catch {
      setErro("Não foi possível salvar — verifique a conexão ou se o código já existe pra esse fornecedor.");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/cadastros")}>
          ←
        </button>
        <div>
          <h1>Fornecedores de ração</h1>
          <div className={styles.sub}>Cada fornecedor tem seus próprios tipos (ex.: 32AP, 36AP)</div>
        </div>
      </div>
      <div className={styles.body}>
        {erro && <div className={styles.error}>{erro}</div>}

        <p className={styles.section}>Novo fornecedor</p>
        <div className={styles.field}>
          <label>Nome</label>
          <input className={styles.inp} value={nomeFornecedor} onChange={(e) => setNomeFornecedor(e.target.value)} />
        </div>
        <button className={styles.btnPrimary} disabled={!nomeFornecedor.trim() || salvandoFornecedor} onClick={salvarFornecedor}>
          {salvandoFornecedor ? "Salvando…" : "Cadastrar fornecedor"}
        </button>

        <p className={styles.section}>Cadastrados</p>
        {!fornecedores && <p className={styles.hint}>Carregando…</p>}
        {fornecedores && fornecedores.length === 0 && <p className={styles.hint}>Nenhum fornecedor cadastrado ainda.</p>}

        {fornecedores?.map((f) => (
          <div key={f.id} style={{ border: "1px solid var(--rule)", borderRadius: 14, padding: 16, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 700 }}>{f.nome}</div>
              <button className={styles.btnLink} style={{ color: "var(--crit)" }} onClick={() => excluirForn(f)}>
                Excluir fornecedor
              </button>
            </div>

            {f.tipos.length === 0 && <p className={styles.hint}>Nenhum tipo cadastrado ainda.</p>}
            {f.tipos.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--rule)" }}>
                {editandoTipo?.tipoId === t.id ? (
                  <>
                    <input
                      className={styles.inp}
                      style={{ flex: 1, padding: "6px 8px" }}
                      value={codigoEditado}
                      onChange={(e) => setCodigoEditado(e.target.value)}
                    />
                    <button className={styles.btnLink} onClick={confirmarEdicaoTipo}>Salvar</button>
                    <button className={styles.btnLink} onClick={() => setEditandoTipo(null)}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1 }}>{t.codigo}</div>
                    <button className={styles.btnLink} onClick={() => iniciarEdicaoTipo(f.id, t.id, t.codigo)}>Editar</button>
                    <button className={styles.btnLink} style={{ color: "var(--crit)" }} onClick={() => excluirTipo(f.id, t.id, t.codigo)}>
                      Excluir
                    </button>
                  </>
                )}
              </div>
            ))}

            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                className={styles.inp}
                style={{ flex: 1 }}
                placeholder="Novo tipo (ex.: 32AP)"
                value={novoTipoPorFornecedor[f.id] ?? ""}
                onChange={(e) => setNovoTipoPorFornecedor((s) => ({ ...s, [f.id]: e.target.value }))}
              />
              <button className={styles.btnLink} onClick={() => salvarTipo(f.id)}>+ Adicionar tipo</button>
            </div>
          </div>
        ))}
      </div>
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
