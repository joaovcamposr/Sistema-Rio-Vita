"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  editarArracoamento, editarBiometria, editarDespesca, editarPovoamento, editarProducao, editarRepicagem, historicoLancamentos,
  excluirArracoamento, excluirBiometria, excluirDespesca, excluirProducao, excluirRepicagem, excluirVenda,
  listarProdutos, listarVendas, type Produto,
} from "@/lib/api";
import { listarChegadasRacao, listarDespesasSoltas } from "@/lib/cadastros";
import {
  listarAjustesEstoque, painelArracoamento, painelBiometria, painelDespesca, painelProducaoDetalhe, painelRepicagem,
} from "@/lib/paineis";
import styles from "@/app/lancar/form.module.css";

export type Tipo =
  | "producao" | "venda" | "despesca" | "repicagem" | "arracoamento" | "biometria"
  | "despesa" | "chegada_racao" | "ajuste_estoque" | "agua" | "povoamento" | "expedicao" | "acerto";

const ROTULOS: Record<Tipo, string> = {
  producao: "Produção", venda: "Venda", despesca: "Despesca", repicagem: "Repicagem", arracoamento: "Arraçoamento",
  biometria: "Biometria", despesa: "Despesa", chegada_racao: "Chegada de ração", ajuste_estoque: "Ajuste de estoque",
  agua: "Água", povoamento: "Povoamento", expedicao: "Expedição", acerto: "Acerto",
};

interface Campo {
  chave: string;
  rotulo: string;
  tipo: "date" | "number" | "select";
  valor: string;
  opcoes?: { valor: string; rotulo: string }[];
}

interface Lancamento {
  chave: string;
  tipo: Tipo;
  id: number;
  data: string;
  titulo: string;
  detalhe: string;
  por?: string | null; // quem lançou
  em?: string | null; // quando foi lançado (ISO)
  campos?: Campo[];
  salvar?: (v: Record<string, string>) => Promise<void>;
  excluir?: () => Promise<void>;
  link?: string; // tela onde esse tipo de lançamento é ajustado, quando não dá pra editar aqui
}

function dataLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dataLocalISO(d);
}
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
function nf(v: number, casas = 1): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function quando(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function num(v: string): number {
  return parseFloat(v.replace(",", "."));
}
function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Histórico dos lançamentos de uma tela de Lançar: lista o que já foi lançado (últimos dias),
 * permite corrigir/excluir ali mesmo, ou levar pra tela onde o tipo é ajustado. */
export default function HistoricoLancamentos({ tipos, titulo = "Lançamentos recentes" }: { tipos: Tipo[]; titulo?: string }) {
  const [de, setDe] = useState(diasAtras(6));
  const [ate, setAte] = useState(dataLocalISO(new Date()));
  const [filtro, setFiltro] = useState<Tipo | "todos">("todos");
  const [aberto, setAberto] = useState(true);
  const [itens, setItens] = useState<Lancamento[] | null>(null);
  const [falhas, setFalhas] = useState<string[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);

  useEffect(() => {
    listarProdutos().then(setProdutos).catch(() => undefined);
  }, []);

  const carregar = useCallback(async () => {
    setItens(null);
    const prod = new Map(produtos.map((p) => [p.id, p]));
    const grupos: Promise<Lancamento[]>[] = [];
    const nomes: string[] = [];
    // só busca os tipos que esta tela mostra
    const add = (tipo: Tipo, nome: string, p: () => Promise<Lancamento[]>) => {
      if (!tipos.includes(tipo)) return;
      nomes.push(nome);
      grupos.push(p());
    };

    add("producao", "Produção", () => painelProducaoDetalhe(de, ate).then((rs) => rs.map((r) => {
      const digitado = prod.get(r.produto_id)?.kg_digitado ?? true;
      const campos: Campo[] = [
        { chave: "data", rotulo: "Data", tipo: "date", valor: r.data },
        ...(digitado
          ? [
              { chave: "un", rotulo: "Unidades (opcional)", tipo: "number" as const, valor: r.quantidade_embalagens?.toString() ?? "" },
              { chave: "kg", rotulo: "Peso (kg)", tipo: "number" as const, valor: String(r.quantidade_kg) },
            ]
          : [{ chave: "un", rotulo: "Embalagens", tipo: "number" as const, valor: r.quantidade_embalagens?.toString() ?? "" }]),
        { chave: "turno", rotulo: "Turno", tipo: "select", valor: r.turno ?? "",
          opcoes: [{ valor: "", rotulo: "—" }, { valor: "manha", rotulo: "Manhã" }, { valor: "tarde", rotulo: "Tarde" }] },
      ];
      return {
        chave: `producao-${r.id}`, tipo: "producao" as const, id: r.id, data: r.data, titulo: r.produto_nome,
        por: r.criado_por, em: r.criado_em,
        detalhe: `${nf(r.quantidade_kg)} kg${r.quantidade_embalagens ? ` · ${nf(r.quantidade_embalagens, 0)} un` : ""}`
          + (r.turno ? ` · turno da ${r.turno === "manha" ? "manhã" : "tarde"}` : "")
          + (r.lote_codigo ? ` · ${r.lote_codigo}` : "") + (r.viveiro_codigo ? ` (viveiro ${r.viveiro_codigo})` : ""),
        campos,
        salvar: (v) => editarProducao(r.id, {
          data: v.data, produto_id: r.produto_id,
          quantidade_embalagens: v.un ? num(v.un) : null,
          quantidade_kg: digitado ? (v.kg ? num(v.kg) : null) : null,
          lote_id: r.lote_id, data_despesca: r.data_despesca, turno: (v.turno || null) as "manha" | "tarde" | null,
        }),
        excluir: () => excluirProducao(r.id),
      };
    })));

    add("venda", "Vendas", () => listarVendas({ de, ate }).then((rs) => rs.filter((v) => !v.excluido_em).map((v) => ({
      chave: `venda-${v.id}`, tipo: "venda" as const, id: v.id, data: v.data, titulo: `${v.produto_nome} → ${v.cliente_nome}`,
      por: v.criado_por, em: v.criado_em,
        detalhe: `${v.quantidade_un !== null ? `${nf(v.quantidade_un, 0)} un · ` : ""}${nf(v.quantidade_kg)} kg · ${moeda(v.valor_total)} · ${v.situacao}`,
      link: `/lancar/recebimentos?editar=${v.id}`,
      excluir: () => excluirVenda(v.id),
    }))));

    add("despesca", "Despesca", () => painelDespesca(de, ate).then((rs) => rs.map((r) => ({
      chave: `despesca-${r.id}`, tipo: "despesca" as const, id: r.id, data: r.data,
      titulo: `Despesca ${r.destino.replace("_", " ")} — viveiro ${r.viveiro_codigo}`,
      por: r.criado_por, em: r.criado_em,
        detalhe: `${nf(r.quantidade_un, 0)} peixes · ${nf(r.peso_medio_g, 0)} g médio · ${nf(r.peso_total_kg)} kg · ${r.lote_codigo}`,
      campos: [
        { chave: "data", rotulo: "Data", tipo: "date" as const, valor: r.data },
        { chave: "un", rotulo: "Peixes", tipo: "number" as const, valor: String(r.quantidade_un) },
        { chave: "peso", rotulo: "Peso médio (g)", tipo: "number" as const, valor: String(r.peso_medio_g) },
      ],
      salvar: (v: Record<string, string>) => editarDespesca(r.id, {
        lote_id: r.lote_id, data: v.data, destino: r.destino, quantidade_un: Math.round(num(v.un)), peso_medio_g: num(v.peso),
      }).then(() => undefined),
      excluir: () => excluirDespesca(r.id),
    }))));

    add("repicagem", "Repicagem", () => painelRepicagem(de, ate).then((rs) => rs.map((r) => ({
      chave: `repicagem-${r.id}`, tipo: "repicagem" as const, id: r.id, data: r.data,
      titulo: `Repicagem ${r.viveiro_origem_codigo} → ${r.viveiro_destino_codigo}`,
      por: r.criado_por, em: r.criado_em,
        detalhe: `${nf(r.quantidade, 0)} peixes · ${nf(r.peso_medio_g, 0)} g · ${r.lote_origem_codigo} → ${r.lote_destino_codigo}`,
      campos: [
        { chave: "data", rotulo: "Data", tipo: "date" as const, valor: r.data },
        { chave: "qtd", rotulo: "Peixes", tipo: "number" as const, valor: String(r.quantidade) },
        { chave: "peso", rotulo: "Peso médio (g)", tipo: "number" as const, valor: String(r.peso_medio_g) },
      ],
      salvar: (v: Record<string, string>) => editarRepicagem(r.id, { data: v.data, quantidade: Math.round(num(v.qtd)), peso_medio_g: num(v.peso) }).then(() => undefined),
      excluir: () => excluirRepicagem(r.id),
    }))));

    add("arracoamento", "Arraçoamento", () => painelArracoamento(de, ate).then((rs) => rs.map((r) => ({
      chave: `arracoamento-${r.id}`, tipo: "arracoamento" as const, id: r.id, data: r.data,
      titulo: `Arraçoamento — viveiro ${r.viveiro_codigo}${r.trato ? ` (${r.trato})` : ""}`,
      por: r.criado_por, em: r.criado_em,
        detalhe: `${nf(r.sacos)} sacos${r.tipo_racao_codigo ? ` · ${r.tipo_racao_codigo}` : " · sem tipo de ração"} · ${r.lote_codigo}`,
      campos: [
        { chave: "data", rotulo: "Data", tipo: "date" as const, valor: r.data },
        { chave: "sacos", rotulo: "Sacos", tipo: "number" as const, valor: String(r.sacos) },
      ],
      salvar: (v: Record<string, string>) => editarArracoamento(r.id, { data: v.data, sacos: num(v.sacos), tipo_racao_id: r.tipo_racao_id }),
      excluir: () => excluirArracoamento(r.id),
    }))));

    add("biometria", "Biometria", () => painelBiometria(de, ate).then((rs) => rs.map((r) => ({
      chave: `biometria-${r.id}`, tipo: "biometria" as const, id: r.id, data: r.data,
      titulo: `Biometria — viveiro ${r.viveiro_codigo}`, por: r.criado_por, em: r.criado_em,
        detalhe: `${nf(r.peso_medio_g, 0)} g · ${r.lote_codigo}`,
      campos: [
        { chave: "data", rotulo: "Data", tipo: "date" as const, valor: r.data },
        { chave: "peso", rotulo: "Peso médio (g)", tipo: "number" as const, valor: String(r.peso_medio_g) },
      ],
      salvar: (v: Record<string, string>) => editarBiometria(r.id, { data: v.data, peso_medio_g: num(v.peso) }),
      excluir: () => excluirBiometria(r.id),
    }))));

    add("despesa", "Despesas", () => listarDespesasSoltas(de, ate).then((rs) => rs.filter((d) => !d.excluido_em).map((d) => ({
      chave: `despesa-${d.id}`, tipo: "despesa" as const, id: d.id, data: d.data,
      titulo: `Despesa — ${d.categoria}`, por: d.criado_por, em: d.criado_em,
        detalhe: `${moeda(d.valor)} · ${d.forma_pgto}${d.observacao ? ` · ${d.observacao}` : ""}`,
      link: "/painel/despesas",
    }))));

    add("chegada_racao", "Chegadas de ração", () => listarChegadasRacao(de, ate).then((rs) => rs.filter((c) => !c.excluido_em).map((c) => ({
      chave: `chegada-${c.id}`, tipo: "chegada_racao" as const, id: c.id, data: c.data,
      titulo: `Chegada de ração — ${c.fornecedor_nome}`,
      por: c.criado_por, em: c.criado_em,
        detalhe: c.itens.map((i) => `${nf(i.quantidade_sacos, 0)} sacos ${i.tipo_racao_codigo}`).join(" · "),
      link: "/painel/estoque-racao",
    }))));

    add("ajuste_estoque", "Ajustes de estoque", () => listarAjustesEstoque(de, ate).then((rs) => rs.filter((a) => !a.excluido_em).map((a) => ({
      chave: `ajuste-${a.id}`, tipo: "ajuste_estoque" as const, id: a.id, data: a.data,
      titulo: `Ajuste de estoque — ${a.produto_nome}`,
      por: a.criado_por, em: a.criado_em,
        detalhe: `${a.quantidade_embalagens !== null ? `${nf(a.quantidade_embalagens, 0)} un` : ""}${a.quantidade_kg !== null ? ` · ${nf(a.quantidade_kg)} kg` : ""}${a.observacao ? ` · ${a.observacao}` : ""}`,
      link: "/painel/estoque",
    }))));

    add("agua", "Água", () => historicoLancamentos<{
      id: number; data: string; viveiro_codigo: string; oxigenio: number | null; temperatura_c: number | null;
      amonia: number | null; ph: number | null; nitrito: number | null; nitrato: number | null; criado_em: string; criado_por: string | null;
    }>("agua", de, ate).then((rs) => rs.map((r) => ({
      chave: `agua-${r.id}`, tipo: "agua" as const, id: r.id, data: r.data, por: r.criado_por, em: r.criado_em,
      titulo: `Análise de água — viveiro ${r.viveiro_codigo}`,
      detalhe: [
        r.oxigenio !== null ? `O₂ ${nf(r.oxigenio)}` : null, r.temperatura_c !== null ? `${nf(r.temperatura_c)} °C` : null,
        r.ph !== null ? `pH ${nf(r.ph)}` : null, r.amonia !== null ? `amônia ${nf(r.amonia, 2)}` : null,
        r.nitrito !== null ? `nitrito ${nf(r.nitrito, 2)}` : null, r.nitrato !== null ? `nitrato ${nf(r.nitrato, 2)}` : null,
      ].filter(Boolean).join(" · "),
    }))));

    add("povoamento", "Povoamento", () => historicoLancamentos<{
      id: number; codigo: string; viveiro_codigo: string; data: string; quantidade_inicial: number;
      peso_medio_inicial_g: number; observacao: string | null; criado_em: string | null; criado_por: string | null;
    }>("povoamento", de, ate).then((rs) => rs.map((r) => ({
      chave: `povoamento-${r.id}`, tipo: "povoamento" as const, id: r.id, data: r.data, por: r.criado_por, em: r.criado_em,
      titulo: `Povoamento — viveiro ${r.viveiro_codigo} (${r.codigo})`,
      detalhe: `${nf(r.quantidade_inicial, 0)} peixes · ${nf(r.peso_medio_inicial_g)} g`,
      campos: [
        { chave: "data", rotulo: "Data", tipo: "date" as const, valor: r.data },
        { chave: "qtd", rotulo: "Peixes", tipo: "number" as const, valor: String(r.quantidade_inicial) },
        { chave: "peso", rotulo: "Peso médio (g)", tipo: "number" as const, valor: String(r.peso_medio_inicial_g) },
      ],
      salvar: (v: Record<string, string>) => editarPovoamento(r.id, v.data, Math.round(num(v.qtd)), num(v.peso), r.observacao),
    }))));

    add("expedicao", "Expedição", () => historicoLancamentos<{
      id: number; vendedor_nome: string; data: string; data_acerto: string | null; itens: string; observacao: string | null;
      criado_em: string; criado_por: string | null;
    }>("expedicao", de, ate).then((rs) => rs.map((r) => ({
      chave: `expedicao-${r.id}`, tipo: "expedicao" as const, id: r.id, data: r.data, por: r.criado_por, em: r.criado_em,
      titulo: `Expedição — ${r.vendedor_nome}`,
      detalhe: `${r.itens || "sem itens"}${r.data_acerto ? ` · acertada em ${dataBr(r.data_acerto)}` : " · em aberto"}`,
      link: "/lancar/expedicao",
    }))));

    add("acerto", "Acerto", () => historicoLancamentos<{
      id: number; vendedor_nome: string; data: string; data_saida: string; vendas: number; valor_vendas: number;
      criado_por: string | null; criado_em: string | null;
    }>("acerto", de, ate).then((rs) => rs.map((r) => ({
      chave: `acerto-${r.id}`, tipo: "acerto" as const, id: r.id, data: r.data, por: r.criado_por, em: r.criado_em,
      titulo: `Acerto — ${r.vendedor_nome} (saída ${dataBr(r.data_saida)})`,
      detalhe: `${r.vendas} ${r.vendas === 1 ? "venda" : "vendas"} · ${moeda(r.valor_vendas)}`,
      link: "/painel/acertos",
    }))));

    const resultados = await Promise.allSettled(grupos);
    const todos: Lancamento[] = [];
    const erros: string[] = [];
    resultados.forEach((r, i) => {
      if (r.status === "fulfilled") todos.push(...r.value);
      else erros.push(nomes[i]);
    });
    todos.sort((a, b) => (a.data === b.data ? b.id - a.id : a.data < b.data ? 1 : -1));
    setFalhas(erros);
    setItens(todos);
  }, [de, ate, produtos, tipos]);

  useEffect(() => {
    if (!aberto || produtos.length === 0) return;
    carregar();
  }, [carregar, produtos.length, aberto]);

  const visiveis = useMemo(() => (itens ?? []).filter((l) => filtro === "todos" || l.tipo === filtro), [itens, filtro]);
  const contagem = useMemo(() => {
    const c: Partial<Record<Tipo, number>> = {};
    for (const l of itens ?? []) c[l.tipo] = (c[l.tipo] ?? 0) + 1;
    return c;
  }, [itens]);

  function abrirEdicao(l: Lancamento) {
    setEditando(l.chave);
    setValores(Object.fromEntries((l.campos ?? []).map((c) => [c.chave, c.valor])));
    setMsg(null);
  }

  async function salvar(l: Lancamento) {
    if (!l.salvar) return;
    setSalvando(true);
    try {
      await l.salvar(valores);
      setEditando(null);
      setMsg("Lançamento corrigido");
      await carregar();
    } catch (e) {
      const t = e instanceof Error ? e.message : "";
      setMsg(t.includes("422") ? "Não foi possível salvar — confira os valores." : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
      setTimeout(() => setMsg(null), 3500);
    }
  }

  async function excluir(l: Lancamento) {
    if (!l.excluir || !window.confirm(`Excluir este lançamento?\n${ROTULOS[l.tipo]} de ${dataBr(l.data)} — ${l.titulo}\n\nPode ser restaurado depois na tela do próprio tipo.`)) return;
    try {
      await l.excluir();
      setMsg("Lançamento excluído");
      await carregar();
    } catch {
      setMsg("Não foi possível excluir.");
    }
    setTimeout(() => setMsg(null), 3500);
  }

  return (
    <section style={{ marginTop: 28, paddingTop: 16, borderTop: "2px solid var(--rule)" }}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        style={{ background: "none", border: "none", padding: 0, fontWeight: 800, fontSize: "1rem", cursor: "pointer", color: "var(--ink)" }}
      >
        {aberto ? "▾" : "▸"} {titulo}
      </button>
      {aberto && (
      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <div className={styles.field} style={{ margin: 0 }}>
            <label>De</label>
            <input className={styles.inp} type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className={styles.field} style={{ margin: 0 }}>
            <label>Até</label>
            <input className={styles.inp} type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} />
          </div>
        </div>

        {tipos.length > 1 && (
        <div className={styles.chips} style={{ marginBottom: 14 }}>
          <button type="button" className={styles.chip} aria-pressed={filtro === "todos"} onClick={() => setFiltro("todos")}>
            Todos ({itens?.length ?? "…"})
          </button>
          {(Object.keys(ROTULOS) as Tipo[]).filter((t) => (contagem[t] ?? 0) > 0).map((t) => (
            <button key={t} type="button" className={styles.chip} aria-pressed={filtro === t} onClick={() => setFiltro(t)}>
              {ROTULOS[t]} ({contagem[t]})
            </button>
          ))}
        </div>
        )}

        {msg && <div className={styles.toast} style={{ position: "static", marginBottom: 10 }}>{msg}</div>}
        {falhas.length > 0 && (
          <p style={{ color: "var(--warn)", fontSize: "0.82rem" }}>⚠ Não consegui carregar: {falhas.join(", ")}. O resto está na lista.</p>
        )}
        {itens === null && <p>Carregando…</p>}
        {itens !== null && visiveis.length === 0 && <p>Nenhum lançamento no período.</p>}

        {visiveis.map((l) => (
          <div key={l.chave} style={{ border: "1px solid var(--rule)", borderRadius: 11, padding: "10px 12px", marginBottom: 8, background: "var(--surface)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "0.72rem", color: "var(--ink-muted)", fontWeight: 700 }}>
                  {dataBr(l.data)} · {ROTULOS[l.tipo]}
                </div>
                <div style={{ fontWeight: 700 }}>{l.titulo}</div>
                <div style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>{l.detalhe}</div>
                <div style={{ fontSize: "0.74rem", color: "var(--ink-muted)", marginTop: 2 }}>
                  {l.por ? `Lançado por ${l.por}${l.em ? ` · ${quando(l.em)}` : ""}` : "Quem lançou: não registrado"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                {l.campos && l.salvar && (
                  <button type="button" onClick={() => (editando === l.chave ? setEditando(null) : abrirEdicao(l))}
                    style={{ background: "none", border: "none", color: "var(--brand-deep)", fontWeight: 700, cursor: "pointer" }}>
                    {editando === l.chave ? "Fechar" : "Editar"}
                  </button>
                )}
                {l.link && (
                  <Link href={l.link} style={{ color: "var(--brand-deep)", fontWeight: 700, textDecoration: "none" }}>Editar ›</Link>
                )}
                {l.excluir && (
                  <button type="button" onClick={() => excluir(l)}
                    style={{ background: "none", border: "none", color: "var(--crit)", fontWeight: 700, cursor: "pointer" }}>
                    Excluir
                  </button>
                )}
              </div>
            </div>

            {editando === l.chave && l.campos && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--rule)" }}>
                {l.campos.map((c) => (
                  <div key={c.chave} className={styles.field} style={{ margin: 0 }}>
                    <label>{c.rotulo}</label>
                    {c.tipo === "select" ? (
                      <select className={styles.inp} value={valores[c.chave] ?? ""} onChange={(e) => setValores((v) => ({ ...v, [c.chave]: e.target.value }))}>
                        {c.opcoes!.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                      </select>
                    ) : (
                      <input
                        className={styles.inp} type={c.tipo === "date" ? "date" : "number"} inputMode={c.tipo === "number" ? "decimal" : undefined}
                        max={c.tipo === "date" ? dataLocalISO(new Date()) : undefined}
                        value={valores[c.chave] ?? ""} onChange={(e) => setValores((v) => ({ ...v, [c.chave]: e.target.value }))}
                      />
                    )}
                  </div>
                ))}
                <button type="button" className={styles.btnPrimary} disabled={salvando} onClick={() => salvar(l)} style={{ padding: "9px 16px" }}>
                  {salvando ? "Salvando…" : "Salvar correção"}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      )}
    </section>
  );
}
