"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { tabelaArracoamentoBase, type TabelaArracoamentoLinha } from "@/lib/paineis";
import styles from "../painel.module.css";

function nf(v: number, casas = 1): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export default function TabelaArracoamentoBase() {
  const router = useRouter();
  const [dados, setDados] = useState<TabelaArracoamentoLinha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    tabelaArracoamentoBase().then(setDados).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/")}>
          ←
        </button>
        <div>
          <h1>Tabela de arraçoamento</h1>
          <div className={styles.sub}>Consumo de ração por 1.000 peixes, por semana da curva de crescimento</div>
        </div>
      </div>
      <div className={styles.body}>
        {erro && <div className={styles.erro}>{erro}</div>}
        {!dados && !erro && <div className={styles.carregando}>Carregando…</div>}
        {dados && (
          <div className={styles.tableWrap}>
            <table className={styles.tabela}>
              <thead>
                <tr>
                  <th>Semana</th>
                  <th>Peso inicial (g)</th>
                  <th>Peso final (g)</th>
                  <th>Consumo diário (Kg)</th>
                  <th>Consumo semanal (Kg)</th>
                  <th>Sacos/semana</th>
                  <th>Ração</th>
                  <th>Conversão</th>
                  <th>Tratos/dia</th>
                </tr>
              </thead>
              <tbody>
                {dados.map((l) => (
                  <tr key={l.semana}>
                    <td>{l.semana}</td>
                    <td>{nf(l.peso_inicial_g, 1)}</td>
                    <td>{nf(l.peso_final_g, 1)}</td>
                    <td>{nf(l.consumo_diario_kg, 2)}</td>
                    <td>{nf(l.consumo_semanal_kg, 2)}</td>
                    <td>{nf(l.consumo_sacos, 3)}</td>
                    <td>{l.tipo_racao ?? "—"}</td>
                    <td>{l.conversao !== null ? nf(l.conversao, 2) : "—"}</td>
                    <td>{l.tratos_por_dia}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={styles.hint} style={{ marginTop: 14 }}>
          Valores para um lote de 1.000 peixes — a ficha "Arraçoamento previsto" multiplica pelo saldo real de cada viveiro.
        </p>
      </div>
    </div>
  );
}
