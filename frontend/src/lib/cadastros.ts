/**
 * Vendedores, clientes (cadastro completo) e expedições. As leituras usam
 * o mesmo cache local de api.ts (para os seletores funcionarem offline);
 * as escritas de cadastro (criar/editar cliente ou vendedor, definir
 * preço) exigem rede — são ações de configuração feitas na base, não
 * lançamentos de campo.
 */
import { authHeader, sessaoInvalida } from "./auth";

export interface Vendedor {
  id: number;
  nome: string;
  telefone: string | null;
}

export interface TipoRacao {
  id: number;
  fornecedor_id: number;
  codigo: string;
}

export interface FornecedorRacao {
  id: number;
  nome: string;
  tipos: TipoRacao[];
}

export interface ChegadaRacaoItem {
  tipo_racao_id: number;
  tipo_racao_codigo: string;
  quantidade_sacos: number;
}

export interface ChegadaRacao {
  id: number;
  data: string;
  fornecedor_id: number;
  fornecedor_nome: string;
  observacao: string | null;
  itens: ChegadaRacaoItem[];
  excluido_em: string | null;
  excluido_por: string | null;
}

export interface ClienteDetalhe {
  id: number;
  nome: string;
  cnpj: string | null;
  contato: string | null;
  cidade: string | null;
  prazo_dias: number | null;
  emite_nf: boolean;
  emite_boleto: boolean;
  vendedor_id: number | null;
  vendedor_nome: string | null;
  // ---- CRM ----
  nome_contato: string | null;
  endereco: string | null;
  ramo: string | null;
  priorizacao: number | null;
  e_cliente: boolean;
  fase: string | null;
  temperatura: string | null;
  motivo: string | null;
  proxima_acao: string | null;
  fornecedor_atual: string | null;
  preco_concorrente: number | null;
  preferencia_tamanho: string | null;
  fresco_congelado: string | null;
  observacoes: string | null;
}

export interface ClienteProdutoPreco {
  produto_id: number;
  produto_nome: string;
  preco: number;
}

export interface InteracaoCliente {
  id: number;
  cliente_id: number;
  data: string;
  tipo: string;
  descricao: string;
  vendedor_id: number | null;
  vendedor_nome: string | null;
  criado_em: string;
  criado_por: string | null;
  excluido_em: string | null;
  excluido_por: string | null;
}

export interface ExpedicaoItem {
  produto_id: number;
  produto_nome: string;
  quantidade_embalagens: number | null;
  quantidade_kg: number;
}

export interface Expedicao {
  id: number;
  vendedor_id: number;
  vendedor_nome: string;
  data_saida: string;
  data_acerto: string | null;
  observacao: string | null;
  itens: ExpedicaoItem[];
}

