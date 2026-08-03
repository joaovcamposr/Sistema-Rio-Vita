"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { editarDespesca } from "@/lib/api";
import { painelDespesca, type DespescaDetalhe } from "@/lib/paineis";
import styles from "../painel.module.css";

const DESTINOS: { valor: DespescaDetalhe["destino"]; rotulo: string }[] = [
  { valor: "file", rotulo: "Filé" },
  { valor: "postas", rotulo: "Postas" },
  { valor: "inteira_limpa", rotulo: "Inteira limpa" },
  { valor: "inteira_suja", rotulo: "Inteira suja" },
];
const ROTULO_DESTINO: Record<DespescaDetalhe["destino"], string> = {
  file: "Filé", postas: "Postas", inteira_limpa: "Inteira limpa", inteira_suja: "Inteira suja",
};

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function diasAtras(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}
function nf(v: number, casas = 1): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

interface EdicaoForm {
  data: string;
  destino: DespescaDetalhe["destino"];
  quantidade_un: string;
  peso_medio_g: string;
}

export default function PainelDespesca() {
  const router = useRouter();
  const [de, setDe] = useState(diasAtras(30));
  const [ate, setAte] = useState(hojeISO());
  const [dados, setDados] = useState<DespescaDetalhe[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<EdicaoForm | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function carregar() {
    setDados(null);
    painelDespesca(de, ate).then(setDados).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function recarregar() {
    painelDespesca(de, ate).then(setDados).catch(() => {});
  }

  function buscar() {
    carregar();
  }

  function iniciarEdicao(d: DespescaDetalhe) {
    setEditandoId(d.id);
    setForm({
      data: d.data, destino: d.destino,
      quantidade_un: String(d.quantidade_un), peso_medio_g: String(d.peso_medio_g).replace(".", ","),
    });
  }

  async function salvarEdicao(d: DespescaDetalhe) {
    if (!form) return;
    setSalvando(true);
    try {
      await editarDespesca(d.id, {
        lote_id: d.lote_id,
        data: form.data,
        destino: form.destino,
        quantidade_un: Math.round(parseFloat(form.quantidade_un.replace(",", ".")) || 0),
        peso_medio_g: parseFloat(form.peso_medio_g.replace(",", ".")) || 0,
      });
      setToast("Despesca corrigida");
      setEditandoId(null);
      setForm(null);
      recarregar();
    } catch {
      setToast("Não foi possível salvar — confira os valores e a conexão");
    } finally {
      setSalvando(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/painel")}>
          ←
        </button>
        <div>
          <h1>Despesca</h1>
          <div className={styles.sub}>Conferência dos lançamentos, com opção de corrigir</div>
        </div>
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
          <button
            type="button"
            onClick={buscar}
            style={{
              padding: "9px 16px", borderRadius: 9, border: "1px solid var(--rule-strong)",
              background: "var(--surface)", color: "var(--ink)", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
            }}
          >
            Buscar
          </button>
        </div>

        {erro && <div className={styles.erro}>{erro}</div>}
        {!dados && !erro && <div className={styles.carregando}>Carregando…</div>}
        {dados && dados.length === 0 && <p className={styles.hint}>Nenhuma despesca no período.</p>}

        {dados && dados.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.tabela}>
              <thead>
                <tr>
                  <th>Data</th><th>Viveiro</th><th>Lote</th><th>Destino</th>
                  <th>Quantidade</th><th>Peso médio (g)</th><th>Peso total (Kg)</th><th></th>
                </tr>
              </thead>
              <tbody>
                {dados.map((d) => (
                  <tr key={d.id}>
                    {editandoId === d.id && form ? (
                      <>
                        <td>
                          <input
                            type="date"
                            value={form.data}
                            onChange={(e) => setForm({ ...form, data: e.target.value })}
                            style={{ width: 130 }}
                          />
                        </td>
                        <td>{d.viveiro_codigo}</td>
                        <td>{d.lote_codigo}</td>
                        <td>
                          <select
                            value={form.destino}
                            onChange={(e) => setForm({ ...form, destino: e.target.value as DespescaDetalhe["destino"] })}
                          >
                            {DESTINOS.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                          </select>
                        </td>
                        <td>
                          <input
                            type="number" inputMode="numeric" style={{ width: 80, textAlign: "right" }}
                            value={form.quantidade_un}
                            onChange={(e) => setForm({ ...form, quantidade_un: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            type="number" inputMode="decimal" style={{ width: 90, textAlign: "right" }}
                            value={form.peso_medio_g}
                            onChange={(e) => setForm({ ...form, peso_medio_g: e.target.value })}
                          />
                        </td>
                        <td>—</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <button
                            type="button" disabled={salvando} onClick={() => salvarEdicao(d)}
                            style={{
                              padding: "6px 12px", borderRadius: 8, border: "none", background: "var(--brand)",
                              color: "var(--brand-ink)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer", marginRight: 6,
                            }}
                          >
                            OK
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditandoId(null); setForm(null); }}
                            style={{ background: "none", border: "none", color: "var(--ink-muted)", fontSize: "0.78rem", cursor: "pointer" }}
                          >
                            Cancelar
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{dataBr(d.data)}</td>
                        <td>{d.viveiro_codigo}</td>
                        <td>{d.lote_codigo}</td>
                        <td>{ROTULO_DESTINO[d.destino]}</td>
                        <td>{nf(d.quantidade_un, 0)}</td>
                        <td>{nf(d.peso_medio_g)}</td>
                        <td>{nf(d.peso_total_kg)}</td>
                        <td>
                          <button
                            type="button"
                            onClick={() => iniciarEdicao(d)}
                            style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
                          >
                            Editar
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
          background: "var(--ink)", color: "var(--ground)", padding: "10px 18px", borderRadius: 10,
          fontSize: "0.85rem", fontWeight: 600, zIndex: 50,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
