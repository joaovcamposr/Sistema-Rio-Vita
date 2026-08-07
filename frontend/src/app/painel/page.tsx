"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./painel.module.css";

const PAINEIS = [
  { href: "/painel/dashboard", ico: "📊", nome: "Dashboard", desc: "Visão geral do período — produção, vendas e alertas" },
  { href: "/painel/viveiros", ico: "🌊", nome: "Painel do viveiro", desc: "Saldo, densidade, biometria e água por tanque" },
  { href: "/painel/abate", ico: "📅", nome: "Programação de abate", desc: "Previsão por lote, a partir da última biometria" },
  { href: "/painel/producao", ico: "📦", nome: "Produção e rendimento", desc: "Peso sujo e rendimento ponderados por período" },
  { href: "/painel/despesca", ico: "🎣", nome: "Despesca", desc: "Conferência dos lançamentos, com opção de corrigir" },
  { href: "/painel/repicagem", ico: "🔀", nome: "Repicagem", desc: "Conferência dos lançamentos, com opção de corrigir" },
  { href: "/painel/estoque", ico: "🧊", nome: "Estoque", desc: "Produzido − vendido, calculado (sem lançamento)" },
  { href: "/painel/estoque-racao", ico: "🌾", nome: "Estoque de ração", desc: "Chegadas − consumo por tipo, e quando pedir a próxima carga" },
  { href: "/painel/mortalidade", ico: "📉", nome: "Mortalidade por fase", desc: "Pré-engorda e engorda, por lote encerrado" },
  { href: "/painel/comercial", ico: "💰", nome: "Comercial", desc: "Vendas por período e funil de clientes" },
  { href: "/painel/agua", ico: "💧", nome: "Análise da água", desc: "Série dos últimos 60 dias, por viveiro" },
  { href: "/painel/caixa", ico: "🧮", nome: "Caixa", desc: "Conferência do dinheiro, por dia e por expedição" },
];

export default function PainelHub() {
  const router = useRouter();
  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/")}>
          ←
        </button>
        <div>
          <h1>Painéis gerenciais</h1>
          <div className={styles.sub}>Somente leitura — nenhum lançamento aqui</div>
        </div>
      </div>
      <div className={styles.body}>
        <div className={styles.tiles}>
          {PAINEIS.map((p) => (
            <Link key={p.href} href={p.href} className={styles.tile}>
              <span className={styles.tileIco}>{p.ico}</span>
              <div>
                <div className={styles.tileNome}>{p.nome}</div>
                <div className={styles.tileDesc}>{p.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
