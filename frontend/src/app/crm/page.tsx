"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  atualizarFunil, buscarAgenda, buscarCobranca, buscarParcelasAbertas, buscarProspeccao, buscarRecompra, buscarRota, criarProspecto,
  definirLimiteRecompra, registrarContato,
  type ClienteCobranca, type ClienteRecompra, type Cobranca, type ItemAgenda, type ParcelaAberta, type ParametrosRecompra, type Prospecto,
  type Prospeccao, type Recompra, type Rota, type SituacaoRecompra,
} from "@/lib/crm";
import styles from "../painel/painel.module.css";

type Aba = "recompra" | "cobranca" | "abc" | "prospeccao" | "rota" | "agenda";
const TIPOS_CONTATO = ["WhatsApp", "Ligação", "Visita", "Cobrança", "E-mail", "Outro"];
const COR_CURVA: Record<string, { bg: string; fg: string }> = {
  A: { bg: "var(--ok-soft)", fg: "var(--ok)" }, B: { bg: "var(--warn-soft)", fg: "var(--warn)" },
  C: { bg: "var(--surface-sunk)", fg: "var(--ink-muted)" }, "-": { bg: "var(--surface-sunk)", fg: "var(--ink-faint)" },
};
function Curva({ c }: { c: string }) {
  const cor = COR_CURVA[c] ?? COR_CURVA["-"];
  return <span title={c === "-" ? "sem compras nos últimos 12 meses" : `Curva ${c}`} style={{ display: "inline-block", minWidth: 22, textAlign: "center", padding: "1px 7px", borderRadius: 6, fontSize: "0.74rem", fontWeight: 800, background: cor.bg, color: cor.fg }}>{c}</span>;
}
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
interface AlvoContato { id: number; nome: string; fase?: string | null; temperatura?: string | null; etapas?: string[]; tipo?: string; acao?: string; descricao?: string }

