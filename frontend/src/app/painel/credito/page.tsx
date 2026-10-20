"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { definirLimiteCredito, listarCredito, type CreditoCliente, type StatusCredito } from "@/lib/cadastros";
import { obterSessao } from "@/lib/auth";
import styles from "../painel.module.css";

type Filtro = "todos" | "estourado" | "atencao" | "vencido" | "sem_limite_com_saldo" | "com_saldo";
type Coluna = "nome" | "limite" | "aberto" | "vencido" | "disponivel" | "uso" | "atraso";

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function dataBr(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
function normaliza(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const ROTULO_STATUS: Record<StatusCredito, { texto: string; bg: string; fg: string }> = {
  ok: { texto: "Dentro do limite", bg: "var(--ok-soft)", fg: "var(--ok)" },
  atencao: { texto: "Perto do limite", bg: "var(--warn-soft)", fg: "var(--warn)" },
  estourado: { texto: "Acima do limite", bg: "var(--crit-soft)", fg: "var(--crit)" },
  sem_limite: { texto: "Sem limite", bg: "var(--surface-sunk)", fg: "var(--ink-muted)" },
};

export default function PainelCredito() {
  const router = useRouter();
  const [dados, setDados] = useState<CreditoCliente[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("com_saldo");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<{ col: Coluna; asc: boolean }>({ col: "aberto", asc: false });
  const [editando, setEditando] = useState<number | null>(null);
  const [valorLimite, setValorLimite] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [gerente, setGerente] = useState(false);
  useEffect(() => setGerente(obterSessao()?.usuario.papel === "gerente"), []);

  function carregar() {
    listarCredito().then(setDados).catch(() => setErro("Não foi possível carregar o crédito dos clientes."));
  }
  useEffect(carregar, []);

  const totais = useMemo(() => {
    const l = dados ?? [];
    return {
      aberto: l.reduce((s, c) => s + c.em_aberto, 0),
      vencido: l.reduce((s, c) => s + c.vencido, 0),
      estourados: l.filter((c) => c.status === "estourado").length,
      semLimiteComSaldo: l.filter((c) => c.status === "sem_limite" && c.em_aberto > 0).length,
      comVencido: l.filter((c) => c.vencido > 0).length,
    };
  }, [dados]);

  const linhas = useMemo(() => {
    const q = normaliza(busca);
    const f = (dados ?? []).filter((c) => {
      if (q && !normaliza(c.nome).includes(q)) return false;
      switch (filtro) {
        case "estourado": return c.status === "estourado";
        case "atencao": return c.status === "atencao" || c.status === "estourado";
        case "vencido": return c.vencido > 0;
        case "sem_limite_com_saldo": return c.status === "sem_limite" && c.em_aberto > 0;
        case "com_saldo": return c.em_aberto > 0 || (c.limite_credito !== null);
        default: return true;
      }
    });
    const chave = (c: CreditoCliente): number | string => {
      switch (ordem.col) {
        case "nome": return normaliza(c.nome);
        case "limite": return c.limite_credito ?? -1;
        case "aberto": return c.em_aberto;
        case "vencido": return c.vencido;
        case "disponivel": return c.disponivel ?? Number.POSITIVE_INFINITY;
        case "uso": return c.uso ?? -1;
        case "atraso": return c.maior_atraso_dias ?? -1;
      }
    };
    return [...f].sort((a, b) => {
      const ka = chave(a), kb = chave(b);
      const r = ka < kb ? -1 : ka > kb ? 1 : 0;
      return ordem.asc ? r : -r;
    });
  }, [dados, filtro, busca, ordem]);

  function alternar(col: Coluna) {
    setOrdem((o) => (o.col === col ? { col, asc: !o.asc } : { col, asc: col === "nome" }));
  }

  async function salvarLimite(c: CreditoCliente) {
    const texto = valorLimite.trim().replace(/\./g, "").replace(",", ".");
    const novo = texto === "" ? null : Number(texto);
    if (novo !== null && !(novo >= 0)) { setMsg("Valor inválido"); return; }
    setSalvando(true);
    try {
      const atualizado = await definirLimiteCredito(c.cliente_id, novo);
      setDados((d) => (d ?? []).map((x) => (x.cliente_id === c.cliente_id ? atualizado : x)));
      setEditando(null);
      setMsg("Limite atualizado");
    } catch {
      setMsg("Não foi possível salvar o limite (só o gerente altera)");
    } finally {
      setSalvando(false);
      setTimeout(() => setMsg(null), 3000);
    }
  }

  function exportar() {
    const cab = ["Cliente", "Cidade", "Vendedor", "Limite", "Em aberto", "Vencido", "A vencer", "Disponível", "Uso %", "Maior atraso (dias)", "Próximo vencimento", "Última compra", "Situação"];
    const l = linhas.map((c) => [
      c.nome, c.cidade ?? "", c.vendedor_nome ?? "", c.limite_credito?.toFixed(2).replace(".", ",") ?? "", c.em_aberto.toFixed(2).replace(".", ","),
      c.vencido.toFixed(2).replace(".", ","), c.a_vencer.toFixed(2).replace(".", ","), c.disponivel?.toFixed(2).replace(".", ",") ?? "",
      c.uso !== null ? (c.uso * 100).toFixed(0) : "", c.maior_atraso_dias?.toString() ?? "", c.proximo_vencimento ?? "", c.ultima_compra ?? "",
      ROTULO_STATUS[c.status].texto,
    ]);
    const csv = "﻿" + [cab, ...l].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "credito_clientes.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const chip = (ativo: boolean) => ({
    padding: "7px 12px", borderRadius: 999, border: "1px solid var(--rule-strong)", cursor: "pointer", fontWeight: 700 as const, fontSize: "0.82rem",
    background: ativo ? "var(--brand)" : "var(--surface)", color: ativo ? "var(--brand-ink)" : "var(--ink-muted)",
  });
  const th = (col: Coluna, rotulo: string, direita = false) => (
    <th onClick={() => alternar(col)} style={{ cursor: "pointer", whiteSpace: "nowrap", textAlign: direita ? "right" : "left" }}>
      {rotulo} {ordem.col === col ? (ordem.asc ? "▲" : "▼") : ""}
    </th>
  );

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/painel")}>←</button>
        <div>
          <h1>Crédito dos clientes</h1>
          <div className={styles.sub}>Limite × o que está em aberto — para liberar os próximos pedidos</div>
        </div>
      </div>
      <div className={styles.body}>
        {erro && <div className={styles.erro}>{erro}</div>}
        {!dados && !erro && <div className={styles.carregando}>Carregando…</div>}

        {dados && (
          <>
            <div className={styles.cards}>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Total em aberto</div>
                <div className={styles.cardValue}>{moeda(totais.aberto)}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Já vencido</div>
                <div className={styles.cardValue} style={{ color: "var(--crit)" }}>{moeda(totais.vencido)}</div>
                <div className={styles.cardSub}>{totais.comVencido} cliente(s) em atraso</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Acima do limite</div>
                <div className={styles.cardValue}>{totais.estourados}</div>
                <div className={styles.cardSub}>cliente(s)</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Devendo e sem limite</div>
                <div className={styles.cardValue}>{totais.semLimiteComSaldo}</div>
                <div className={styles.cardSub}>defina um limite para eles</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
              {([
                ["com_saldo", "Com saldo ou limite"], ["estourado", "Acima do limite"], ["atencao", "Perto ou acima"],
                ["vencido", "Com vencido"], ["sem_limite_com_saldo", "Sem limite e devendo"], ["todos", "Todos"],
              ] as [Filtro, string][]).map(([f, r]) => (
                <button key={f} type="button" style={chip(filtro === f)} onClick={() => setFiltro(f)}>{r}</button>
              ))}
              <input
                value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente…"
                style={{ flex: "1 1 200px", minWidth: 180, padding: "8px 11px", borderRadius: 9, border: "1px solid var(--rule-strong)", background: "var(--surface)", font: "inherit" }}
              />
              <button type="button" style={chip(false)} onClick={exportar}>Exportar CSV</button>
            </div>
            {msg && <p className={styles.hint} style={{ color: "var(--ok)", fontWeight: 700 }}>{msg}</p>}
            {!gerente && <p className={styles.hint}>Só o gerente altera limites. Você pode consultar a situação de cada cliente.</p>}

            <div className={styles.tableWrap}>
              <table className={styles.tabela}>
                <thead>
                  <tr>
                    {th("nome", "Cliente")}
                    {th("limite", "Limite", true)}
                    {th("aberto", "Em aberto", true)}
                    {th("vencido", "Vencido", true)}
                    {th("disponivel", "Disponível", true)}
                    {th("uso", "Uso do limite")}
                    {th("atraso", "Maior atraso", true)}
                    <th>Próx. vencimento</th>
                    <th>Situação</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {linhas.length === 0 && <tr><td colSpan={10} className={styles.hint}>Nenhum cliente nesse filtro.</td></tr>}
                  {linhas.map((c) => {
                    const st = ROTULO_STATUS[c.status];
                    const uso = c.uso !== null ? Math.min(c.uso, 1) : null;
                    return (
                      <tr key={c.cliente_id}>
                        <td>
                          <Link href={`/cadastros/clientes/${c.cliente_id}`} style={{ color: "var(--ink)", fontWeight: 700, textDecoration: "none" }}>{c.nome}</Link>
                          <div style={{ fontSize: "0.72rem", color: "var(--ink-faint)" }}>
                            {[c.cidade, c.vendedor_nome, c.ultima_compra ? `última compra ${dataBr(c.ultima_compra)}` : null].filter(Boolean).join(" · ")}
                          </div>
                        </td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          {editando === c.cliente_id ? (
                            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                              <input
                                autoFocus inputMode="decimal" value={valorLimite} onChange={(e) => setValorLimite(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") salvarLimite(c); if (e.key === "Escape") setEditando(null); }}
                                placeholder="sem limite" style={{ width: 110, padding: "5px 7px", borderRadius: 8, border: "1px solid var(--rule-strong)", font: "inherit", textAlign: "right" }}
                              />
                              <button type="button" disabled={salvando} onClick={() => salvarLimite(c)}
                                style={{ background: "var(--brand)", color: "var(--brand-ink)", border: "none", borderRadius: 8, padding: "5px 10px", fontWeight: 700, cursor: "pointer" }}>OK</button>
                            </span>
                          ) : (
                            <>{c.limite_credito !== null ? moeda(c.limite_credito) : "—"}</>
                          )}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 700 }}>{moeda(c.em_aberto)}</td>
                        <td style={{ textAlign: "right", color: c.vencido > 0 ? "var(--crit)" : undefined, fontWeight: c.vencido > 0 ? 700 : 400 }}>
                          {c.vencido > 0 ? moeda(c.vencido) : "—"}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: c.disponivel !== null && c.disponivel < 0 ? "var(--crit)" : undefined }}>
                          {c.disponivel !== null ? moeda(c.disponivel) : "—"}
                        </td>
                        <td style={{ minWidth: 120 }}>
                          {uso !== null ? (
                            <div title={`${((c.uso ?? 0) * 100).toFixed(0)}% do limite`} style={{ background: "var(--surface-sunk)", borderRadius: 999, height: 10, overflow: "hidden" }}>
                              <div style={{ width: `${uso * 100}%`, height: "100%", background: c.status === "estourado" ? "var(--crit)" : c.status === "atencao" ? "var(--warn)" : "var(--ok)" }} />
                            </div>
                          ) : "—"}
                        </td>
                        <td style={{ textAlign: "right", color: (c.maior_atraso_dias ?? 0) > 0 ? "var(--crit)" : undefined }}>
                          {c.maior_atraso_dias ? `${c.maior_atraso_dias} d` : "—"}
                        </td>
                        <td>{dataBr(c.proximo_vencimento)}</td>
                        <td>
                          <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 999, fontSize: "0.72rem", fontWeight: 700, background: st.bg, color: st.fg, whiteSpace: "nowrap" }}>{st.texto}</span>
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {gerente && editando !== c.cliente_id && (
                            <button
                              type="button"
                              onClick={() => { setEditando(c.cliente_id); setValorLimite(c.limite_credito !== null ? String(c.limite_credito).replace(".", ",") : ""); }}
                              style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, cursor: "pointer" }}
                            >
                              {c.limite_credito === null ? "Definir limite" : "Alterar"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className={styles.hint}>
              &quot;Em aberto&quot; é a soma das parcelas ainda não pagas de todas as vendas do cliente; &quot;vencido&quot; é a parte cuja data
              prevista já passou. O sistema avisa ao lançar uma venda que passa do limite, mas não bloqueia.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
