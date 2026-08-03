"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { lerFotoArracoamento, listarViveiros, type Viveiro } from "@/lib/api";
import { listarFornecedoresRacao, type FornecedorRacao } from "@/lib/cadastros";
import { enfileirar } from "@/lib/offline-queue";
import styles from "../form.module.css";
import tabelaStyles from "../../painel/painel.module.css";

const HORARIOS = ["08:30", "10:30", "12:00", "15:30"];

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Tenta ler "30/07/2026", "30/07/26" ou "2026-07-30" — se não der pra
 * entender, volta null e o operador confirma a data na mão. */
function tentarConverterData(bruta: string | null): string | null {
  if (!bruta) return null;
  const iso = bruta.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return bruta;
  const br = bruta.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const [, d, m, yRaw] = br;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

export default function ArracoamentoPorFoto() {
  const router = useRouter();
  const [viveiros, setViveiros] = useState<Viveiro[]>([]);
  const [tiposRacao, setTiposRacao] = useState<{ id: number; codigo: string }[]>([]);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);

  const [lendo, setLendo] = useState(false);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [lido, setLido] = useState(false);
  const [naoReconhecidos, setNaoReconhecidos] = useState<string[]>([]);

  const [data, setData] = useState(hojeISO());
  const [tipoRacaoPorViveiro, setTipoRacaoPorViveiro] = useState<Record<number, number | null>>({});
  const [grade, setGrade] = useState<Record<number, Record<string, string>>>({});

  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    listarViveiros()
      .then((lista) => setViveiros(lista.filter((v) => v.lote_atual !== null)))
      .catch(() => setErroCarregar("Sem conexão e sem dados salvos deste aparelho ainda. Conecte-se ao menos uma vez."));
    listarFornecedoresRacao()
      .then((fs: FornecedorRacao[]) => setTiposRacao(fs.flatMap((f) => f.tipos.map((t) => ({ id: t.id, codigo: t.codigo })))))
      .catch(() => {});
  }, []);

  async function aoEscolherFoto(arquivo: File) {
    setLendo(true);
    setErroLeitura(null);
    try {
      const leitura = await lerFotoArracoamento(arquivo);

      const dataConvertida = tentarConverterData(leitura.data_lida);
      if (dataConvertida) setData(dataConvertida);

      const novaGrade: Record<number, Record<string, string>> = {};
      const novoTipoPorViveiro: Record<number, number | null> = {};
      const semMatch: string[] = [];
      for (const linha of leitura.linhas) {
        const viveiro = viveiros.find((v) => v.codigo.trim().toLowerCase() === linha.tanque.trim().toLowerCase());
        if (!viveiro) {
          semMatch.push(linha.tanque);
          continue;
        }
        novaGrade[viveiro.id] = Object.fromEntries(
          Object.entries(linha.valores).map(([h, sacos]) => [h, String(sacos).replace(".", ",")])
        );
        if (linha.tipo_racao_texto) {
          const alvo = linha.tipo_racao_texto.trim().toLowerCase();
          const achado = tiposRacao.find((t) => t.codigo.toLowerCase() === alvo || alvo.includes(t.codigo.toLowerCase()));
          novoTipoPorViveiro[viveiro.id] = achado ? achado.id : null;
        }
      }
      setGrade(novaGrade);
      setTipoRacaoPorViveiro(novoTipoPorViveiro);
      setNaoReconhecidos(semMatch);
      setLido(true);
    } catch {
      setErroLeitura("Não foi possível ler a foto. Tente tirar de novo, com mais luz e a ficha bem esticada.");
    } finally {
      setLendo(false);
    }
  }

  const totalPreenchido = useMemo(
    () => Object.values(grade).reduce((acc, linha) => acc + Object.keys(linha).length, 0),
    [grade]
  );
  const podeSalvar = lido && totalPreenchido > 0 && !enviando;

  function mudarCelula(viveiroId: number, horario: string, valor: string) {
    setGrade((g) => {
      const linha = { ...(g[viveiroId] ?? {}) };
      if (valor.trim() === "") {
        delete linha[horario];
      } else {
        linha[horario] = valor;
      }
      return { ...g, [viveiroId]: linha };
    });
  }

  async function confirmarLancamento() {
    setEnviando(true);
    try {
      let n = 0;
      for (const [viveiroId, porHorario] of Object.entries(grade)) {
        const v = viveiros.find((vv) => vv.id === Number(viveiroId));
        if (!v?.lote_atual) continue;
        const tipoRacaoId = tipoRacaoPorViveiro[v.id] ?? null;
        for (const [horario, valor] of Object.entries(porHorario)) {
          const sacos = parseFloat(valor.replace(",", "."));
          if (!(sacos >= 0)) continue;
          await enfileirar("arracoamento", {
            lote_id: v.lote_atual.id, data, trato: horario, sacos, tipo_racao_id: tipoRacaoId,
          });
          n++;
        }
      }
      setToast(`${n} lançamentos de arraçoamento registrados`);
      setLido(false);
      setGrade({});
      setNaoReconhecidos([]);
      setTipoRacaoPorViveiro({});
      setTimeout(() => setToast(null), 3000);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/lancar/arracoamento")}>
          ←
        </button>
        <div>
          <h1>Arraçoamento por foto da ficha</h1>
          <div className={styles.sub}>Tire a foto, confira os valores e confirme</div>
        </div>
      </div>

      <div className={styles.body}>
        {erroCarregar && <div className={styles.error}>{erroCarregar}</div>}

        {!lido && (
          <div className={styles.field}>
            <label>Foto da ficha preenchida</label>
            <input
              className={styles.inp}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                if (arquivo) void aoEscolherFoto(arquivo);
              }}
            />
            {lendo && <p className={styles.hint}>Lendo a ficha…</p>}
            {erroLeitura && <div className={styles.error}>{erroLeitura}</div>}
          </div>
        )}

        {lido && (
          <>
            <p className={styles.hint} style={{ fontWeight: 700, color: "var(--brand-deep)" }}>
              Confira os valores lidos antes de confirmar — corrija o que estiver errado.
            </p>

            <div className={styles.field}>
              <label>Data</label>
              <input className={styles.inp} type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>

            {naoReconhecidos.length > 0 && (
              <div className={styles.error}>
                Não reconheci estes tanques na ficha: {naoReconhecidos.join(", ")}. Confira se o código foi escrito
                certo, ou lance esses à mão na tela normal de Arraçoamento.
              </div>
            )}

            <div className={tabelaStyles.tableWrap} style={{ overflowX: "auto" }}>
              <table className={tabelaStyles.tabela}>
                <thead>
                  <tr>
                    <th>Tanque</th>
                    <th>Ração</th>
                    {HORARIOS.map((h) => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {viveiros.map((v) => (
                    <tr key={v.id}>
                      <td style={{ fontWeight: 700 }}>{v.codigo}</td>
                      <td>
                        <select
                          className={styles.inp}
                          style={{ padding: "6px 8px", fontSize: "0.85rem" }}
                          value={tipoRacaoPorViveiro[v.id] ?? ""}
                          onChange={(e) =>
                            setTipoRacaoPorViveiro((s) => ({
                              ...s, [v.id]: e.target.value ? Number(e.target.value) : null,
                            }))
                          }
                        >
                          <option value="">—</option>
                          {tiposRacao.map((t) => (
                            <option key={t.id} value={t.id}>{t.codigo}</option>
                          ))}
                        </select>
                      </td>
                      {HORARIOS.map((h) => (
                        <td key={h}>
                          <input
                            className={styles.inp}
                            style={{ width: 64, padding: "6px 4px", textAlign: "center" }}
                            type="text"
                            inputMode="decimal"
                            value={grade[v.id]?.[h] ?? ""}
                            onChange={(e) => mudarCelula(v.id, h, e.target.value)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              style={{
                marginTop: 10, background: "none", border: "none", padding: 0,
                color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
              }}
              onClick={() => { setLido(false); setGrade({}); setNaoReconhecidos([]); setTipoRacaoPorViveiro({}); }}
            >
              Tirar outra foto
            </button>
          </>
        )}
      </div>

      {lido && (
        <div className={styles.savebar}>
          <button className={styles.btnPrimary} disabled={!podeSalvar} onClick={confirmarLancamento}>
            {enviando ? "Lançando…" : `Confirmar e lançar (${totalPreenchido})`}
          </button>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
