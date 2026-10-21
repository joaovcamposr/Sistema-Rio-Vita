"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  atualizarFunil, buscarAgenda, buscarProspeccao, buscarRecompra, criarProspecto, registrarContato,
  type ClienteRecompra, type ItemAgenda, type ParametrosRecompra, type Prospecto, type Prospeccao, type Recompra, type SituacaoRecompra,
} from "@/lib/crm";
import styles from "../painel/painel.module.css";

type Aba = "recompra" | "prospeccao" | "agenda";
const TIPOS_CONTATO = ["WhatsApp", "Ligação", "Visita", "E-mail", "Outro"];
const TEMPERATURAS = ["Frio", "Morno", "Quente"];
const ORIGENS = ["Indicação", "Visita", "Instagram / WhatsApp", "Cliente antigo", "Feira / evento", "Outro"];

function moeda(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function dataBr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a.slice(2)}`;
}
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function maisDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function normaliza(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
function linkWhatsApp(tel: string | null, mensagem: string): string | null {
  const dig = (tel ?? "").replace(/\D/g, "");
  if (dig.length < 10) return null;
  return `https://wa.me/${dig.startsWith("55") ? dig : `55${dig}`}?text=${encodeURIComponent(mensagem)}`;
}

const SITUACAO: Record<SituacaoRecompra, { rotulo: string; bg: string; fg: string }> = {
  em_dia: { rotulo: "Em dia", bg: "var(--ok-soft)", fg: "var(--ok)" },
  atencao: { rotulo: "Atenção", bg: "var(--warn-soft)", fg: "var(--warn)" },
  atrasado: { rotulo: "Atrasado", bg: "var(--crit-soft)", fg: "var(--crit)" },
  inativo: { rotulo: "Inativo", bg: "var(--surface-sunk)", fg: "var(--ink-muted)" },
};

const chip = (ativo: boolean) => ({
  padding: "7px 12px", borderRadius: 999, border: "1px solid var(--rule-strong)", cursor: "pointer", fontWeight: 700 as const, fontSize: "0.82rem",
  background: ativo ? "var(--brand)" : "var(--surface)", color: ativo ? "var(--brand-ink)" : "var(--ink-muted)",
});
const campo = { padding: "8px 11px", borderRadius: 9, border: "1px solid var(--rule-strong)", background: "var(--surface)", font: "inherit", width: "100%" } as const;

/* ------------------------------------------------------------------ modal de contato */
interface AlvoContato { id: number; nome: string; fase?: string | null; temperatura?: string | null; etapas?: string[] }

function ModalContato({ alvo, onFechar, onSalvo }: { alvo: AlvoContato; onFechar: () => void; onSalvo: () => void }) {
  const [tipo, setTipo] = useState("WhatsApp");
  const [descricao, setDescricao] = useState("");
  const [fase, setFase] = useState(alvo.fase ?? "");
  const [temperatura, setTemperatura] = useState(alvo.temperatura ?? "");
  const [acao, setAcao] = useState("");
  const [dataAcao, setDataAcao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!descricao.trim()) { setErro("Conte rapidamente o que foi tratado."); return; }
    setSalvando(true);
    try {
      await registrarContato({
        cliente_id: alvo.id, tipo, descricao: descricao.trim(),
        ...(alvo.etapas && fase ? { fase } : {}),
        ...(temperatura ? { temperatura } : {}),
        ...(acao || dataAcao ? { proxima_acao: acao || null, proxima_acao_data: dataAcao || null } : { limpar_proxima_acao: true }),
      });
      onSalvo();
    } catch {
      setErro("Não foi possível salvar o contato.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div onClick={onFechar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: 16, padding: 20, width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto" }}>
        <h2 style={{ margin: "0 0 4px", fontSize: "1.1rem" }}>Registrar contato</h2>
        <p style={{ margin: "0 0 14px", color: "var(--ink-muted)", fontSize: "0.88rem" }}>{alvo.nome}</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {TIPOS_CONTATO.map((t) => <button key={t} type="button" style={chip(tipo === t)} onClick={() => setTipo(t)}>{t}</button>)}
        </div>
        <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="O que foi conversado? (ex.: vai fechar 100 kg semana que vem)" rows={3} style={{ ...campo, marginBottom: 10 }} />
        {alvo.etapas && (
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--ink-muted)" }}>Etapa do funil</label>
            <select value={fase} onChange={(e) => setFase(e.target.value)} style={campo}>
              {alvo.etapas.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        )}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--ink-muted)" }}>Temperatura</label>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            {TEMPERATURAS.map((t) => <button key={t} type="button" style={chip(temperatura === t)} onClick={() => setTemperatura(temperatura === t ? "" : t)}>{t}</button>)}
          </div>
        </div>
        <label style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--ink-muted)" }}>Próxima ação</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
          <input value={acao} onChange={(e) => setAcao(e.target.value)} placeholder="ex.: ligar de novo, levar amostra" style={{ ...campo, flex: "1 1 220px", width: "auto" }} />
          <input type="date" value={dataAcao} onChange={(e) => setDataAcao(e.target.value)} style={{ ...campo, width: 160 }} />
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {[["Amanhã", 1], ["3 dias", 3], ["1 semana", 7], ["15 dias", 15]].map(([r, n]) => (
            <button key={r} type="button" style={chip(false)} onClick={() => setDataAcao(maisDias(n as number))}>{r}</button>
          ))}
        </div>
        {erro && <p style={{ color: "var(--crit)", fontSize: "0.85rem" }}>{erro}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onFechar} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)" }}>Cancelar</button>
          <button type="button" disabled={salvando} onClick={salvar} style={{ ...chip(true), padding: "10px 18px" }}>{salvando ? "Salvando…" : "Salvar contato"}</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ modal de novo prospecto */
