"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listarClientes, type Cliente } from "@/lib/api";
import styles from "../cadastros.module.css";

const ACENTOS: Record<string, string> = {
  á: "a", à: "a", â: "a", ã: "a", ä: "a",
  é: "e", è: "e", ê: "e", ë: "e",
  í: "i", ì: "i", î: "i", ï: "i",
  ó: "o", ò: "o", ô: "o", õ: "o", ö: "o",
  ú: "u", ù: "u", û: "u", ü: "u",
  ç: "c",
};

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .split("")
    .map((ch) => ACENTOS[ch] ?? ch)
    .join("");
}

export default function CadastroClientes() {
  const router = useRouter();
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [cidadeFiltro, setCidadeFiltro] = useState("");

  useEffect(() => {
    listarClientes().then(setClientes).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }, []);

  const cidades = useMemo(() => {
    if (!clientes) return [];
    const nomes = new Set<string>();
    clientes.forEach((c) => { if (c.cidade) nomes.add(c.cidade); });
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [clientes]);

  const clientesFiltrados = useMemo(() => {
    if (!clientes) return [];
    const buscaNorm = normalizar(busca.trim());
    return clientes.filter((c) => {
      if (buscaNorm && !normalizar(c.nome).includes(buscaNorm)) return false;
      if (cidadeFiltro && c.cidade !== cidadeFiltro) return false;
      return true;
    });
  }, [clientes, busca, cidadeFiltro]);

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/cadastros")}>
          ←
        </button>
        <div>
          <h1>Clientes</h1>
        </div>
      </div>
      <div className={styles.body}>
        {erro && <div className={styles.error}>{erro}</div>}

        <Link href="/cadastros/clientes/novo" className={styles.btnPrimary} style={{ display: "inline-block", marginBottom: 18, textDecoration: "none" }}>
          + Novo cliente
        </Link>

        {!clientes && !erro && <p className={styles.hint}>Carregando…</p>}
        {clientes && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
              <input
                className={styles.inp}
                style={{ flex: "1 1 220px" }}
                type="text"
                placeholder="Buscar por nome…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
              <select
                className={styles.inp}
                style={{ flex: "0 1 200px" }}
                value={cidadeFiltro}
                onChange={(e) => setCidadeFiltro(e.target.value)}
              >
                <option value="">Todas as cidades</option>
                {cidades.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {clientesFiltrados.length === 0 && (
              <p className={styles.hint}>Nenhum cliente encontrado com esses filtros.</p>
            )}

            {clientesFiltrados.length > 0 && (
              <div className={styles.tableWrap}>
                <table className={styles.tabela}>
                  <thead><tr><th>Nome</th><th>Cidade</th><th>Vendedor</th><th>Prazo</th><th>NF</th><th>Boleto</th></tr></thead>
                  <tbody>
                    {clientesFiltrados.map((c) => (
                      <tr key={c.id} onClick={() => router.push(`/cadastros/clientes/${c.id}`)}>
                        <td>{c.nome}</td>
                        <td>{c.cidade ?? "—"}</td>
                        <td>{c.vendedor_nome ?? "—"}</td>
                        <td>{c.prazo_dias != null ? `${c.prazo_dias} dias` : "—"}</td>
                        <td>{c.emite_nf ? "Sim" : "Não"}</td>
                        <td>{c.emite_boleto ? "Sim" : "Não"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
