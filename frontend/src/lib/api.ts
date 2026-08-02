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
export const listarClientes = () => cachedGet<Cliente[]>("cache:clientes", "/clientes");
export const listarVendedoresDeVenda = () => cachedGet<string[]>("cache:vendas-vendedores", "/vendas/vendedores");

export async function encerrarLote(loteId: number, data: string): Promise<void> {
  const r = await fetch(`${apiBase()}/lotes/${loteId}/encerrar`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ data }),
  });
  if (r.status === 401) sessaoInvalida();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
}
