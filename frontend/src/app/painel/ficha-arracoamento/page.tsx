"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listarViveiros, type Viveiro } from "@/lib/api";
import styles from "../painel.module.css";
import ficha from "../ficha.module.css";

const HORARIOS = ["07:00", "09:00", "11:00", "13:00", "15:00", "17:00"];

export default function FichaArracoamento() {
  const router = useRouter();
  const [viveiros, setViveiros] = useState<Viveiro[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    listarViveiros()
      .then((lista) => setViveiros(lista.filter((v) => v.lote_atual !== null)))
      .catch(() => setErro("Sem conexão e sem dados salvos deste aparelho ainda."));
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/")}>
          ←
        </button>
        <div>
          <h1>Ficha de arraçoamento realizado</h1>
          <div className={styles.sub}>Para imprimir, preencher à mão e fotografar depois</div>
        </div>
        <div className={styles.spacer} />
        <button type="button" className={styles.printBtn} onClick={() => window.print()}>
          Imprimir
        </button>
      </div>
      <div className={styles.body}>
        {erro && <div className={styles.erro}>{erro}</div>}
        {viveiros.length === 0 && !erro && <div className={styles.carregando}>Carregando…</div>}

        {viveiros.length > 0 && (
          <div className={ficha.folha}>
            <div className={ficha.cabecalho}>
              <div>Rio Vita — Ficha de Arraçoamento Realizado</div>
            </div>

            <div className={ficha.camposTopo}>
              <div className={ficha.campoTopo}>
                <span>Data</span>
                <span className={ficha.linhaPreencher}>____ / ____ / ________</span>
              </div>
              <div className={ficha.campoTopo}>
                <span>Tipo de ração usado hoje</span>
                <span className={ficha.linhaPreencher}>_____________________</span>
              </div>
            </div>

            <p className={ficha.instrucao}>
              Escreva o número de sacos em cada quadro. Use vírgula pra meio saco (ex.: <strong>2,5</strong>). Deixe em
              branco o horário que não teve trato nesse tanque.
            </p>

            <table className={ficha.tabela}>
              <thead>
                <tr>
                  <th className={ficha.colViveiro}>Tanque</th>
                  {HORARIOS.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {viveiros.map((v) => (
                  <tr key={v.id}>
                    <td className={ficha.colViveiro}>{v.codigo}</td>
                    {HORARIOS.map((h) => (
                      <td key={h} className={ficha.celulaVazia}></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className={ficha.rodape}>
              <div>
                <span>Preenchido por</span>
                <span className={ficha.linhaAssinatura}></span>
              </div>
              <div>
                <span>Conferido por (quem lança no sistema)</span>
                <span className={ficha.linhaAssinatura}></span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
