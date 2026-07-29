"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listarClientes, type Cliente } from "@/lib/api";
import styles from "../cadastros.module.css";

export default function CadastroClientes() {
  const router = useRouter();
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    listarClientes().then(setClientes).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }, []);

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
          <div className={styles.tableWrap}>
            <table className={styles.tabela}>
              <thead><tr><th>Nome</th><th>Cidade</th><th>Prazo</th><th>NF</th><th>Boleto</th></tr></thead>
              <tbody>
                {clientes.map((c) => (
                  <tr key={c.id} onClick={() => router.push(`/cadastros/clientes/${c.id}`)}>
                    <td>{c.nome}</td>
                    <td>{c.cidade ?? "—"}</td>
                    <td>{c.prazo_dias != null ? `${c.prazo_dias} dias` : "—"}</td>
                    <td>{c.emite_nf ? "Sim" : "Não"}</td>
                    <td>{c.emite_boleto ? "Sim" : "Não"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
