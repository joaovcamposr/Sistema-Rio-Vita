"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./cadastros.module.css";

export default function CadastrosHub() {
  const router = useRouter();
  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/")}>
          ←
        </button>
        <div>
          <h1>Cadastros</h1>
          <div className={styles.sub}>Configuração — feita na base, exige conexão</div>
        </div>
      </div>
      <div className={styles.body}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          <Link href="/cadastros/clientes" style={{
            background: "var(--surface)", border: "1px solid var(--rule)", borderRadius: 14,
            padding: 18, color: "var(--ink)", fontWeight: 700,
          }}>
            👤 Clientes
            <div style={{ fontWeight: 400, fontSize: ".8rem", color: "var(--ink-faint)", marginTop: 4 }}>
              Preço por produto, prazo, NF, boleto
            </div>
          </Link>
          <Link href="/cadastros/vendedores" style={{
            background: "var(--surface)", border: "1px solid var(--rule)", borderRadius: 14,
            padding: 18, color: "var(--ink)", fontWeight: 700,
          }}>
            🚚 Vendedores/entregadores
            <div style={{ fontWeight: 400, fontSize: ".8rem", color: "var(--ink-faint)", marginTop: 4 }}>
              Quem sai com a expedição
            </div>
          </Link>
          <Link href="/cadastros/usuarios" style={{
            background: "var(--surface)", border: "1px solid var(--rule)", borderRadius: 14,
            padding: 18, color: "var(--ink)", fontWeight: 700,
          }}>
            🔑 Usuários
            <div style={{ fontWeight: 400, fontSize: ".8rem", color: "var(--ink-faint)", marginTop: 4 }}>
              Quem tem login no sistema (gerente)
            </div>
          </Link>
          <Link href="/cadastros/racao" style={{
            background: "var(--surface)", border: "1px solid var(--rule)", borderRadius: 14,
            padding: 18, color: "var(--ink)", fontWeight: 700,
          }}>
            🌾 Fornecedores de ração
            <div style={{ fontWeight: 400, fontSize: ".8rem", color: "var(--ink-faint)", marginTop: 4 }}>
              Fornecedores e tipos (ex.: 32AP, 36AP)
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
