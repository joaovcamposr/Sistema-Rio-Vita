/**
 * Leituras da API, com cache local (localStorage) para que os seletores dos
 * formulários (viveiro, produto, despesca de origem) continuem funcionando
 * quando o operador está sem sinal — só a gravação depende da fila offline
 * em offline-queue.ts.
 */
import { authHeader, sessaoInvalida } from "./auth";

export interface LoteAtual {
  id: number;
  codigo: string;
  fase: string;
  saldo_un: number;
}

export interface Viveiro {
  id: number;
  codigo: string;
  tipo: "pre_engorda" | "engorda" | "decantacao";
  area_m2: number;
  lote_atual: LoteAtual | null;
}

export interface ViveiroAtivo {
  id: number;
  codigo: string;
  tipo: "pre_engorda" | "engorda" | "decantacao";
  ativo: boolean;
}

export interface Produto {
  id: number;
  nome: string;
  unidade_embalagem: string | null;
  fator_kg: number | null;
  kg_digitado: boolean;
}

export interface Despesca {
  id: number;
  client_id: string;
  lote_id: number;
  data: string;
  destino: "file" | "postas" | "inteira_limpa" | "inteira_suja";
  quantidade_un: number;
  peso_medio_g: number;
  peso_total_kg: number;
  criado_em: string;
}

export interface DespescaResumo {
  peso_despescado_kg: number;
  kg_file_lancado: number;
}

export interface Cliente {
  id: number;
  nome: string;
  cidade: string | null;
  prazo_dias: number | null;
  emite_nf: boolean;
  emite_boleto: boolean;
}

export interface VendaLista {
  id: number;
  data: string;
  cliente_id: number | null;
  cliente_nome: string;
  cliente_prazo_dias: number | null;
  produto_nome: string;
  quantidade_kg: number;
  valor_total: number;
  forma_pgto: string | null;
  vendedor: string | null;
  situacao: string | null;
  data_pagamento: string | null;
  observacoes: string | null;
}

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

async function cachedGet<T>(cacheKey: string, path: string): Promise<T> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(`${apiBase()}${path}`, { signal: ctrl.signal, cache: "no-store", headers: authHeader() });
    clearTimeout(t);
    if (r.status === 401) sessaoInvalida();
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = (await r.json()) as T;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(cacheKey, JSON.stringify({ data, quando: Date.now() }));
    }
    return data;
  } catch (erroDeRede) {
    if (typeof window !== "undefined") {
      const bruto = window.localStorage.getItem(cacheKey);
      if (bruto) {
        const { data } = JSON.parse(bruto) as { data: T; quando: number };
        return data;
      }
    }
    throw erroDeRede;
  }
}

export const listarViveiros = () => cachedGet<Viveiro[]>("cache:viveiros", "/viveiros");
export const listarViveirosTodos = () => cachedGet<ViveiroAtivo[]>("cache:viveiros-todos", "/viveiros/todos");

export async function atualizarViveiroAtivo(id: number, ativo: boolean): Promise<ViveiroAtivo> {
  const r = await fetch(`${apiBase()}/viveiros/${id}/ativo`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ ativo }),
  });
  if (r.status === 401) sessaoInvalida();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as ViveiroAtivo;
}
export const listarProdutos = () => cachedGet<Produto[]>("cache:produtos", "/produtos");
export const listarDespescasDoLote = (loteId: number) =>
  cachedGet<Despesca[]>(`cache:despescas:${loteId}`, `/despescas?lote_id=${loteId}`);
export const resumoDespesca = (despescaId: number) =>
  cachedGet<DespescaResumo>(`cache:resumo:${despescaId}`, `/despescas/${despescaId}/resumo`);

export async function editarDespesca(despescaId: number, body: {
  lote_id: number; data: string; destino: Despesca["destino"];
  quantidade_un: number; peso_medio_g: number;
}): Promise<Despesca> {
  const r = await fetch(`${apiBase()}/despescas/${despescaId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(body),
  });
  if (r.status === 401) sessaoInvalida();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as Despesca;
}
export const listarClientes = () => cachedGet<Cliente[]>("cache:clientes", "/clientes");
export const listarVendedoresDeVenda = () => cachedGet<string[]>("cache:vendas-vendedores", "/vendas/vendedores");

export interface LeituraArracoamentoLinha {
  tanque: string;
  valores: Record<string, number>;
}
export interface LeituraArracoamento {
  data_lida: string | null;
  tipo_racao_texto: string | null;
  linhas: LeituraArracoamentoLinha[];
}

export async function lerFotoArracoamento(foto: File): Promise<LeituraArracoamento> {
  const form = new FormData();
  form.append("foto", foto);
  const r = await fetch(`${apiBase()}/arracoamento/ler-foto`, { method: "POST", headers: authHeader(), body: form });
  if (r.status === 401) sessaoInvalida();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as LeituraArracoamento;
}

export interface LeituraProducaoItem {
  produto_nome: string;
  caixas_fechadas: number | null;
  pacotes_soltos: number | null;
  quantidade_un: number | null;
  peso_total_kg: number | null;
}
export interface LeituraProducao {
  data_lida: string | null;
  tanque_origem: string | null;
  data_despesca: string | null;
  itens: LeituraProducaoItem[];
}

export async function lerFotoProducao(foto: File): Promise<LeituraProducao> {
  const form = new FormData();
  form.append("foto", foto);
  const r = await fetch(`${apiBase()}/producao/ler-foto`, { method: "POST", headers: authHeader(), body: form });
  if (r.status === 401) sessaoInvalida();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as LeituraProducao;
}

export async function encerrarLote(loteId: number, data: string): Promise<void> {
  const r = await fetch(`${apiBase()}/lotes/${loteId}/encerrar`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ data }),
  });
  if (r.status === 401) sessaoInvalida();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
}

export interface FiltroVendas {
  de?: string;
  ate?: string;
  situacao?: string;
  clienteId?: number | null;
  vendedor?: string | null;
}

export async function listarVendas(filtro: FiltroVendas): Promise<VendaLista[]> {
  const params = new URLSearchParams();
  if (filtro.de) params.set("de", filtro.de);
  if (filtro.ate) params.set("ate", filtro.ate);
  if (filtro.situacao) params.set("situacao", filtro.situacao);
  if (filtro.clienteId) params.set("cliente_id", String(filtro.clienteId));
  if (filtro.vendedor) params.set("vendedor", filtro.vendedor);
  const r = await fetch(`${apiBase()}/vendas?${params}`, { cache: "no-store", headers: authHeader() });
  if (r.status === 401) sessaoInvalida();
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as VendaLista[];
}

export async function marcarPagamentoVenda(
  vendaId: number, situacao: string, dataPagamento: string | null, formaPgto?: string | null
): Promise<void> {
  const r = await fetch(`${apiBase()}/vendas/${vendaId}/pagamento`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ situacao, data_pagamento: dataPagamento, forma_pgto: formaPgto ?? null }),
  });
  if (r.status === 401) sessaoInvalida();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
}

export async function atualizarObservacoesVenda(vendaId: number, observacoes: string | null): Promise<void> {
  const r = await fetch(`${apiBase()}/vendas/${vendaId}/observacoes`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ observacoes }),
  });
  if (r.status === 401) sessaoInvalida();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
}
