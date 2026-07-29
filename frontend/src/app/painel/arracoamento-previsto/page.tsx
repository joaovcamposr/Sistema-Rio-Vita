"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { arracoamentoPrevisto, type ArracoamentoPrevistoDia } from "@/lib/paineis";
import styles from "../painel.module.css";

function nf(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function diasNaFrente(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export default function ArracoamentoPrevistoFicha() {
  const router = useRouter();
  const [de, setDe] = useState(hojeISO());
  const [ate, setAte] = useState(diasNaFrente(6));
  const [dados, setDados] = useState<ArracoamentoPrevistoDia[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setDados(null);
    arracoamentoPrevisto(de, ate).then(setDados).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }, [de, ate]);

  const { linhas, horarios } = useMemo(() => {
    if (!dados) return { linhas: [] as ArracoamentoPrevistoDia[], horarios: [] as string[] };
    // preserva a ordem natural dos viveiros (o backend já manda ordenado
    // assim) pra desempatar quando duas linhas caem no mesmo período
    const ordemViveiro = new Map<string, number>();
    for (const d of dados) {
      if (!ordemViveiro.has(d.viveiro_codigo)) ordemViveiro.set(d.viveiro_codigo, ordemViveiro.size);
    }
    const todosHorarios = Array.from(new Set(dados.flatMap((d) => d.tratos.map((t) => t.horario)))).sort();
    const ordenados = [...dados].sort((a, b) => {
      if (a.periodo_inicio !== b.periodo_inicio) return a.periodo_inicio < b.periodo_inicio ? -1 : 1;
      return (ordemViveiro.get(a.viveiro_codigo) ?? 0) - (ordemViveiro.get(b.viveiro_codigo) ?? 0);
    });
    return { linhas: ordenados, horarios: todosHorarios };
  }, [dados]);

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/")}>
          ←
        </button>
        <div>
          <h1>Arraçoamento previsto</h1>
          <div className={styles.sub}>Período: {dataBr(de)} a {dataBr(ate)}</div>
        </div>
        <div className={styles.spacer} />
        <button type="button" className={styles.printBtn} onClick={() => window.print()}>
          Imprimir
        </button>
      </div>
      <div className={styles.body}>
        <div className={styles.filtros}>
          <div className={styles.campo}>
            <label>De</label>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className={styles.campo}>
            <label>Até</label>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
        </div>
        <p className={styles.hint} style={{ margin: "0 0 8px" }}>
          A ração de cada viveiro é a mesma em todos os dias da semana do período. Se a curva indicaria troca de
          quantidade ou tipo no meio da semana, essa troca só passa a valer na semana seguinte.
        </p>

        {erro && <div className={styles.erro}>{erro}</div>}
        {!dados && !erro && <div className={styles.carregando}>Carregando…</div>}
        {dados && linhas.length === 0 && <p className={styles.hint}>Nenhum viveiro com lote ativo no momento.</p>}

        {linhas.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.tabela}>
              <thead>
                <tr>
                  <th>Viveiro</th>
                  {horarios.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                  <th>Total (sacos/dia)</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((d) => {
                  const porHorario = Object.fromEntries(d.tratos.map((t) => [t.horario, t.sacos]));
                  return (
                    <tr key={`${d.periodo_inicio}-${d.viveiro_codigo}`}>
                      <td>{d.viveiro_codigo}</td>
                      {horarios.map((h) => (
                        <td key={h}>{porHorario[h] !== undefined ? nf(porHorario[h]) : "—"}</td>
                      ))}
                      <td style={{ fontWeight: 700 }}>{nf(d.sacos_total_dia)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
