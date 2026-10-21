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
  limite_automatico_dias: number;
  limite_manual: boolean;
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
  // crédito / cobrança
  em_aberto: number;
  vencido: number;
  maior_atraso_pagamento_dias: number | null;
  limite_credito: number | null;
  status_credito: string | null;
  endereco: string | null;
  // curva ABC (faturamento de 12 meses)
  curva: "A" | "B" | "C" | "-";
  participacao_12m: number;
  participacao_acumulada: number;
}

export interface ParametrosRecompra {
  modo: "relativo" | "fixo";
  fator: number;
  dias_fixos: number;
  pedidos_do_intervalo: number;
  min_pedidos: number;
  dias_padrao: number;
  abc_a: number;
  abc_b: number;
}

export interface ResumoCurva {
  clientes: number;
  valor_12m: number;
  participacao: number;
  em_risco: number;
  potencial_mensal_em_risco: number;
  vencido: number;
}

export interface Recompra {
  parametros: ParametrosRecompra;
  resumo: Record<SituacaoRecompra, number> & { potencial_mensal_em_risco: number };
  abc: Record<"A" | "B" | "C" | "-", ResumoCurva>;
  total_12m: number;
  clientes: ClienteRecompra[];
}

export const buscarRecompra = (p: ParametrosRecompra) =>
  chamar<Recompra>(`/crm/recompra?${new URLSearchParams({
    modo: p.modo, fator: String(p.fator), dias_fixos: String(p.dias_fixos),
    pedidos_do_intervalo: String(p.pedidos_do_intervalo), min_pedidos: String(p.min_pedidos), dias_padrao: String(p.dias_padrao),
    abc_a: String(p.abc_a), abc_b: String(p.abc_b),
  })}`);

export interface ClienteCobranca {
  cliente_id: number;
  nome: string;
  cidade: string | null;
  telefone: string | null;
  vendedor_nome: string | null;
  limite_credito: number | null;
  em_aberto: number;
  vencido: number;
  a_vencer: number;
  a_vencer_3d: number;
  disponivel: number | null;
  uso: number | null;
  status: "sem_limite" | "ok" | "atencao" | "estourado";
  maior_atraso_dias: number | null;
  proximo_vencimento: string | null;
  vendas_abertas: number;
  ultima_compra: string | null;
  ultima_cobranca: string | null;
  proxima_acao: string | null;
  proxima_acao_data: string | null;
  situacao_recompra: SituacaoRecompra | null;
  dias_sem_comprar: number | null;
  curva: "A" | "B" | "C" | "-";
  potencial_mensal: number | null;
}
export interface Cobranca {
  resumo: {
    vencido: number; clientes_vencidos: number; a_vencer_3d: number;
    faixas: Record<"1-30" | "31-60" | "61-90" | "90+", number>; vencido_de_clientes_curva_a: number;
  };
  clientes: ClienteCobranca[];
}
export const buscarCobranca = () => chamar<Cobranca>("/crm/cobranca");

export interface ParcelaAberta {
  venda_id: number; data_venda: string; produto: string; valor: number; forma_pgto: string; data_prevista: string; dias_de_atraso: number;
}
export const buscarParcelasAbertas = (clienteId: number) => chamar<ParcelaAberta[]>(`/crm/cobranca/${clienteId}/parcelas`);

export interface ParadaRota {
  cliente_id: number; tipo: "cliente" | "prospecto"; nome: string; cidade: string | null; endereco: string | null;
  telefone: string | null; vendedor: string | null; motivos: string[]; potencial_mensal: number; vencido: number;
  volume_estimado_kg_mes: number | null; curva: string;
}
export interface Rota {
  cidades: { cidade: string; paradas: ParadaRota[]; potencial_mensal: number; vencido: number; prospectos: number }[];
  vendedores: string[];
  total_paradas: number;
}
export const buscarRota = (vendedor?: string) => chamar<Rota>(`/crm/rota${vendedor ? `?vendedor=${encodeURIComponent(vendedor)}` : ""}`);

/** Ajusta o limite (dias sem comprar) só desse cliente. `null` volta ao cálculo automático. */
export const definirLimiteRecompra = (id: number, dias: number | null) =>
  chamar<{ ok: boolean }>(`/crm/clientes/${id}/limite-recompra`, "PATCH", { dias });

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
