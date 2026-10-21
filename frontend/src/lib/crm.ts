import { authHeader, sessaoInvalida } from "./auth";

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

async function chamar<T>(path: string, metodo: "GET" | "POST" | "PATCH" = "GET", corpo?: unknown): Promise<T> {
  const r = await fetch(`${apiBase()}${path}`, {
    method: metodo, cache: "no-store",
    headers: { ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}), ...authHeader() },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  if (r.status === 401) sessaoInvalida();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}

export type SituacaoRecompra = "em_dia" | "atencao" | "atrasado" | "inativo";

export interface ClienteRecompra {
  cliente_id: number;
  nome: string;
  cidade: string | null;
  telefone: string | null;
  vendedor: string | null;
  pedidos: number;
  ultima_compra: string;
  dias_sem_comprar: number;
  intervalo_medio_dias: number | null;
  limite_dias: number;
  dias_de_atraso: number;
  proxima_compra_prevista: string | null;
  historico_curto: boolean;
  situacao: SituacaoRecompra;
  ticket_medio: number;
  valor_90d: number;
  valor_12m: number;
  potencial_mensal: number | null;
  produtos_principais: string[];
  ultimo_contato: string | null;
  temperatura: string | null;
  proxima_acao: string | null;
  proxima_acao_data: string | null;
}

export interface ParametrosRecompra {
  modo: "relativo" | "fixo";
  fator: number;
  dias_fixos: number;
  pedidos_do_intervalo: number;
  min_pedidos: number;
  dias_padrao: number;
}

export interface Recompra {
  parametros: ParametrosRecompra;
  resumo: Record<SituacaoRecompra, number> & { potencial_mensal_em_risco: number };
  clientes: ClienteRecompra[];
}

export const buscarRecompra = (p: ParametrosRecompra) =>
  chamar<Recompra>(`/crm/recompra?${new URLSearchParams({
    modo: p.modo, fator: String(p.fator), dias_fixos: String(p.dias_fixos),
    pedidos_do_intervalo: String(p.pedidos_do_intervalo), min_pedidos: String(p.min_pedidos), dias_padrao: String(p.dias_padrao),
  })}`);

export interface Prospecto {
  id: number;
  nome: string;
  cidade: string | null;
  contato: string | null;
  ramo: string | null;
  origem: string | null;
  fase: string;
  temperatura: string | null;
  proxima_acao: string | null;
  proxima_acao_data: string | null;
  volume_estimado_kg_mes: number | null;
  fornecedor_atual: string | null;
  preco_concorrente: number | null;
  motivo: string | null;
  motivo_perda: string | null;
  vendedor_nome: string | null;
  ultimo_contato: string | null;
  contatos: number;
  dias_sem_contato: number | null;
  acao_atrasada: boolean;
}

export interface Prospeccao {
  etapas: string[];
  por_etapa: Record<string, number>;
  prospectos: Prospecto[];
  novos_clientes_90d: number;
  volume_estimado_kg_mes: number;
}

export const buscarProspeccao = () => chamar<Prospeccao>("/crm/prospeccao");

export interface NovoProspecto {
  nome: string;
  contato?: string | null;
  cidade?: string | null;
  ramo?: string | null;
  origem?: string | null;
  volume_estimado_kg_mes?: number | null;
  fornecedor_atual?: string | null;
  preco_concorrente?: number | null;
  temperatura?: string | null;
  motivo?: string | null;
  proxima_acao?: string | null;
  proxima_acao_data?: string | null;
}
export const criarProspecto = (corpo: NovoProspecto, forcar = false) =>
  chamar<{ id: number; nome: string }>(forcar ? "/crm/prospectos?forcar=true" : "/crm/prospectos", "POST", corpo);

export interface Contato {
  cliente_id: number;
  tipo: string;
  descricao: string;
  data?: string;
  fase?: string | null;
  temperatura?: string | null;
  proxima_acao?: string | null;
  proxima_acao_data?: string | null;
  limpar_proxima_acao?: boolean;
}
export const registrarContato = (c: Contato) => chamar<{ ok: boolean }>("/crm/contato", "POST", c);

export const atualizarFunil = (id: number, corpo: {
  fase?: string; temperatura?: string; proxima_acao?: string | null; proxima_acao_data?: string | null;
  motivo_perda?: string | null; converter_em_cliente?: boolean;
}) => chamar<{ ok: boolean }>(`/crm/clientes/${id}/funil`, "PATCH", corpo);

export interface ItemAgenda {
  cliente_id: number;
  nome: string;
  e_cliente: boolean;
  fase: string | null;
  temperatura: string | null;
  contato: string | null;
  proxima_acao: string | null;
  proxima_acao_data: string;
  vendedor_nome: string | null;
  atrasada: boolean;
}
export const buscarAgenda = () => chamar<ItemAgenda[]>("/crm/agenda");