export interface ExpedicaoEdicao {
  id: number;
  editado_em: string;
  editado_por: string | null;
  antes: Expedicao;
  depois: Expedicao;
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

async function enviar<T>(path: string, metodo: "POST" | "PUT" | "PATCH", body: unknown): Promise<T> {
  const r = await fetch(`${apiBase()}${path}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(body),
  });
  if (r.status === 401) sessaoInvalida();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}

async function excluir(path: string): Promise<void> {
  const r = await fetch(`${apiBase()}${path}`, { method: "DELETE", headers: authHeader() });
  if (r.status === 401) sessaoInvalida();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
}

export const listarVendedores = () => cachedGet<Vendedor[]>("cache:vendedores", "/vendedores");
export const criarVendedor = (nome: string, telefone: string | null) =>
  enviar<Vendedor>("/vendedores", "POST", { nome, telefone });
export const excluirVendedor = (id: number) => excluir(`/vendedores/${id}`);

export const listarFornecedoresRacao = () =>
  cachedGet<FornecedorRacao[]>("cache:fornecedores-racao", "/fornecedores-racao");
export const criarFornecedorRacao = (nome: string) =>
  enviar<FornecedorRacao>("/fornecedores-racao", "POST", { nome });
export const excluirFornecedorRacao = (id: number) => excluir(`/fornecedores-racao/${id}`);
export const criarTipoRacao = (fornecedorId: number, codigo: string) =>
  enviar<TipoRacao>(`/fornecedores-racao/${fornecedorId}/tipos`, "POST", { codigo });
export const atualizarTipoRacao = (fornecedorId: number, tipoId: number, codigo: string) =>
  enviar<TipoRacao>(`/fornecedores-racao/${fornecedorId}/tipos/${tipoId}`, "PATCH", { codigo });
export const excluirTipoRacao = (fornecedorId: number, tipoId: number) =>
  excluir(`/fornecedores-racao/${fornecedorId}/tipos/${tipoId}`);

export const listarChegadasRacao = (de?: string, ate?: string, excluidos?: boolean) => {
  const qs = new URLSearchParams();
  if (de) qs.set("de", de);
  if (ate) qs.set("ate", ate);
  if (excluidos) qs.set("excluidos", "true");
  return cachedGet<ChegadaRacao[]>(
    `cache:chegadas-racao:${de ?? ""}:${ate ?? ""}:${excluidos ? "excluidos" : ""}`,
    `/chegadas-racao?${qs}`
  );
};
export const editarChegadaRacao = (id: number, body: {
  data: string; fornecedor_id: number; observacao: string | null;
  itens: { tipo_racao_id: number; quantidade_sacos: number }[];
}) => enviar<ChegadaRacao>(`/chegadas-racao/${id}`, "PATCH", body);
export const excluirChegadaRacao = (id: number) => excluir(`/chegadas-racao/${id}`);
export const restaurarChegadaRacao = (id: number) => enviar<ChegadaRacao>(`/chegadas-racao/${id}/restaurar`, "POST", undefined);

export const listarExpedicoesAbertas = () =>
  cachedGet<Expedicao[]>("cache:expedicoes:abertas", "/expedicoes/abertas");
export const obterExpedicao = (id: number) =>
  cachedGet<Expedicao>(`cache:expedicao:${id}`, `/expedicoes/${id}`);
export const editarExpedicao = (id: number, body: {
  vendedor_id: number; data_saida: string; observacao: string | null;
  itens: { produto_id: number; quantidade_embalagens: number | null; quantidade_kg: number | null }[];
}) => enviar<Expedicao>(`/expedicoes/${id}`, "PATCH", body);
export const listarEdicoesExpedicao = (id: number) =>
  cachedGet<ExpedicaoEdicao[]>(`cache:expedicao-edicoes:${id}`, `/expedicoes/${id}/edicoes`);
export const cancelarAcerto = (expedicaoId: number) =>
  enviar<Expedicao>(`/expedicoes/${expedicaoId}/acerto/cancelar`, "POST", undefined);

export interface Despesa {
  id: number;
  data: string;
  categoria: string;
  valor: number;
  forma_pgto: string;
  expedicao_id: number | null;
  observacao: string | null;
  criado_em: string;
  excluido_em: string | null;
  excluido_por: string | null;
}
export const listarDespesasExpedicao = (expedicaoId: number) =>
  cachedGet<Despesa[]>(`cache:despesas-expedicao:${expedicaoId}`, `/despesas?expedicao_id=${expedicaoId}`);
export const editarDespesa = (id: number, body: {
  data: string; categoria: string; valor: number; forma_pgto: string; observacao: string | null;
}) => enviar<Despesa>(`/despesas/${id}`, "PATCH", body);

export const listarDespesasSoltas = (de?: string, ate?: string, excluidos?: boolean) => {
  const qs = new URLSearchParams();
  if (de && ate) { qs.set("de", de); qs.set("ate", ate); }
  if (excluidos) qs.set("excluidos", "true");
  return cachedGet<Despesa[]>(
    `cache:despesas-soltas:${de ?? ""}:${ate ?? ""}:${excluidos ? "excluidos" : ""}`,
    `/despesas/soltas?${qs}`
  );
};
export const excluirDespesa = (id: number) => excluir(`/despesas/${id}`);
export const restaurarDespesa = (id: number) => enviar<Despesa>(`/despesas/${id}/restaurar`, "POST", undefined);

export interface RetornoDetalhe {
  id: number;
  expedicao_id: number;
  produto_id: number;
  produto_nome: string;
  quantidade_embalagens: number | null;
  quantidade_kg: number;
}
export const listarRetornosExpedicao = (expedicaoId: number) =>
  cachedGet<RetornoDetalhe[]>(`cache:retornos-expedicao:${expedicaoId}`, `/expedicoes/${expedicaoId}/retornos`);
export const editarRetorno = (id: number, body: { quantidade_embalagens: number | null; quantidade_kg: number | null }) =>
  enviar<RetornoDetalhe>(`/expedicoes/retornos/${id}`, "PATCH", body);

export const obterCliente = (id: number) =>
  cachedGet<ClienteDetalhe>(`cache:cliente:${id}`, `/clientes/${id}`);
export const criarCliente = (body: Omit<ClienteDetalhe, "id">) =>
  enviar<ClienteDetalhe>("/clientes", "POST", body);
export const atualizarCliente = (id: number, body: Omit<ClienteDetalhe, "id">) =>
  enviar<ClienteDetalhe>(`/clientes/${id}`, "PUT", body);
export const excluirCliente = (id: number) => excluir(`/clientes/${id}`);

export const listarPrecosCliente = (id: number) =>
  cachedGet<ClienteProdutoPreco[]>(`cache:precos:${id}`, `/clientes/${id}/precos`);
export const definirPrecoCliente = (clienteId: number, produtoId: number, preco: number) =>
  enviar<ClienteProdutoPreco[]>(`/clientes/${clienteId}/precos`, "PUT", { produto_id: produtoId, preco });

export const listarInteracoes = (clienteId: number, excluidos?: boolean) =>
  cachedGet<InteracaoCliente[]>(
    `cache:interacoes:${clienteId}:${excluidos ? "excluidos" : ""}`,
    `/clientes/${clienteId}/interacoes${excluidos ? "?excluidos=true" : ""}`
  );
export const criarInteracao = (body: {
  cliente_id: number; data: string; tipo: string; descricao: string; vendedor_id: number | null;
}) => enviar<InteracaoCliente>("/interacoes", "POST", body);
export const editarInteracao = (id: number, body: {
  data: string; tipo: string; descricao: string; vendedor_id: number | null;
}) => enviar<InteracaoCliente>(`/interacoes/${id}`, "PATCH", body);
export const excluirInteracao = (id: number) => excluir(`/interacoes/${id}`);
export const restaurarInteracao = (id: number) =>
  enviar<InteracaoCliente>(`/interacoes/${id}/restaurar`, "POST", undefined);
