"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { editarRepicagem } from "@/lib/api";
import { painelRepicagem, type RepicagemDetalhe } from "@/lib/paineis";
import styles from "../painel.module.css";

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
function chave(r: RepicagemDetalhe): string {
  return `${r.lote_id}:${r.lote_origem_id}`;
}

interface EdicaoForm {
  data: string;
  quantidade: string;
  peso_medio_g: string;
}

export default function PainelRepicagem() {
  const router = useRouter();
  const [de, setDe] = useState(diasAtras(30));
  const [ate, setAte] = useState(hojeISO());
  const [dados, setDados] = useState<RepicagemDetalhe[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [editandoChave, setEditandoChave] = useState<string | null>(null);
  const [form, setForm] = useState<EdicaoForm | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function carregar() {
    setDados(null);
    painelRepicagem(de, ate).then(setDados).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function recarregar() {
    painelRepicagem(de, ate).then(setDados).catch(() => {});
  }

  function buscar() {
    carregar();
  }

  function iniciarEdicao(r: RepicagemDetalhe) {
    setEditandoChave(chave(r));
    setForm({
      data: r.data, quantidade: String(r.quantidade), peso_medio_g: String(r.peso_medio_g).replace(".", ","),
    });
  }

  async function salvarEdicao(r: RepicagemDetalhe) {
    if (!form) return;
    setSalvando(true);
    try {
      await editarRepicagem(r.lote_id, r.lote_origem_id, {
        data: form.data,
        quantidade: Math.round(parseFloat(form.quantidade.replace(",", ".")) || 0),
        peso_medio_g: parseFloat(form.peso_medio_g.replace(",", ".")) || 0,
      });
      setToast(`Repicagem de ${r.viveiro_origem_codigo} para ${r.viveiro_destino_codigo} corrigida`);
      setEditandoChave(null);
      setForm(null);
      // recarrega do servidor em vez de remendar o estado local — o
      // estoque de peixe dos dois tanques (origem e destino) depende de
      // como o backend redistribuiu a diferença, precisa vir recalculado
      recarregar();
    } catch {
      setToast("Não foi possível salvar — confira os valores e a conexão");
    } finally {
      setSalvando(false);
      setTimeout(() => setToast(null), 3200);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/painel")}>
          ←
        </button>
        <div>
          <h1>Repicagem</h1>
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
        {dados && dados.length === 0 && <p className={styles.hint}>Nenhuma repicagem no período.</p>}

        {dados && dados.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.tabela}>
              <thead>
                <tr>
                  <th>Data</th><th>De</th><th>Para</th>
                  <th>Quantidade</th><th>Peso médio (g)</th><th></th>
                </tr>
              </thead>
              <tbody>
                {dados.map((r) => {
                  const k = chave(r);
                  return (
                    <tr key={k}>
                      {editandoChave === k && form ? (
                        <>
                          <td>
                            <input
                              type="date"
                              value={form.data}
                              onChange={(e) => setForm({ ...form, data: e.target.value })}
                              style={{ width: 130 }}
                            />
                          </td>
                          <td>{r.viveiro_origem_codigo} ({r.lote_origem_codigo})</td>
                          <td>{r.viveiro_destino_codigo} ({r.lote_destino_codigo})</td>
                          <td>
                            <input
                              type="number" inputMode="numeric" style={{ width: 80, textAlign: "right" }}
                              value={form.quantidade}
                              onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              type="number" inputMode="decimal" style={{ width: 90, textAlign: "right" }}
                              value={form.peso_medio_g}
                              onChange={(e) => setForm({ ...form, peso_medio_g: e.target.value })}
                            />
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <button
                              type="button" disabled={salvando} onClick={() => salvarEdicao(r)}
                              style={{
                                padding: "6px 12px", borderRadius: 8, border: "none", background: "var(--brand)",
                                color: "var(--brand-ink)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer", marginRight: 6,
                              }}
                            >
                              OK
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditandoChave(null); setForm(null); }}
                              style={{ background: "none", border: "none", color: "var(--ink-muted)", fontSize: "0.78rem", cursor: "pointer" }}
                            >
                              Cancelar
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{dataBr(r.data)}</td>
                          <td>{r.viveiro_origem_codigo} ({r.lote_origem_codigo}){r.lote_origem_fechado ? " — encerrado" : ""}</td>
                          <td>{r.viveiro_destino_codigo} ({r.lote_destino_codigo})</td>
                          <td>{nf(r.quantidade, 0)}</td>
                          <td>{nf(r.peso_medio_g)}</td>
                          <td>
                            <button
                              type="button"
                              onClick={() => iniciarEdicao(r)}
                              style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
                            >
                              Editar
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
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