function ModalProspecto({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({
    nome: "", contato: "", cidade: "", ramo: "", origem: "", volume: "", fornecedor: "", preco: "", temperatura: "Morno", motivo: "", acao: "Fazer o primeiro contato", dataAcao: hojeISO(),
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [duplicado, setDuplicado] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const num = (s: string) => (s.trim() ? Number(s.replace(",", ".")) : null);

  async function salvar(forcar = false) {
    if (!f.nome.trim()) { setErro("Informe o nome do prospecto."); return; }
    setSalvando(true);
    setErro(null);
    setDuplicado(null);
    try {
      await criarProspecto({
        nome: f.nome.trim(), contato: f.contato || null, cidade: f.cidade || null, ramo: f.ramo || null, origem: f.origem || null,
        volume_estimado_kg_mes: num(f.volume), fornecedor_atual: f.fornecedor || null, preco_concorrente: num(f.preco),
        temperatura: f.temperatura || null, motivo: f.motivo || null, proxima_acao: f.acao || null, proxima_acao_data: f.dataAcao || null,
      }, forcar);
      onSalvo();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.startsWith("HTTP 409")) setDuplicado("Já existe um cadastro com esse nome (cliente ou prospecto).");
      else setErro("Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }
  const linha = (rotulo: string, k: keyof typeof f, extra?: { tipo?: string; placeholder?: string }) => (
    <div style={{ flex: "1 1 220px" }}>
      <label style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--ink-muted)" }}>{rotulo}</label>
      <input type={extra?.tipo ?? "text"} value={f[k]} onChange={(e) => set(k, e.target.value)} placeholder={extra?.placeholder} style={campo} />
    </div>
  );
  return (
    <div onClick={onFechar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: 16, padding: 20, width: "100%", maxWidth: 720, maxHeight: "92vh", overflowY: "auto" }}>
        <h2 style={{ margin: "0 0 12px", fontSize: "1.1rem" }}>Novo prospecto</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
          {linha("Nome do estabelecimento / contato", "nome")}
          {linha("Telefone / WhatsApp", "contato", { placeholder: "(32) 9...." })}
          {linha("Cidade", "cidade")}
          {linha("Ramo", "ramo", { placeholder: "restaurante, mercado, peixaria…" })}
          <div style={{ flex: "1 1 220px" }}>
            <label style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--ink-muted)" }}>Origem do contato</label>
            <select value={f.origem} onChange={(e) => set("origem", e.target.value)} style={campo}>
              <option value="">—</option>
              {ORIGENS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          {linha("Volume estimado (kg/mês)", "volume", { tipo: "number" })}
          {linha("Fornecedor atual", "fornecedor")}
          {linha("Preço do concorrente (R$/kg)", "preco", { tipo: "number" })}
        </div>
        <label style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--ink-muted)" }}>Interesse / observação</label>
        <textarea value={f.motivo} onChange={(e) => set("motivo", e.target.value)} rows={2} style={{ ...campo, marginBottom: 10 }} />
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {TEMPERATURAS.map((t) => <button key={t} type="button" style={chip(f.temperatura === t)} onClick={() => set("temperatura", t)}>{t}</button>)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          {linha("Próxima ação", "acao")}
          {linha("Quando", "dataAcao", { tipo: "date" })}
        </div>
        {duplicado && (
          <p style={{ color: "var(--warn)", fontSize: "0.85rem" }}>
            {duplicado}{" "}
            <button type="button" onClick={() => salvar(true)} style={{ background: "none", border: "none", textDecoration: "underline", cursor: "pointer", color: "var(--ink-muted)" }}>É outro — criar mesmo assim</button>
          </p>
        )}
        {erro && <p style={{ color: "var(--crit)", fontSize: "0.85rem" }}>{erro}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onFechar} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)" }}>Cancelar</button>
          <button type="button" disabled={salvando} onClick={() => salvar()} style={{ ...chip(true), padding: "10px 18px" }}>{salvando ? "Salvando…" : "Cadastrar prospecto"}</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ página */
export default function CRM() {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>("recompra");
  const [erro, setErro] = useState<string | null>(null);
  const [contato, setContato] = useState<AlvoContato | null>(null);
  const [novoProspecto, setNovoProspecto] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // ---- recompra
  const [param, setParam] = useState<ParametrosRecompra>({ modo: "relativo", fator: 1.5, dias_fixos: 45, pedidos_do_intervalo: 5, min_pedidos: 3, dias_padrao: 60 });
  const [recompra, setRecompra] = useState<Recompra | null>(null);
  const [situacoes, setSituacoes] = useState<SituacaoRecompra[]>(["atrasado", "atencao"]);
  const [busca, setBusca] = useState("");
  const [vendedorSel, setVendedorSel] = useState("");
  const [ordem, setOrdem] = useState<{ col: string; asc: boolean } | null>(null);
  const [avancado, setAvancado] = useState(false);

  // ---- prospecção / agenda
  const [pros, setPros] = useState<Prospeccao | null>(null);
  const [agenda, setAgenda] = useState<ItemAgenda[] | null>(null);

  const carregarRecompra = useCallback(() => {
    buscarRecompra(param).then(setRecompra).catch(() => setErro("Não foi possível carregar a recompra."));
  }, [param]);
  const carregarPros = useCallback(() => { buscarProspeccao().then(setPros).catch(() => setErro("Não foi possível carregar a prospecção.")); }, []);
  const carregarAgenda = useCallback(() => { buscarAgenda().then(setAgenda).catch(() => undefined); }, []);

  useEffect(() => { carregarRecompra(); }, [carregarRecompra]);
  useEffect(() => { carregarPros(); carregarAgenda(); }, [carregarPros, carregarAgenda]);

  function depoisDoContato() {
    setContato(null);
    setMsg("Contato registrado");
    setTimeout(() => setMsg(null), 2500);
    carregarRecompra(); carregarPros(); carregarAgenda();
  }

  const vendedores = useMemo(() => Array.from(new Set((recompra?.clientes ?? []).map((c) => c.vendedor).filter(Boolean) as string[])).sort(), [recompra]);

  const linhas = useMemo(() => {
    const q = normaliza(busca);
    const f = (recompra?.clientes ?? []).filter((c) =>
      situacoes.includes(c.situacao) && (!q || normaliza(c.nome).includes(q)) && (!vendedorSel || c.vendedor === vendedorSel));
    if (!ordem) return f;
    const chave = (c: ClienteRecompra): number | string => {
      switch (ordem.col) {
        case "nome": return normaliza(c.nome);
        case "dias": return c.dias_sem_comprar;
        case "atraso": return c.dias_de_atraso;
        case "ticket": return c.ticket_medio;
        case "potencial": return c.potencial_mensal ?? -1;
        case "ultima": return c.ultima_compra;
        default: return 0;
      }
    };
    return [...f].sort((a, b) => { const ka = chave(a), kb = chave(b); const r = ka < kb ? -1 : ka > kb ? 1 : 0; return ordem.asc ? r : -r; });
  }, [recompra, situacoes, busca, vendedorSel, ordem]);

  function ordenar(col: string) { setOrdem((o) => (o?.col === col ? { col, asc: !o.asc } : { col, asc: col === "nome" })); }
  const th = (col: string, rotulo: string, dir = false) => (
    <th onClick={() => ordenar(col)} style={{ cursor: "pointer", whiteSpace: "nowrap", textAlign: dir ? "right" : "left" }}>{rotulo} {ordem?.col === col ? (ordem.asc ? "▲" : "▼") : ""}</th>
  );

  function exportar() {
    const cab = ["Cliente", "Cidade", "Telefone", "Vendedor", "Última compra", "Dias sem comprar", "Intervalo médio", "Limite (dias)", "Atraso (dias)", "Ticket médio", "Potencial/mês", "Situação"];
    const l = linhas.map((c) => [c.nome, c.cidade ?? "", c.telefone ?? "", c.vendedor ?? "", c.ultima_compra, c.dias_sem_comprar, c.intervalo_medio_dias ?? "", c.limite_dias, c.dias_de_atraso, c.ticket_medio, c.potencial_mensal ?? "", SITUACAO[c.situacao].rotulo]);
    const csv = "﻿" + [cab, ...l].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "crm_recompra.csv"; a.click(); URL.revokeObjectURL(url);
  }

  const agendaAtrasadas = (agenda ?? []).filter((a) => a.atrasada).length;
  const agendaHoje = (agenda ?? []).filter((a) => !a.atrasada).length;

  return (
    <div className={styles.page}>
      <div className={styles.appbar}>
        <button className={styles.backbtn} aria-label="Voltar" onClick={() => router.push("/painel")}>←</button>
        <div>
          <h1>CRM comercial</h1>
          <div className={styles.sub}>Recompra, prospecção e agenda de contatos</div>
        </div>
        <span className={styles.spacer} />
        <button type="button" onClick={() => setNovoProspecto(true)} style={{ ...chip(true), padding: "9px 16px" }}>+ Novo prospecto</button>
      </div>
      <div className={styles.body}>
        {erro && <div className={styles.erro}>{erro}</div>}
        {msg && <p className={styles.hint} style={{ color: "var(--ok)", fontWeight: 700 }}>{msg}</p>}

        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <button type="button" style={chip(aba === "recompra")} onClick={() => setAba("recompra")}>Recompra {recompra ? `(${recompra.resumo.atrasado + recompra.resumo.atencao})` : ""}</button>
          <button type="button" style={chip(aba === "prospeccao")} onClick={() => setAba("prospeccao")}>Prospecção {pros ? `(${pros.prospectos.filter((p) => p.fase !== "Perdido").length})` : ""}</button>
          <button type="button" style={chip(aba === "agenda")} onClick={() => setAba("agenda")}>
            Agenda {agenda ? `(${agenda.length})` : ""}{agendaAtrasadas > 0 ? ` · ${agendaAtrasadas} atrasada(s)` : ""}
          </button>
        </div>

        {/* ============================ RECOMPRA ============================ */}
        {aba === "recompra" && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 12, padding: 12, border: "1px solid var(--rule)", borderRadius: 12, background: "var(--surface)" }}>
              <div>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--ink-muted)", marginBottom: 5 }}>Como definir o limite (X dias)</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" style={chip(param.modo === "relativo")} onClick={() => setParam((p) => ({ ...p, modo: "relativo" }))}>Pelo ritmo do cliente</button>
                  <button type="button" style={chip(param.modo === "fixo")} onClick={() => setParam((p) => ({ ...p, modo: "fixo" }))}>Dias fixos</button>
                </div>
              </div>
              {param.modo === "relativo" ? (
                <div>
                  <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--ink-muted)" }}>Acima do intervalo médio entre pedidos</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="number" min={0} max={900} step={5} value={Math.round((param.fator - 1) * 100)}
                      onChange={(e) => setParam((p) => ({ ...p, fator: 1 + Math.max(0, Number(e.target.value) || 0) / 100 }))} style={{ ...campo, width: 90 }} /> %
                  </div>
                </div>
              ) : (
                <div>
                  <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--ink-muted)" }}>Sem comprar há mais de (dias)</label>
                  <input type="number" min={1} value={param.dias_fixos} onChange={(e) => setParam((p) => ({ ...p, dias_fixos: Math.max(1, Number(e.target.value) || 1) }))} style={{ ...campo, width: 110 }} />
                </div>
              )}
              <button type="button" onClick={() => setAvancado((a) => !a)} style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, cursor: "pointer" }}>{avancado ? "▾" : "▸"} Ajustes</button>
              {avancado && (
                <>
                  <div><label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--ink-muted)" }}>Últimos intervalos na média</label>
                    <input type="number" min={2} max={12} value={param.pedidos_do_intervalo} onChange={(e) => setParam((p) => ({ ...p, pedidos_do_intervalo: Math.min(12, Math.max(2, Number(e.target.value) || 5)) }))} style={{ ...campo, width: 90 }} /></div>
                  <div><label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--ink-muted)" }}>Mín. de pedidos p/ usar o ritmo</label>
                    <input type="number" min={2} max={20} value={param.min_pedidos} onChange={(e) => setParam((p) => ({ ...p, min_pedidos: Math.min(20, Math.max(2, Number(e.target.value) || 3)) }))} style={{ ...campo, width: 90 }} /></div>
                  <div><label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--ink-muted)" }}>Prazo p/ histórico curto (dias)</label>
                    <input type="number" min={7} value={param.dias_padrao} onChange={(e) => setParam((p) => ({ ...p, dias_padrao: Math.max(7, Number(e.target.value) || 60) }))} style={{ ...campo, width: 90 }} /></div>
                </>
              )}
            </div>
            <p className={styles.hint} style={{ margin: "0 0 12px" }}>
              {param.modo === "relativo"
                ? `Cliente fica "atrasado" quando passa do intervalo médio entre os últimos pedidos + ${Math.round((param.fator - 1) * 100)}%. Quem tem menos de ${param.min_pedidos} pedidos usa ${param.dias_padrao} dias.`
                : `Cliente fica "atrasado" quando está há mais de ${param.dias_fixos} dias sem comprar.`}{" "}
              Um pedido = um dia de compra do cliente.
            </p>

            {!recompra && !erro && <div className={styles.carregando}>Calculando…</div>}
            {recompra && (
              <>
                <div className={styles.cards}>
                  <div className={styles.card}><div className={styles.cardLabel}>Atrasados</div><div className={styles.cardValue} style={{ color: "var(--crit)" }}>{recompra.resumo.atrasado}</div><div className={styles.cardSub}>passaram do limite</div></div>
                  <div className={styles.card}><div className={styles.cardLabel}>Atenção</div><div className={styles.cardValue} style={{ color: "var(--warn)" }}>{recompra.resumo.atencao}</div><div className={styles.cardSub}>além do ritmo, ainda no limite</div></div>
                  <div className={styles.card}><div className={styles.cardLabel}>Inativos</div><div className={styles.cardValue}>{recompra.resumo.inativo}</div><div className={styles.cardSub}>mais de 6 meses</div></div>
                  <div className={styles.card}><div className={styles.cardLabel}>Compra/mês em risco</div><div className={styles.cardValue}>{moeda(recompra.resumo.potencial_mensal_em_risco)}</div><div className={styles.cardSub}>de atrasados + atenção</div></div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                  {(["atrasado", "atencao", "inativo", "em_dia"] as SituacaoRecompra[]).map((s) => (
                    <button key={s} type="button" style={chip(situacoes.includes(s))}
                      onClick={() => setSituacoes((l) => (l.includes(s) ? l.filter((x) => x !== s) : [...l, s]))}>
                      {SITUACAO[s].rotulo} ({recompra.resumo[s]})
                    </button>
                  ))}
                  <select value={vendedorSel} onChange={(e) => setVendedorSel(e.target.value)} style={{ ...campo, width: "auto" }}>
                    <option value="">Todos os vendedores</option>
                    {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente…" style={{ ...campo, flex: "1 1 180px", width: "auto" }} />
                  <button type="button" style={chip(false)} onClick={exportar}>Exportar CSV</button>
                </div>

                <div className={styles.tableWrap}>
                  <table className={styles.tabela}>
                    <thead>
                      <tr>
                        {th("nome", "Cliente")}{th("ultima", "Última compra")}{th("dias", "Sem comprar", true)}
                        <th style={{ textAlign: "right" }}>Ritmo</th><th style={{ textAlign: "right" }}>Limite (X)</th>{th("atraso", "Atraso", true)}
                        {th("ticket", "Ticket médio", true)}{th("potencial", "Compra/mês", true)}
                        <th>Último contato</th><th>Situação</th><th />
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.length === 0 && <tr><td colSpan={11} className={styles.hint}>Nenhum cliente nesse filtro.</td></tr>}
                      {linhas.map((c) => {
                        const st = SITUACAO[c.situacao];
                        const wa = linkWhatsApp(c.telefone, `Olá, ${c.nome.split(" ")[0]}! Faz um tempo que não nos falamos — posso separar o peixe dessa semana pra você?`);
                        return (
                          <tr key={c.cliente_id}>
                            <td>
                              <Link href={`/cadastros/clientes/${c.cliente_id}`} style={{ color: "var(--ink)", fontWeight: 700, textDecoration: "none" }}>{c.nome}</Link>
                              <div style={{ fontSize: "0.72rem", color: "var(--ink-faint)" }}>
                                {[c.cidade, c.vendedor, c.produtos_principais.join(", ")].filter(Boolean).join(" · ")}
                              </div>
                            </td>
                            <td>{dataBr(c.ultima_compra)}<div style={{ fontSize: "0.72rem", color: "var(--ink-faint)" }}>{c.pedidos} pedido(s)</div></td>
                            <td style={{ textAlign: "right", fontWeight: 700 }}>{c.dias_sem_comprar} d</td>
                            <td style={{ textAlign: "right" }}>{c.intervalo_medio_dias !== null ? `a cada ${c.intervalo_medio_dias.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} d` : <span title="poucos pedidos">curto</span>}</td>
                            <td style={{ textAlign: "right" }}>{c.limite_dias} d</td>
                            <td style={{ textAlign: "right", color: c.dias_de_atraso > 0 ? "var(--crit)" : undefined, fontWeight: c.dias_de_atraso > 0 ? 700 : 400 }}>{c.dias_de_atraso > 0 ? `+${c.dias_de_atraso} d` : "—"}</td>
                            <td style={{ textAlign: "right" }}>{moeda(c.ticket_medio)}</td>
                            <td style={{ textAlign: "right", fontWeight: 700 }}>{moeda(c.potencial_mensal)}</td>
                            <td>
                              {dataBr(c.ultimo_contato)}
                              {c.proxima_acao_data && <div style={{ fontSize: "0.72rem", color: c.proxima_acao_data < hojeISO() ? "var(--crit)" : "var(--ink-faint)" }}>↳ {dataBr(c.proxima_acao_data)} {c.proxima_acao ?? ""}</div>}
                            </td>
                            <td><span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 999, fontSize: "0.72rem", fontWeight: 700, background: st.bg, color: st.fg }}>{st.rotulo}</span></td>
                            <td style={{ whiteSpace: "nowrap" }}>
                              <button type="button" onClick={() => setContato({ id: c.cliente_id, nome: c.nome, temperatura: c.temperatura })} style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, cursor: "pointer" }}>Registrar contato</button>
                              {wa && <a href={wa} target="_blank" rel="noreferrer" style={{ marginLeft: 10, color: "var(--ok)", fontWeight: 700, textDecoration: "none" }}>WhatsApp</a>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {/* ============================ PROSPECÇÃO ============================ */}
        {aba === "prospeccao" && (
          <>
            {!pros && !erro && <div className={styles.carregando}>Carregando…</div>}
            {pros && (
              <>
                <div className={styles.cards}>
                  <div className={styles.card}><div className={styles.cardLabel}>Prospectos em andamento</div><div className={styles.cardValue}>{pros.prospectos.filter((p) => p.fase !== "Perdido").length}</div></div>
                  <div className={styles.card}><div className={styles.cardLabel}>Volume potencial</div><div className={styles.cardValue}>{pros.volume_estimado_kg_mes.toLocaleString("pt-BR")} kg/mês</div><div className={styles.cardSub}>soma das estimativas</div></div>
                  <div className={styles.card}><div className={styles.cardLabel}>Clientes novos (90 dias)</div><div className={styles.cardValue}>{pros.novos_clientes_90d}</div><div className={styles.cardSub}>primeira compra no período</div></div>
                  <div className={styles.card}><div className={styles.cardLabel}>Ações atrasadas</div><div className={styles.cardValue} style={{ color: "var(--crit)" }}>{pros.prospectos.filter((p) => p.acao_atrasada && p.fase !== "Perdido").length}</div></div>
                </div>

                {pros.prospectos.length === 0 && (
                  <p className={styles.hint}>Nenhum prospecto cadastrado ainda. Use &quot;+ Novo prospecto&quot; para começar o funil. Quando ele fizer a primeira compra, vira cliente sozinho.</p>
                )}

                <div style={{ display: "grid", gridTemplateColumns: `repeat(${pros.etapas.length}, minmax(240px, 1fr))`, gap: 12, overflowX: "auto", alignItems: "start" }}>
                  {pros.etapas.map((etapa) => (
                    <div key={etapa} style={{ background: "var(--surface-sunk)", borderRadius: 12, padding: 10, minHeight: 120 }}>
                      <div style={{ fontWeight: 800, fontSize: "0.85rem", marginBottom: 8 }}>{etapa} <span style={{ color: "var(--ink-faint)" }}>({pros.por_etapa[etapa] ?? 0})</span></div>
                      {pros.prospectos.filter((p) => p.fase === etapa).map((p) => (
                        <CartaoProspecto key={p.id} p={p} etapas={pros.etapas}
                          onContato={() => setContato({ id: p.id, nome: p.nome, fase: p.fase, temperatura: p.temperatura, etapas: pros.etapas })}
                          onMudou={(m) => { setMsg(m); setTimeout(() => setMsg(null), 2500); carregarPros(); carregarAgenda(); }} />
                      ))}
                    </div>
                  ))}
                </div>

                {pros.prospectos.some((p) => p.fase === "Perdido") && (
                  <>
                    <div className={styles.section}>Perdidos ({pros.por_etapa["Perdido"] ?? 0})</div>
                    <div className={styles.tableWrap}>
                      <table className={styles.tabela}>
                        <thead><tr><th>Prospecto</th><th>Motivo</th><th>Último contato</th><th /></tr></thead>
                        <tbody>
                          {pros.prospectos.filter((p) => p.fase === "Perdido").map((p) => (
                            <tr key={p.id}>
                              <td>{p.nome}<div style={{ fontSize: "0.72rem", color: "var(--ink-faint)" }}>{[p.cidade, p.ramo].filter(Boolean).join(" · ")}</div></td>
                              <td>{p.motivo_perda ?? "—"}</td>
                              <td>{dataBr(p.ultimo_contato)}</td>
                              <td><button type="button" onClick={() => atualizarFunil(p.id, { fase: "Novo" }).then(carregarPros)} style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, cursor: "pointer" }}>Reabrir</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ============================ AGENDA ============================ */}
        {aba === "agenda" && (
          <>
            {!agenda && <div className={styles.carregando}>Carregando…</div>}
            {agenda && agenda.length === 0 && <p className={styles.hint}>Nenhuma ação para hoje ou atrasada. Ao registrar um contato, defina a próxima ação e a data — ela aparece aqui.</p>}
            {agenda && agenda.length > 0 && (
              <>
                <p className={styles.hint}>{agendaAtrasadas} atrasada(s) · {agendaHoje} para hoje</p>
                <div className={styles.tableWrap}>
                  <table className={styles.tabela}>
                    <thead><tr><th>Quando</th><th>Cliente / prospecto</th><th>O que fazer</th><th>Vendedor</th><th /></tr></thead>
                    <tbody>
                      {agenda.map((a) => {
                        const wa = linkWhatsApp(a.contato, `Olá, ${a.nome.split(" ")[0]}! Tudo bem?`);
                        return (
                          <tr key={a.cliente_id}>
                            <td style={{ color: a.atrasada ? "var(--crit)" : undefined, fontWeight: 700 }}>{dataBr(a.proxima_acao_data)}{a.atrasada ? " (atrasada)" : " (hoje)"}</td>
                            <td>
                              <Link href={`/cadastros/clientes/${a.cliente_id}`} style={{ color: "var(--ink)", fontWeight: 700, textDecoration: "none" }}>{a.nome}</Link>
                              <div style={{ fontSize: "0.72rem", color: "var(--ink-faint)" }}>{a.e_cliente ? "Cliente" : `Prospecto · ${a.fase ?? "Novo"}`}{a.temperatura ? ` · ${a.temperatura}` : ""}</div>
                            </td>
                            <td>{a.proxima_acao ?? "—"}</td>
                            <td>{a.vendedor_nome ?? "—"}</td>
                            <td style={{ whiteSpace: "nowrap" }}>
                              <button type="button" onClick={() => setContato({ id: a.cliente_id, nome: a.nome, temperatura: a.temperatura, ...(a.e_cliente ? {} : { fase: a.fase ?? "Novo", etapas: pros?.etapas }) })}
                                style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, cursor: "pointer" }}>Registrar contato</button>
                              {wa && <a href={wa} target="_blank" rel="noreferrer" style={{ marginLeft: 10, color: "var(--ok)", fontWeight: 700, textDecoration: "none" }}>WhatsApp</a>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {contato && <ModalContato alvo={contato} onFechar={() => setContato(null)} onSalvo={depoisDoContato} />}
      {novoProspecto && <ModalProspecto onFechar={() => setNovoProspecto(false)} onSalvo={() => { setNovoProspecto(false); setAba("prospeccao"); carregarPros(); carregarAgenda(); }} />}
    </div>
  );
}

/* ------------------------------------------------------------------ cartão do funil */
function CartaoProspecto({ p, etapas, onContato, onMudou }: { p: Prospecto; etapas: string[]; onContato: () => void; onMudou: (msg: string) => void }) {
  const corTemp = p.temperatura === "Quente" ? "var(--crit)" : p.temperatura === "Morno" ? "var(--warn)" : "var(--ink-faint)";
  async function perder() {
    const motivo = window.prompt(`Por que ${p.nome} foi perdido? (preço, já tem fornecedor, sem retorno…)`);
    if (motivo === null) return;
    await atualizarFunil(p.id, { fase: "Perdido", motivo_perda: motivo.trim() || "Sem motivo informado", proxima_acao: null, proxima_acao_data: null });
    onMudou("Prospecto marcado como perdido");
  }
  async function converter() {
    if (!window.confirm(`Converter ${p.nome} em cliente? (Ele também vira cliente sozinho na primeira venda.)`)) return;
    await atualizarFunil(p.id, { converter_em_cliente: true });
    onMudou("Prospecto convertido em cliente");
  }
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--rule)", borderRadius: 10, padding: "10px 11px", marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <Link href={`/cadastros/clientes/${p.id}`} style={{ fontWeight: 800, color: "var(--ink)", textDecoration: "none" }}>{p.nome}</Link>
        {p.temperatura && <span style={{ fontSize: "0.7rem", fontWeight: 800, color: corTemp }}>● {p.temperatura}</span>}
      </div>
      <div style={{ fontSize: "0.74rem", color: "var(--ink-muted)" }}>{[p.cidade, p.ramo, p.origem].filter(Boolean).join(" · ")}</div>
      {p.volume_estimado_kg_mes !== null && <div style={{ fontSize: "0.78rem" }}>~{p.volume_estimado_kg_mes.toLocaleString("pt-BR")} kg/mês{p.fornecedor_atual ? ` · hoje com ${p.fornecedor_atual}` : ""}</div>}
      <div style={{ fontSize: "0.74rem", color: "var(--ink-faint)", marginTop: 4 }}>
        {p.ultimo_contato ? `Último contato há ${p.dias_sem_contato} d (${p.contatos})` : "Sem contato registrado"}
      </div>
      {p.proxima_acao_data && (
        <div style={{ fontSize: "0.76rem", fontWeight: 700, color: p.acao_atrasada ? "var(--crit)" : "var(--ink)", marginTop: 2 }}>
          ↳ {dataBr(p.proxima_acao_data)} {p.proxima_acao ?? ""}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8, alignItems: "center" }}>
        <button type="button" onClick={onContato} style={{ ...chip(true), padding: "5px 10px", fontSize: "0.76rem" }}>Registrar contato</button>
        <select value={p.fase} onChange={(e) => atualizarFunil(p.id, { fase: e.target.value }).then(() => onMudou("Etapa atualizada"))} style={{ ...campo, width: "auto", padding: "4px 6px", fontSize: "0.76rem" }}>
          {etapas.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
        <button type="button" onClick={converter} style={{ background: "none", border: "none", color: "var(--ok)", fontWeight: 700, fontSize: "0.76rem", cursor: "pointer", padding: 0 }}>Virou cliente</button>
        <button type="button" onClick={perder} style={{ background: "none", border: "none", color: "var(--crit)", fontWeight: 700, fontSize: "0.76rem", cursor: "pointer", padding: 0 }}>Perdido</button>
      </div>
    </div>
  );
}
