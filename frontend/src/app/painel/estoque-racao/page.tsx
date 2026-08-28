"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { painelEstoqueRacao, type EstoqueRacao } from "@/lib/paineis";
import {
  editarChegadaRacao, excluirChegadaRacao, listarChegadasRacao, listarFornecedoresRacao, restaurarChegadaRacao,
  type ChegadaRacao, type FornecedorRacao,
} from "@/lib/cadastros";
import styles from "../painel.module.css";

function nf(v: number, casas = 1): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
function dataHoraBr(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function diasAtras(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

interface FormEdicaoChegada {
  data: string;
  fornecedorId: number | null;
  valores: Record<number, string>;
  observacao: string;
}

export default function PainelEstoqueRacao() {
  const router = useRouter();
  const [dados, setDados] = useState<EstoqueRacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [de, setDe] = useState(diasAtras(90));
  const [ate, setAte] = useState(hojeISO());
  const [chegadas, setChegadas] = useState<ChegadaRacao[] | null>(null);
  const [fornecedores, setFornecedores] = useState<FornecedorRacao[]>([]);
  const [mostrarExcluidas, setMostrarExcluidas] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [formEdicao, setFormEdicao] = useState<FormEdicaoChegada | null>(null);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [processandoId, setProcessandoId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function carregarChegadas() {
    setChegadas(null);
    listarChegadasRacao(de, ate, mostrarExcluidas).then(setChegadas).catch(() => {});
  }

  useEffect(() => {
    painelEstoqueRacao().then(setDados).catch(() => setErro("Sem conexão e sem dado salvo deste aparelho ainda."));
  }, []);

  useEffect(() => {
    carregarChegadas();
    listarFornecedoresRacao().then(setFornecedores).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [de, ate, mostrarExcluidas]);

  const fornecedorEdicao = useMemo(
    () => fornecedores.find((f) => f.id === formEdicao?.fornecedorId) ?? null,
    [fornecedores, formEdicao?.fornecedorId]
  );

  function iniciarEdicaoChegada(c: ChegadaRacao) {
    setEditandoId(c.id);
    setFormEdicao({
      data: c.data,
      fornecedorId: c.fornecedor_id,
      valores: Object.fromEntries(c.itens.map((i) => [i.tipo_racao_id, String(i.quantidade_sacos).replace(".", ",")])),
      observacao: c.observacao ?? "",
    });
  }

  async function salvarEdicaoChegada(id: number) {
    if (!formEdicao || !formEdicao.fornecedorId) return;
    const itens = Object.entries(formEdicao.valores)
      .map(([tipoId, v]) => ({ tipo_racao_id: Number(tipoId), quantidade_sacos: parseFloat(v.replace(",", ".")) || 0 }))
      .filter((i) => i.quantidade_sacos > 0);
    if (itens.length === 0) return;
    setSalvandoEdicao(true);
    try {
      await editarChegadaRacao(id, {
        data: formEdicao.data, fornecedor_id: formEdicao.fornecedorId,
        observacao: formEdicao.observacao.trim() || null, itens,
      });
      setToast("Chegada corrigida");
      setEditandoId(null);
      setFormEdicao(null);
      setTimeout(() => setToast(null), 2200);
      carregarChegadas();
    } catch {
      setToast("Não foi possível salvar — confira os valores");
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function excluirChegada(c: ChegadaRacao) {
    if (!window.confirm(`Excluir a chegada de ${c.fornecedor_nome} em ${dataBr(c.data)}? Pode ser restaurada depois.`)) return;
    setProcessandoId(c.id);
    try {
      await excluirChegadaRacao(c.id);
      setToast("Chegada excluída");
      carregarChegadas();
    } catch {
      setToast("Não foi possível excluir");
    } finally {
      setProcessandoId(null);
      setTimeout(() => setToast(null), 3000);
    }
  }

  async function restaurarChegada(c: ChegadaRacao) {
    setProcessandoId(c.id);
    try {
      await restaurarChegadaRacao(c.id);
      setToast("Chegada restaurada");
      carregarChegadas();
    } catch {
      setToast("Não foi possível restaurar");
    } finally {
      setProcessandoId(null);
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
          <h1>Estoque de ração</h1>
          <div className={styles.sub}>Chegadas menos consumo, acumulado por tipo</div>
        </div>
      </div>
      <div className={styles.body}>
        {erro && <div className={styles.erro}>{erro}</div>}
        {!dados && !erro && <div className={styles.carregando}>Carregando…</div>}

        {dados && (
          <>
            <div className={styles.cards}>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Estoque total</div>
                <div className={styles.cardValue}>{nf(dados.saldo_total_sacos, 0)} sacos</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Consumo previsto por dia</div>
                <div className={styles.cardValue}>{nf(dados.consumo_total_sacos_dia, 1)} sacos</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Acaba em</div>
                <div className={styles.cardValue}>
                  {dados.dias_restantes_total !== null ? `${Math.round(dados.dias_restantes_total)} dias` : "—"}
                </div>
                {dados.data_prevista_proxima_carga && (
                  <div className={styles.cardSub}>Pedir a próxima carga até {dataBr(dados.data_prevista_proxima_carga)}</div>
                )}
              </div>
            </div>

            {dados.sacos_sem_tipo_informado_ultimos_30_dias > 0 && (
              <p className={styles.hint} style={{ color: "var(--warn)" }}>
                {nf(dados.sacos_sem_tipo_informado_ultimos_30_dias, 1)} sacos lançados nos últimos 30 dias sem tipo de
                ração informado no arraçoamento — não entram nesse cálculo.
              </p>
            )}

            <div className={styles.section}>Por tipo</div>
            <p className={styles.hint}>
              &quot;Sugestão&quot; é quanto pedir pra manter 30 dias de estoque desse tipo, com base no consumo
              previsto de hoje.
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.tabela}>
                <thead>
                  <tr>
                    <th>Fornecedor</th><th>Tipo</th><th>Chegou</th><th>Consumido</th><th>Saldo</th>
                    <th>Consumo/dia</th><th>Acaba em</th><th>Sugestão p/ próxima carga</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.por_tipo.map((t) => (
                    <tr key={t.tipo_racao_id}>
                      <td>{t.fornecedor_nome}</td>
                      <td>{t.tipo_racao_codigo}</td>
                      <td>{nf(t.chegou_sacos, 0)}</td>
                      <td>{nf(t.consumido_sacos, 0)}</td>
                      <td style={{ fontWeight: 700 }}>{nf(t.saldo_sacos, 0)}</td>
                      <td>{t.consumo_sacos_dia !== null ? nf(t.consumo_sacos_dia, 1) : "—"}</td>
                      <td>{t.dias_restantes !== null ? `${Math.round(t.dias_restantes)} dias` : "—"}</td>
                      <td>{t.sacos_sugeridos_proxima_carga !== null ? `${nf(t.sacos_sugeridos_proxima_carga, 0)} sacos` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.section}>Histórico de chegadas</div>
            <div className={styles.filtros} style={{ marginBottom: 14 }}>
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
                onClick={() => setMostrarExcluidas((v) => !v)}
                style={{
                  padding: "9px 16px", borderRadius: 9, border: "1px solid var(--rule-strong)",
                  background: mostrarExcluidas ? "var(--brand)" : "var(--surface)",
                  color: mostrarExcluidas ? "var(--brand-ink)" : "var(--ink)",
                  fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
                }}
              >
                {mostrarExcluidas ? "Vendo excluídas" : "Ver excluídas"}
              </button>
            </div>

            {!chegadas && <p className={styles.hint}>Carregando…</p>}
            {chegadas && chegadas.length === 0 && (
              <p className={styles.hint}>{mostrarExcluidas ? "Nenhuma chegada excluída no período." : "Nenhuma chegada no período."}</p>
            )}
            {chegadas && chegadas.length > 0 && (
              <div className={styles.tableWrap}>
                <table className={styles.tabela}>
                  <thead>
                    <tr><th>Data</th><th>Fornecedor</th><th>Itens</th><th>Observação</th><th></th></tr>
                  </thead>
                  <tbody>
                    {chegadas.map((c) => (
                      <tr key={c.id}>
                        <td>{dataBr(c.data)}</td>
                        <td>{c.fornecedor_nome}</td>
                        <td>{c.itens.map((i) => `${i.tipo_racao_codigo}: ${nf(i.quantidade_sacos, 0)}`).join(" · ")}</td>
                        <td>{c.observacao ?? "—"}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {mostrarExcluidas ? (
                            <>
                              <span className={styles.hint} style={{ display: "block", fontSize: "0.7rem" }}>
                                {c.excluido_em ? `Excl. ${dataHoraBr(c.excluido_em)}` : ""}
                                {c.excluido_por ? ` · ${c.excluido_por}` : ""}
                              </span>
                              <button
                                type="button" disabled={processandoId === c.id} onClick={() => restaurarChegada(c)}
                                style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
                              >
                                {processandoId === c.id ? "Restaurando…" : "Restaurar"}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => iniciarEdicaoChegada(c)}
                                style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
                              >
                                Editar
                              </button>
                              {" · "}
                              <button
                                type="button" disabled={processandoId === c.id} onClick={() => excluirChegada(c)}
                                style={{ background: "none", border: "none", color: "var(--crit)", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}
                              >
                                {processandoId === c.id ? "Excluindo…" : "Excluir"}
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {editandoId !== null && formEdicao && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 100,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }}
          onClick={() => { setEditandoId(null); setFormEdicao(null); }}
        >
          <div
            style={{
              background: "var(--surface)", borderRadius: 14, padding: 20,
              width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto",
              boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Editar chegada de ração</h2>
              <button
                type="button"
                onClick={() => { setEditandoId(null); setFormEdicao(null); }}
                aria-label="Fechar"
                style={{ background: "none", border: "none", fontSize: "1.4rem", lineHeight: 1, color: "var(--ink-muted)", cursor: "pointer" }}
              >
                ×
              </button>
            </div>
            <div className={styles.campo} style={{ marginBottom: 12 }}>
              <label>Data</label>
              <input
                type="date" value={formEdicao.data}
                onChange={(e) => setFormEdicao({ ...formEdicao, data: e.target.value })}
              />
            </div>
            <div className={styles.campo} style={{ marginBottom: 12 }}>
              <label>Fornecedor</label>
              <div className={styles.chips}>
                {fornecedores.map((f) => (
                  <button
                    key={f.id} type="button" className={styles.chip}
                    aria-pressed={formEdicao.fornecedorId === f.id}
                    onClick={() => setFormEdicao({ ...formEdicao, fornecedorId: f.id, valores: {} })}
                  >
                    {f.nome}
                  </button>
                ))}
              </div>
            </div>
            {fornecedorEdicao && (
              <>
                <p className={styles.hint} style={{ marginBottom: 10 }}>Sacos por tipo</p>
                {fornecedorEdicao.tipos.map((t) => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ flex: 1, fontWeight: 600, fontSize: "0.88rem" }}>{t.codigo}</span>
                    <input
                      type="number" inputMode="decimal" style={{ width: 100, textAlign: "right" }}
                      placeholder="0"
                      value={formEdicao.valores[t.id] ?? ""}
                      onChange={(e) => setFormEdicao({ ...formEdicao, valores: { ...formEdicao.valores, [t.id]: e.target.value } })}
                    />
                  </div>
                ))}
              </>
            )}
            <div className={styles.campo} style={{ margin: "12px 0" }}>
              <label>Observação</label>
              <input
                value={formEdicao.observacao}
                onChange={(e) => setFormEdicao({ ...formEdicao, observacao: e.target.value })}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button
                type="button"
                onClick={() => { setEditandoId(null); setFormEdicao(null); }}
                style={{ background: "none", border: "none", color: "var(--ink-muted)", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer" }}
              >
                Cancelar
              </button>
              <button
                type="button" disabled={salvandoEdicao}
                onClick={() => salvarEdicaoChegada(editandoId)}
                style={{
                  padding: "9px 20px", borderRadius: 10, border: "none", background: "var(--brand)",
                  color: "var(--brand-ink)", fontWeight: 700, cursor: "pointer",
                }}
              >
                {salvandoEdicao ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

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
