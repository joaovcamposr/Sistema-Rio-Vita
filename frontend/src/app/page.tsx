import Link from "next/link";
import styles from "./page.module.css";

const hoje = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

export default function Home() {
  return (
    <div className={styles.wrap}>
      <div className={styles.dt}>{hoje.format(new Date())}</div>

      <p className={styles.greet}>Lançar</p>
      <div className={styles.tiles}>
        <Link href="/lancar/producao" className={styles.tile}>
          <span className={styles.ico}>🐟</span>
          <span>Produção</span>
        </Link>
        <Link href="/lancar/despesca" className={styles.tile}>
          <span className={styles.ico}>🎣</span>
          <span>Despesca</span>
        </Link>
        <Link href="/lancar/biometria" className={styles.tile}>
          <span className={styles.ico}>⚖️</span>
          <span>Biometria</span>
        </Link>
        <Link href="/lancar/arracoamento" className={styles.tile}>
          <span className={styles.ico}>🥣</span>
          <span>Arraçoamento</span>
        </Link>
        <Link href="/lancar/agua" className={styles.tile}>
          <span className={styles.ico}>💧</span>
          <span>Análise da água</span>
        </Link>
        <Link href="/lancar/venda" className={styles.tile}>
          <span className={styles.ico}>🧾</span>
          <span>Venda</span>
        </Link>
        <Link href="/lancar/povoamento" className={styles.tile}>
          <span className={styles.ico}>🌱</span>
          <span>Povoamento</span>
        </Link>
        <Link href="/lancar/repicagem" className={styles.tile}>
          <span className={styles.ico}>↗️</span>
          <span>Repicagem</span>
        </Link>
        <Link href="/lancar/expedicao" className={styles.tile}>
          <span className={styles.ico}>🚚</span>
          <span>Expedição</span>
        </Link>
        <Link href="/lancar/acerto" className={styles.tile}>
          <span className={styles.ico}>🧾</span>
          <span>Acerto de expedição</span>
        </Link>
        <Link href="/lancar/despesa" className={styles.tile}>
          <span className={styles.ico}>💸</span>
          <span>Despesa</span>
        </Link>
        <Link href="/lancar/chegada-racao" className={styles.tile}>
          <span className={styles.ico}>🌾</span>
          <span>Chegada de ração</span>
        </Link>
        <Link href="/lancar/recebimentos" className={styles.tile}>
          <span className={styles.ico}>💵</span>
          <span>Recebimentos</span>
        </Link>
        <Link href="/cadastros" className={styles.tile}>
          <span className={styles.ico}>⚙️</span>
          <span>Cadastro de clientes e vendedores</span>
        </Link>
      </div>

      <p className={styles.greet} style={{ marginTop: 16 }}>Tabelas informativas</p>
      <div className={styles.tiles}>
        <Link href="/painel/arracoamento-previsto" className={styles.tile}>
          <span className={styles.ico}>🥣</span>
          <span>Arraçoamento previsto</span>
        </Link>
        <Link href="/painel/tabela-arracoamento" className={styles.tile}>
          <span className={styles.ico}>📋</span>
          <span>Tabela de arraçoamento</span>
        </Link>
        <Link href="/painel/ficha-producao" className={styles.tile}>
          <span className={styles.ico}>🖨️</span>
          <span>Ficha de produção (impressão)</span>
        </Link>
        <Link href="/painel/ficha-arracoamento" className={styles.tile}>
          <span className={styles.ico}>🖨️</span>
          <span>Ficha de arraçoamento (impressão)</span>
        </Link>
      </div>

      <p className={styles.greet} style={{ marginTop: 16 }}>Painéis gerenciais</p>
      <div className={styles.tiles}>
        <Link href="/painel" className={styles.tile}>
          <span className={styles.ico}>📊</span>
          <span>Ver painéis</span>
        </Link>
      </div>

      <p style={{ fontSize: ".78rem", color: "var(--ink-muted)", lineHeight: 1.5, marginTop: 10 }}>
        Todas as telas de lançamento gravam de verdade no banco, com fila offline.
        Os painéis são só leitura — nada se lança por lá.
      </p>
    </div>
  );
}