function ModalContato({ alvo, onFechar, onSalvo }: { alvo: AlvoContato; onFechar: () => void; onSalvo: () => void }) {
  const [tipo, setTipo] = useState(alvo.tipo ?? "WhatsApp");
  const [descricao, setDescricao] = useState(alvo.descricao ?? "");
  const [fase, setFase] = useState(alvo.fase ?? "");
  const [temperatura, setTemperatura] = useState(alvo.temperatura ?? "");
  const [acao, setAcao] = useState(alvo.acao ?? "");
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
  const [param, setParam] = useState<ParametrosRecompra>({ modo: "relativo", fator: 1.5, dias_fixos: 45, pedidos_do_intervalo: 5, min_pedidos: 3, dias_padrao: 60, abc_a: 0.8, abc_b: 0.95 });
  const [recompra, setRecompra] = useState<Recompra | null>(null);
  const [situacoes, setSituacoes] = useState<SituacaoRecompra[]>(["atrasado", "atencao"]);
  const [busca, setBusca] = useState("");
  const [vendedorSel, setVendedorSel] = useState("");
  const [ordem, setOrdem] = useState<{ col: string; asc: boolean } | null>(null);
  const [avancado, setAvancado] = useState(false);
  const [curvasSel, setCurvasSel] = useState<string[]>([]);
  const [cobranca, setCobranca] = useState<Cobranca | null>(null);
  const [filtroCobranca, setFiltroCobranca] = useState<"vencidos" | "vence3" | "estourado" | "curvaA" | "pararam" | "todos">("vencidos");
  const [buscaCobranca, setBuscaCobranca] = useState("");
  const [parcelasAbertas, setParcelasAbertas] = useState<Record<number, ParcelaAberta[]>>({});
  const [expandidoCobranca, setExpandidoCobranca] = useState<number | null>(null);
  const [rota, setRota] = useState<Rota | null>(null);
  const [vendedorRota, setVendedorRota] = useState("");
  const [cidadesAbertas, setCidadesAbertas] = useState<string[]>([]);
  const [roteiro, setRoteiro] = useState<string[]>([]); // chaves "tipo-id" das paradas escolhidas
  const [editandoLimite, setEditandoLimite] = useState<number | null>(null);
  const [valorLimite, setValorLimite] = useState("");

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
  const carregarCobranca = useCallback(() => { buscarCobranca().then(setCobranca).catch(() => setErro("Não foi possível carregar a cobrança.")); }, []);
  const carregarRota = useCallback(() => { buscarRota(vendedorRota || undefined).then(setRota).catch(() => setErro("Não foi possível carregar a rota.")); }, [vendedorRota]);
  useEffect(() => { if (aba === "cobranca") carregarCobranca(); }, [aba, carregarCobranca]);
  useEffect(() => { if (aba === "rota") carregarRota(); }, [aba, carregarRota]);

  function depoisDoContato() {
    setContato(null);
    setMsg("Contato registrado");
    setTimeout(() => setMsg(null), 2500);
    carregarRecompra(); carregarPros(); carregarAgenda();
    if (aba === "cobranca") carregarCobranca();
    if (aba === "rota") carregarRota();
  }

  const vendedores = useMemo(() => Array.from(new Set((recompra?.clientes ?? []).map((c) => c.vendedor).filter(Boolean) as string[])).sort(), [recompra]);

  const linhas = useMemo(() => {
    const q = normaliza(busca);
    const f = (recompra?.clientes ?? []).filter((c) =>
      situacoes.includes(c.situacao) && (!q || normaliza(c.nome).includes(q)) && (!vendedorSel || c.vendedor === vendedorSel) &&
      (curvasSel.length === 0 || curvasSel.includes(c.curva)));
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
  }, [recompra, situacoes, busca, vendedorSel, ordem, curvasSel]);

  // ---- cobrança: filtro e abertura das parcelas
  const linhasCobranca = useMemo(() => {
    const q = normaliza(buscaCobranca);
    return (cobranca?.clientes ?? []).filter((c) => {
      if (q && !normaliza(c.nome).includes(q)) return false;
      switch (filtroCobranca) {
        case "vencidos": return c.vencido > 0;
        case "vence3": return c.a_vencer_3d > 0;
        case "estourado": return c.status === "estourado";
        case "curvaA": return c.curva === "A";
        case "pararam": return c.situacao_recompra === "atrasado" || c.situacao_recompra === "inativo";
        default: return true;
      }
    });
  }, [cobranca, filtroCobranca, buscaCobranca]);

  function abrirParcelas(id: number) {
    setExpandidoCobranca((atual) => (atual === id ? null : id));
    if (!parcelasAbertas[id]) buscarParcelasAbertas(id).then((l) => setParcelasAbertas((m) => ({ ...m, [id]: l }))).catch(() => undefined);
  }

  const curvaClientes = useMemo(() => (recompra?.clientes ?? []).filter((c) => c.curva !== "-" ).sort((a, b) => b.valor_12m - a.valor_12m), [recompra]);
  const [classeAbc, setClasseAbc] = useState<string>("todas");

  async function salvarLimite(clienteId: number, valor: string) {
    const dias = valor.trim() === "" ? null : Math.round(Number(valor));
    if (dias !== null && !(dias >= 1 && dias <= 730)) { setMsg("Informe de 1 a 730 dias."); setTimeout(() => setMsg(null), 2500); return; }
    try {
      await definirLimiteRecompra(clienteId, dias);
      setEditandoLimite(null);
      setMsg(dias === null ? "Voltou ao cálculo automático" : `Limite do cliente ajustado para ${dias} dias`);
      setTimeout(() => setMsg(null), 2500);
      carregarRecompra();
    } catch {
      setMsg("Não foi possível salvar o limite.");
      setTimeout(() => setMsg(null), 2500);
    }
  }

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
          <button type="button" style={chip(aba === "cobranca")} onClick={() => setAba("cobranca")}>Cobrança {cobranca ? `(${cobranca.resumo.clientes_vencidos})` : ""}</button>
          <button type="button" style={chip(aba === "abc")} onClick={() => setAba("abc")}>Curva ABC</button>
          <button type="button" style={chip(aba === "prospeccao")} onClick={() => setAba("prospeccao")}>Prospecção {pros ? `(${pros.prospectos.filter((p) => p.fase !== "Perdido").length})` : ""}</button>
          <button type="button" style={chip(aba === "rota")} onClick={() => setAba("rota")}>Rota de visitas {rota ? `(${rota.total_paradas})` : ""}</button>
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
              Um pedido = um dia de compra do cliente. O limite de cada cliente pode ser ajustado à mão (clique no valor da coluna Limite); o ajuste vale no lugar do automático.
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
                  {["A", "B", "C"].map((k) => (
                    <button key={k} type="button" title={`Só clientes da curva ${k}`} style={chip(curvasSel.includes(k))}
                      onClick={() => setCurvasSel((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]))}>Curva {k}</button>
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
                        {th("nome", "Cliente")}<th>Curva</th>{th("ultima", "Última compra")}{th("dias", "Sem comprar", true)}
                        <th style={{ textAlign: "right" }}>Ritmo</th><th style={{ textAlign: "right" }}>Limite (X)</th>{th("atraso", "Atraso", true)}
                        {th("ticket", "Ticket médio", true)}{th("potencial", "Compra/mês", true)}
                        <th>Último contato</th><th>Situação</th><th />
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.length === 0 && <tr><td colSpan={12} className={styles.hint}>Nenhum cliente nesse filtro.</td></tr>}
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
                            <td>
                              <Curva c={c.curva} />
                              {c.vencido > 0 && <div title="valor vencido a receber deste cliente" style={{ fontSize: "0.7rem", color: "var(--crit)", fontWeight: 700 }}>deve {moeda(c.vencido)}</div>}
                            </td>
                            <td>{dataBr(c.ultima_compra)}<div style={{ fontSize: "0.72rem", color: "var(--ink-faint)" }}>{c.pedidos} pedido(s)</div></td>
                            <td style={{ textAlign: "right", fontWeight: 700 }}>{c.dias_sem_comprar} d</td>
                            <td style={{ textAlign: "right" }}>{c.intervalo_medio_dias !== null ? `a cada ${c.intervalo_medio_dias.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} d` : <span title="poucos pedidos">curto</span>}</td>
                            <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                              {editandoLimite === c.cliente_id ? (
                                <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                                  <input
                                    autoFocus type="number" min={1} max={730} value={valorLimite} onChange={(e) => setValorLimite(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") salvarLimite(c.cliente_id, valorLimite); if (e.key === "Escape") setEditandoLimite(null); }}
                                    style={{ ...campo, width: 70, padding: "4px 6px", textAlign: "right" }}
                                  />
                                  <button type="button" onClick={() => salvarLimite(c.cliente_id, valorLimite)} style={{ ...chip(true), padding: "4px 9px" }}>OK</button>
                                  {c.limite_manual && (
                                    <button type="button" title={`Voltar ao cálculo automático (${c.limite_automatico_dias} d)`} onClick={() => salvarLimite(c.cliente_id, "")}
                                      style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, cursor: "pointer", fontSize: "0.74rem" }}>automático</button>
                                  )}
                                </span>
                              ) : (
                                <button
                                  type="button" title={c.limite_manual ? `Ajustado manualmente (automático seria ${c.limite_automatico_dias} d) — clique para alterar` : "Calculado automaticamente — clique para ajustar só este cliente"}
                                  onClick={() => { setEditandoLimite(c.cliente_id); setValorLimite(String(c.limite_dias)); }}
                                  style={{ background: "none", border: "1px dashed var(--rule-strong)", borderRadius: 8, padding: "2px 8px", cursor: "pointer", font: "inherit", color: c.limite_manual ? "var(--brand-deep)" : "var(--ink)", fontWeight: c.limite_manual ? 800 : 400 }}
                                >
                                  {c.limite_dias} d {c.limite_manual ? "✎" : ""}
                                </button>
                              )}
                            </td>
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

        {/* ============================ COBRANÇA ============================ */}
        {aba === "cobranca" && (
          <>
            {!cobranca && !erro && <div className={styles.carregando}>Carregando…</div>}
            {cobranca && (
              <>
                <div className={styles.cards}>
                  <div className={styles.card}><div className={styles.cardLabel}>Vencido a receber</div><div className={styles.cardValue} style={{ color: "var(--crit)" }}>{moeda(cobranca.resumo.vencido)}</div><div className={styles.cardSub}>{cobranca.resumo.clientes_vencidos} cliente(s)</div></div>
                  <div className={styles.card}><div className={styles.cardLabel}>Vence em até 3 dias</div><div className={styles.cardValue}>{moeda(cobranca.resumo.a_vencer_3d)}</div></div>
                  <div className={styles.card}><div className={styles.cardLabel}>Vencido de clientes curva A</div><div className={styles.cardValue}>{moeda(cobranca.resumo.vencido_de_clientes_curva_a)}</div><div className={styles.cardSub}>quem mais compra</div></div>
                  <div className={styles.card}>
                    <div className={styles.cardLabel}>Atraso por faixa</div>
                    {(["1-30", "31-60", "61-90", "90+"] as const).map((f) => (
                      <div key={f} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}><span>{f} dias</span><strong>{moeda(cobranca.resumo.faixas[f])}</strong></div>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                  {([["vencidos", "Com vencido"], ["vence3", "Vence em 3 dias"], ["estourado", "Acima do limite"], ["curvaA", "Curva A"], ["pararam", "Pararam de comprar"], ["todos", "Todos"]] as const).map(([f, r]) => (
                    <button key={f} type="button" style={chip(filtroCobranca === f)} onClick={() => setFiltroCobranca(f)}>{r}</button>
                  ))}
                  <input value={buscaCobranca} onChange={(e) => setBuscaCobranca(e.target.value)} placeholder="Buscar cliente…" style={{ ...campo, flex: "1 1 180px", width: "auto" }} />
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.tabela}>
                    <thead><tr><th>Cliente</th><th>Curva</th><th style={{ textAlign: "right" }}>Vencido</th><th style={{ textAlign: "right" }}>Vence em 3 d</th><th style={{ textAlign: "right" }}>Em aberto</th><th style={{ textAlign: "right" }}>Maior atraso</th><th>Compras</th><th>Última cobrança</th><th /></tr></thead>
                    <tbody>
                      {linhasCobranca.length === 0 && <tr><td colSpan={9} className={styles.hint}>Ninguém nesse filtro.</td></tr>}
                      {linhasCobranca.map((c: ClienteCobranca) => {
                        const wa = linkWhatsApp(c.telefone, `Olá, ${c.nome.split(" ")[0]}! Tudo bem? Passando pra lembrar do pagamento de ${moeda(c.vencido > 0 ? c.vencido : c.a_vencer_3d)} ${c.vencido > 0 ? "em aberto" : "que vence em breve"}. Pode me confirmar a data?`);
                        const prioridade = c.curva === "A" && c.vencido > 0;
                        return (
                          <Fragment key={c.cliente_id}>
                            <tr>
                              <td>
                                <Link href={`/cadastros/clientes/${c.cliente_id}`} style={{ color: "var(--ink)", fontWeight: 700, textDecoration: "none" }}>{prioridade ? "🔥 " : ""}{c.nome}</Link>
                                <div style={{ fontSize: "0.72rem", color: "var(--ink-faint)" }}>{[c.cidade, c.vendedor_nome, c.limite_credito !== null ? `limite ${moeda(c.limite_credito)}${c.status === "estourado" ? " (estourado)" : ""}` : null].filter(Boolean).join(" · ")}</div>
                              </td>
                              <td><Curva c={c.curva} /></td>
                              <td style={{ textAlign: "right", color: c.vencido > 0 ? "var(--crit)" : undefined, fontWeight: 700 }}>{c.vencido > 0 ? moeda(c.vencido) : "—"}</td>
                              <td style={{ textAlign: "right" }}>{c.a_vencer_3d > 0 ? moeda(c.a_vencer_3d) : "—"}</td>
                              <td style={{ textAlign: "right" }}>{moeda(c.em_aberto)}</td>
                              <td style={{ textAlign: "right", color: (c.maior_atraso_dias ?? 0) > 30 ? "var(--crit)" : undefined }}>{c.maior_atraso_dias ? `${c.maior_atraso_dias} d` : "—"}</td>
                              <td>
                                {c.situacao_recompra ? <span style={{ fontSize: "0.74rem", fontWeight: 700, color: SITUACAO[c.situacao_recompra].fg }}>{SITUACAO[c.situacao_recompra].rotulo}{c.dias_sem_comprar !== null ? ` · ${c.dias_sem_comprar} d sem comprar` : ""}</span> : "—"}
                                {c.potencial_mensal ? <div style={{ fontSize: "0.7rem", color: "var(--ink-faint)" }}>compra ~{moeda(c.potencial_mensal)}/mês</div> : null}
                              </td>
                              <td>
                                {dataBr(c.ultima_cobranca)}
                                {c.proxima_acao_data && <div style={{ fontSize: "0.72rem", color: c.proxima_acao_data < hojeISO() ? "var(--crit)" : "var(--ink-faint)" }}>↳ {dataBr(c.proxima_acao_data)} {c.proxima_acao ?? ""}</div>}
                              </td>
                              <td style={{ whiteSpace: "nowrap" }}>
                                <button type="button" onClick={() => abrirParcelas(c.cliente_id)} style={{ background: "none", border: "none", color: "var(--ink-muted)", fontWeight: 700, cursor: "pointer" }}>{expandidoCobranca === c.cliente_id ? "▾" : "▸"} parcelas</button>
                                <button type="button" onClick={() => setContato({ id: c.cliente_id, nome: c.nome, tipo: "Cobrança", acao: "Conferir se pagou", descricao: `Cobrança de ${moeda(c.vencido)} vencido. ` })} style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, cursor: "pointer" }}>Registrar cobrança</button>
                                {wa && <a href={wa} target="_blank" rel="noreferrer" style={{ marginLeft: 8, color: "var(--ok)", fontWeight: 700, textDecoration: "none" }}>WhatsApp</a>}
                              </td>
                            </tr>
                            {expandidoCobranca === c.cliente_id && (
                              <tr style={{ background: "var(--ground)" }}>
                                <td colSpan={9} style={{ padding: "6px 14px 12px" }}>
                                  {!parcelasAbertas[c.cliente_id] && <span className={styles.hint}>Carregando…</span>}
                                  {(parcelasAbertas[c.cliente_id] ?? []).map((p, i) => (
                                    <div key={i} style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: "0.82rem", padding: "2px 0" }}>
                                      <strong>{moeda(p.valor)}</strong><span>{p.produto}</span><span>venda de {dataBr(p.data_venda)}</span><span>{p.forma_pgto}</span>
                                      <span style={{ color: p.dias_de_atraso > 0 ? "var(--crit)" : "var(--ink-muted)", fontWeight: 700 }}>vence {dataBr(p.data_prevista)}{p.dias_de_atraso > 0 ? ` (${p.dias_de_atraso} d de atraso)` : ""}</span>
                                    </div>
                                  ))}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className={styles.hint}>🔥 = cliente da curva A com valor vencido: vale cobrar primeiro, antes que ele pare de comprar. Cobrar e vender se encontram aqui: veja quem ainda compra e quem já parou.</p>
              </>
            )}
          </>
        )}

        {/* ============================ CURVA ABC ============================ */}
        {aba === "abc" && (
          <>
            {!recompra && !erro && <div className={styles.carregando}>Calculando…</div>}
            {recompra && (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 12, padding: 12, border: "1px solid var(--rule)", borderRadius: 12, background: "var(--surface)" }}>
                  <div>
                    <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--ink-muted)" }}>Curva A: até (% do faturamento de 12 meses)</label>
                    <input type="number" min={10} max={95} value={Math.round(param.abc_a * 100)} onChange={(e) => setParam((p) => ({ ...p, abc_a: Math.min(0.95, Math.max(0.1, (Number(e.target.value) || 80) / 100)) }))} style={{ ...campo, width: 90 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--ink-muted)" }}>Curva B: até (% acumulado)</label>
                    <input type="number" min={20} max={99} value={Math.round(param.abc_b * 100)} onChange={(e) => setParam((p) => ({ ...p, abc_b: Math.min(0.99, Math.max(p.abc_a + 0.01, (Number(e.target.value) || 95) / 100)) }))} style={{ ...campo, width: 90 }} />
                  </div>
                  <span className={styles.hint} style={{ margin: 0 }}>O restante é curva C. Total vendido em 12 meses: <strong>{moeda(recompra.total_12m)}</strong></span>
                </div>
                <div className={styles.cards}>
                  {(["A", "B", "C"] as const).map((k) => {
                    const r = recompra.abc[k];
                    return (
                      <div key={k} className={styles.card}>
                        <div className={styles.cardLabel}><Curva c={k} /> {r.clientes} cliente(s)</div>
                        <div className={styles.cardValue}>{(r.participacao * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</div>
                        <div className={styles.cardSub}>{moeda(r.valor_12m)} em 12 meses</div>
                        <div style={{ fontSize: "0.76rem", marginTop: 6, color: r.em_risco > 0 ? "var(--crit)" : "var(--ink-muted)" }}>
                          {r.em_risco} em risco de parar · {moeda(r.potencial_mensal_em_risco)}/mês
                        </div>
                        {r.vencido > 0 && <div style={{ fontSize: "0.76rem", color: "var(--crit)" }}>{moeda(r.vencido)} vencido</div>}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", height: 16, borderRadius: 999, overflow: "hidden", marginBottom: 14 }} title="participação de cada curva no faturamento">
                  {(["A", "B", "C"] as const).map((k) => (
                    <div key={k} style={{ width: `${recompra.abc[k].participacao * 100}%`, background: COR_CURVA[k].fg, opacity: 0.85 }} />
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  {["todas", "A", "B", "C"].map((k) => <button key={k} type="button" style={chip(classeAbc === k)} onClick={() => setClasseAbc(k)}>{k === "todas" ? "Todas" : `Curva ${k}`}</button>)}
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.tabela}>
                    <thead><tr><th>#</th><th>Cliente</th><th>Curva</th><th style={{ textAlign: "right" }}>Vendido em 12 meses</th><th style={{ textAlign: "right" }}>% do total</th><th>% acumulado</th><th>Recompra</th><th style={{ textAlign: "right" }}>Vencido</th></tr></thead>
                    <tbody>
                      {curvaClientes.filter((c) => classeAbc === "todas" || c.curva === classeAbc).map((c, i) => (
                        <tr key={c.cliente_id}>
                          <td>{i + 1}</td>
                          <td><Link href={`/cadastros/clientes/${c.cliente_id}`} style={{ color: "var(--ink)", fontWeight: 700, textDecoration: "none" }}>{c.nome}</Link><div style={{ fontSize: "0.72rem", color: "var(--ink-faint)" }}>{[c.cidade, c.vendedor].filter(Boolean).join(" · ")}</div></td>
                          <td><Curva c={c.curva} /></td>
                          <td style={{ textAlign: "right", fontWeight: 700 }}>{moeda(c.valor_12m)}</td>
                          <td style={{ textAlign: "right" }}>{(c.participacao_12m * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</td>
                          <td style={{ minWidth: 120 }}>
                            <div style={{ background: "var(--surface-sunk)", borderRadius: 999, height: 8, overflow: "hidden" }}><div style={{ width: `${c.participacao_acumulada * 100}%`, height: "100%", background: COR_CURVA[c.curva]?.fg }} /></div>
                          </td>
                          <td><span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 999, fontSize: "0.72rem", fontWeight: 700, background: SITUACAO[c.situacao].bg, color: SITUACAO[c.situacao].fg }}>{SITUACAO[c.situacao].rotulo}</span><div style={{ fontSize: "0.7rem", color: "var(--ink-faint)" }}>{c.dias_sem_comprar} d sem comprar</div></td>
                          <td style={{ textAlign: "right", color: c.vencido > 0 ? "var(--crit)" : undefined }}>{c.vencido > 0 ? moeda(c.vencido) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className={styles.hint}>Curva A = poucos clientes que sustentam a maior parte do faturamento: são os que mais merecem atenção quando atrasam na compra ou no pagamento.</p>
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

        {/* ============================ ROTA DE VISITAS ============================ */}
        {aba === "rota" && (
          <>
            <style>{`
              .somente-impressao { display: none; }
              @media print {
                .nao-imprimir { display: none !important; }
                .somente-impressao { display: block !important; }
              }
            `}</style>
            <div className="nao-imprimir">
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
                <select value={vendedorRota} onChange={(e) => setVendedorRota(e.target.value)} style={{ ...campo, width: "auto" }}>
                  <option value="">Todos os vendedores</option>
                  {(rota?.vendedores ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
                <span className={styles.hint} style={{ margin: 0 }}>Marque as paradas da semana e imprima o roteiro. Cidades com mais valor em jogo aparecem primeiro.</span>
                <span className={styles.spacer} />
                <button type="button" disabled={roteiro.length === 0} onClick={() => window.print()} style={{ ...chip(true), opacity: roteiro.length === 0 ? 0.5 : 1 }}>Imprimir roteiro ({roteiro.length})</button>
                {roteiro.length > 0 && <button type="button" onClick={() => setRoteiro([])} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)" }}>limpar</button>}
              </div>
              {!rota && !erro && <div className={styles.carregando}>Montando a rota…</div>}
              {rota && rota.cidades.length === 0 && <p className={styles.hint}>Nenhuma parada: ninguém atrasado na compra, sem cobrança ou prospecto em aberto.</p>}
              {rota?.cidades.map((c) => {
                const aberta = cidadesAbertas.includes(c.cidade);
                const chaves = c.paradas.map((p) => `${p.tipo}-${p.cliente_id}`);
                const todas = chaves.every((k) => roteiro.includes(k));
                return (
                  <div key={c.cidade} style={{ border: "1px solid var(--rule)", borderRadius: 12, marginBottom: 10, background: "var(--surface)", overflow: "hidden" }}>
                    <div onClick={() => setCidadesAbertas((l) => (aberta ? l.filter((x) => x !== c.cidade) : [...l, c.cidade]))}
                      style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", padding: "11px 14px", cursor: "pointer" }}>
                      <strong style={{ fontSize: "1rem" }}>{aberta ? "▾" : "▸"} {c.cidade}</strong>
                      <span>{c.paradas.length} parada(s)</span>
                      {c.potencial_mensal > 0 && <span style={{ color: "var(--ink-muted)" }}>compra em risco {moeda(c.potencial_mensal)}/mês</span>}
                      {c.vencido > 0 && <span style={{ color: "var(--crit)", fontWeight: 700 }}>{moeda(c.vencido)} a cobrar</span>}
                      {c.prospectos > 0 && <span style={{ color: "var(--brand-deep)", fontWeight: 700 }}>{c.prospectos} prospecto(s)</span>}
                      <span className={styles.spacer} />
                      <button type="button" onClick={(e) => { e.stopPropagation(); setRoteiro((r) => (todas ? r.filter((k) => !chaves.includes(k)) : Array.from(new Set([...r, ...chaves])))); }}
                        style={{ ...chip(todas), padding: "5px 11px" }}>{todas ? "Tirar todas" : "Marcar todas"}</button>
                    </div>
                    {aberta && (
                      <div style={{ borderTop: "1px solid var(--rule)", padding: "6px 14px 10px" }}>
                        {c.paradas.map((p) => {
                          const k = `${p.tipo}-${p.cliente_id}`;
                          const wa = linkWhatsApp(p.telefone, `Olá, ${p.nome.split(" ")[0]}! Estou passando na sua região essa semana — posso te visitar?`);
                          return (
                            <label key={k} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "7px 0", borderBottom: "1px dashed var(--rule)", cursor: "pointer" }}>
                              <input type="checkbox" checked={roteiro.includes(k)} onChange={() => setRoteiro((r) => (r.includes(k) ? r.filter((x) => x !== k) : [...r, k]))} style={{ marginTop: 4 }} />
                              <span style={{ flex: 1 }}>
                                <Link href={`/cadastros/clientes/${p.cliente_id}`} style={{ fontWeight: 700, color: "var(--ink)", textDecoration: "none" }}>{p.nome}</Link>{" "}
                                <span style={{ fontSize: "0.7rem", color: "var(--ink-faint)" }}>{p.tipo === "prospecto" ? "prospecto" : `curva ${p.curva}`}{p.vendedor ? ` · ${p.vendedor}` : ""}</span>
                                <div style={{ fontSize: "0.78rem", color: "var(--ink-muted)" }}>{p.motivos.join(" · ")}</div>
                                <div style={{ fontSize: "0.74rem", color: "var(--ink-faint)" }}>{[p.endereco, p.telefone].filter(Boolean).join(" · ") || "sem endereço/telefone cadastrado"}</div>
                              </span>
                              {wa && <a href={wa} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "var(--ok)", fontWeight: 700, textDecoration: "none" }}>WhatsApp</a>}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* versão para impressão: só as paradas marcadas, por cidade */}
            <div className="somente-impressao">
              <h2 style={{ margin: "0 0 8px" }}>Roteiro de visitas{vendedorRota ? ` — ${vendedorRota}` : ""}</h2>
              {rota?.cidades.map((c) => {
                const marcadas = c.paradas.filter((p) => roteiro.includes(`${p.tipo}-${p.cliente_id}`));
                if (marcadas.length === 0) return null;
                return (
                  <div key={c.cidade} style={{ marginBottom: 14 }}>
                    <h3 style={{ margin: "0 0 4px" }}>{c.cidade}</h3>
                    {marcadas.map((p) => (
                      <div key={`${p.tipo}-${p.cliente_id}`} style={{ borderBottom: "1px solid #999", padding: "5px 0", fontSize: "11pt" }}>
                        ☐ <strong>{p.nome}</strong> {p.tipo === "prospecto" ? "(prospecto)" : `(curva ${p.curva})`}
                        <div>{p.motivos.join(" · ")}</div>
                        <div>{[p.endereco, p.telefone].filter(Boolean).join(" · ")}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
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
