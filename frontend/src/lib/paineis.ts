/**
 * Leituras dos painéis gerenciais — todas somente-leitura, derivadas dos
 * mesmos dados que os módulos operacionais gravam. Usa o mesmo cache local
 * de api.ts para continuar funcionando (com o último dado visto) sem rede.
 */
import { authHeader, sessaoInvalida } from "./auth";

export interface LoteAtual {
  id: number;
  codigo: string;
  fase: string;
  saldo_un: number;
}

export interface UltimaBiometria {
  data: string;
  peso_medio_g: number;
  dias_atras: number;
}

export interface UltimaAgua {
  data: string;
  oxigenio: number | null;
  temperatura_c: number | null;
  amonia: number | null;
  ph: number | null;
  nitrito: number | null;
  nitrato: number | null;
}

export interface PainelViveiro {
  id: number;
  codigo: string;
  tipo: "pre_engorda" | "engorda" | "decantacao";
  area_m2: number;
  lote_atual: LoteAtual | null;
  data_inicio_lote: string | null;
  idade_dias: number | null;
  idade_semanas: number | null;
  peso_estimado_hoje_g: number | null;
  peso_esperado_pela_idade_g: number | null;
  cor_crescimento: "vermelho" | "amarelo" | "verde" | null;
  densidade_kg_m2: number | null;
  conversao_alimentar: number | null;
  racao_acumulada_kg: number | null;
  ultima_biometria: UltimaBiometria | null;
  ultima_agua: UltimaAgua | null;
}

export interface Abate {
  lote_id: number;
  lote_codigo: string;
  fase: string;
  viveiro_codigo: string;
  quantidade_un: number;
  peso_medio_g: number;
  data_biometria: string;
  semana_atual: number;
  semana_limite: number;
  previsao_abate: string | null;
  pronto: boolean;
}

export interface ProducaoPorProduto {
  produto_id: number;
  produto_nome: string;
  quantidade_kg: number;
}

export interface ProducaoResumo {
  de: string;
  ate: string;
  por_produto: ProducaoPorProduto[];
  produzido_file_kg: number;
  produzido_postas_kg: number;
  produzido_tilapia_limpa_kg: number;
  peso_medio_suja_ponderado_g: number | null;
  rendimento_medio_ponderado_file: number | null;
  rendimento_medio_ponderado_postas: number | null;
  rendimento_medio_ponderado_tilapia_limpa: number | null;
}

export interface ProducaoDetalheLinha {
  data: string;
  produto_nome: string;
  quantidade_kg: number;
  lote_codigo: string | null;
  viveiro_codigo: string | null;
  data_despesca: string | null;
  peso_medio_suja_g: number | null;
  rendimento: number | null;
}

export interface EstoqueItem {
  id: number;
  nome: string;
  fator_kg: number | null;
  produzido_un: number | null;
  vendido_un: number | null;
  em_transito_un: number | null;
  ajustado_un: number | null;
  saldo_un: number | null;
  produzido_kg: number;
  vendido_kg: number;
  em_transito_kg: number;
  ajustado_kg: number;
  saldo_kg: number;
}

export type TipoAjusteEstoque = "amostra" | "descarte" | "diferenca_estoque";

export interface AjusteEstoque {
  id: number;
  client_id: string;
  data: string;
  produto_id: number;
  produto_nome: string;
  quantidade_embalagens: number | null;
  quantidade_kg: number;
  tipo: TipoAjusteEstoque;
  observacao: string | null;
  criado_em: string;
}

export interface MortalidadeLote {
  lote_id: number;
  lote_codigo: string;
  fase: string;
  viveiro_codigo: string;
  data_inicio: string;
  data_fim: string;
  dias: number;
  quantidade_inicial: number;
  quantidade_perdida: number;
  taxa: number;
}

export interface MortalidadeResumo {
  taxa_media_pre_engorda: number | null;
  taxa_media_engorda: number | null;
  lotes: MortalidadeLote[];
}

export interface VendaPorProduto {
  produto_id: number;
  produto_nome: string;
  quantidade_kg: number;
  valor_total: number;
}

export interface VendaClienteProduto {
  produto_id: number;
  produto_nome: string;
  quantidade_kg: number;
  valor_total: number;
  preco_medio_ponderado: number;
}

export interface VendaPorCliente {
  cliente_id: number | null;
  cliente_nome: string;
  quantidade_kg: number;
  valor_total: number;
  preco_medio_ponderado_file: number | null;
  por_produto: VendaClienteProduto[];
}

export interface ComercialResumo {
  de: string;
  ate: string;
  quantidade_kg_total: number;
  valor_total: number;
  por_produto: VendaPorProduto[];
  por_cliente: VendaPorCliente[];
  file_kg_total: number;
  file_preco_medio_ponderado: number | null;
}

export interface AguaPonto {
  data: string;
  oxigenio: number | null;
  temperatura_c: number | null;
  amonia: number | null;
  ph: number | null;
  nitrito: number | null;
  nitrato: number | null;
}

export interface AguaViveiro {
  viveiro_id: number;
  viveiro_codigo: string;
  serie: AguaPonto[];
}

export interface CaixaDia {
  dia: string;
  vendas_dinheiro: number;
  despesas_dinheiro: number;
  saldo: number;
}

export interface ExpedicaoAberta {
  id: number;
  vendedor_nome: string;
  data_saida: string;
  dias_em_aberto: number;
}

export interface CaixaResumo {
  de: string;
  ate: string;
  total_vendas_dinheiro: number;
  total_despesas_dinheiro: number;
  saldo: number;
  dias: CaixaDia[];
  expedicoes_abertas: ExpedicaoAberta[];
}

export interface EstoqueRacaoTipo {
  tipo_racao_id: number;
  tipo_racao_codigo: string;
  fornecedor_nome: string;
  chegou_sacos: number;
  consumido_sacos: number;
  saldo_sacos: number;
  consumo_sacos_dia: number | null;
  dias_restantes: number | null;
  sacos_sugeridos_proxima_carga: number | null;
}

export interface EstoqueRacao {
  saldo_total_sacos: number;
  por_tipo: EstoqueRacaoTipo[];
  consumo_total_sacos_dia: number;
  dias_restantes_total: number | null;
  data_prevista_proxima_carga: string | null;
  sacos_sem_tipo_informado_ultimos_30_dias: number;
}

export type Granularidade = "dia" | "mes" | "ano";

export interface SerieBucketProduto {
  produto_id: number;
  produto_nome: string;
  quantidade_kg: number;
  valor_total: number;
  preco_medio_ponderado: number | null;
}

export interface ComercialSerieBucket {
  bucket: string;
  por_produto: SerieBucketProduto[];
}

export interface ComercialSerie {
  de: string;
  ate: string;
  granularidade: Granularidade;
  buckets: ComercialSerieBucket[];
}

export interface ProducaoSerieBucketProduto {
  produto_id: number;
  produto_nome: string;
  quantidade_kg: number;
}

export interface ProducaoSerieBucket {
  bucket: string;
  por_produto: ProducaoSerieBucketProduto[];
  rendimento_medio_ponderado: number | null;
  peso_medio_suja_ponderado_g: number | null;
}

export interface ProducaoSerie {
  de: string;
  ate: string;
  granularidade: Granularidade;
  buckets: ProducaoSerieBucket[];
}

export interface Parametro {
  chave: string;
  valor: number;
  descricao: string | null;
}

export interface ViveiroAlerta {
  viveiro_codigo: string;
  lote_codigo: string;
  densidade_kg_m2: number;
  limite_kg_m2: number;
  situacao: "acima" | "proximo";
}

export interface ProducaoDia {
  data: string;
  quantidade_kg: number;
}

export interface SerieDiaria {
  data: string;
  valor: number;
}

export interface Dashboard {
  de: string;
  ate: string;
  producao_total_kg: number;
  dias_trabalhados: number;
  producao_por_dia_kg: number | null;
  vendas_kg: number;
  vendas_valor: number;
  serie_producao_diaria: ProducaoDia[];
  serie_vendas_kg_diaria: SerieDiaria[];
  serie_vendas_valor_diaria: SerieDiaria[];
  serie_rendimento_diario: SerieDiaria[];
  serie_mortalidade_diaria: SerieDiaria[];
  viveiros_alerta: ViveiroAlerta[];
  biomassa_total_kg: number;
  conversao_media_ponderada: number | null;
  mortalidade_media_ponderada: number | null;
  rendimento_medio_ponderado: number | null;
}

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

async function cachedGet<T>(cacheKey: string, path: string): Promise<T> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
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

export const painelViveiros = () => cachedGet<PainelViveiro[]>("cache:painel:viveiros", "/paineis/viveiros");
export const painelAbate = () => cachedGet<Abate[]>("cache:painel:abate", "/paineis/abate");
export const painelEstoque = (de?: string, ate?: string) => {
  const qs = de && ate ? `?de=${de}&ate=${ate}` : "";
  return cachedGet<EstoqueItem[]>(`cache:painel:estoque:${de ?? ""}:${ate ?? ""}`, `/paineis/estoque${qs}`);
};

export const listarAjustesEstoque = (de?: string, ate?: string) => {
  const qs = de && ate ? `?de=${de}&ate=${ate}` : "";
  return cachedGet<AjusteEstoque[]>(`cache:ajustes-estoque:${de ?? ""}:${ate ?? ""}`, `/ajustes-estoque${qs}`);
};

export async function criarAjusteEstoque(body: {
  client_id: string; data: string; produto_id: number;
  quantidade_embalagens: number | null; quantidade_kg: number | null;
  tipo: TipoAjusteEstoque; observacao: string | null;
}): Promise<AjusteEstoque> {
  const r = await fetch(`${apiBase()}/ajustes-estoque`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(body),
  });
  if (r.status === 401) sessaoInvalida();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as AjusteEstoque;
}
export const painelMortalidade = () =>
  cachedGet<MortalidadeResumo>("cache:painel:mortalidade", "/paineis/mortalidade");
export const painelAgua = () => cachedGet<AguaViveiro[]>("cache:painel:agua", "/paineis/agua?dias=60");

export const painelProducao = (de?: string, ate?: string) => {
  const qs = de && ate ? `?de=${de}&ate=${ate}` : "";
  return cachedGet<ProducaoResumo>(`cache:painel:producao:${de ?? ""}:${ate ?? ""}`, `/paineis/producao${qs}`);
};

export const painelProducaoDetalhe = (de?: string, ate?: string) => {
  const qs = de && ate ? `?de=${de}&ate=${ate}` : "";
  return cachedGet<ProducaoDetalheLinha[]>(
    `cache:painel:producao-detalhe:${de ?? ""}:${ate ?? ""}`, `/paineis/producao/detalhe${qs}`
  );
};

export const painelEstoqueRacao = () =>
  cachedGet<EstoqueRacao>("cache:painel:estoque-racao", "/paineis/estoque-racao");

export interface DespescaDetalhe {
  id: number;
  data: string;
  destino: "file" | "postas" | "inteira_limpa" | "inteira_suja";
  quantidade_un: number;
  peso_medio_g: number;
  peso_total_kg: number;
  lote_id: number;
  lote_codigo: string;
  viveiro_codigo: string;
  criado_em: string;
}

export const painelDespesca = (de?: string, ate?: string) => {
  const qs = de && ate ? `?de=${de}&ate=${ate}` : "";
  return cachedGet<DespescaDetalhe[]>(`cache:painel:despesca:${de ?? ""}:${ate ?? ""}`, `/paineis/despesca${qs}`);
};

export interface RepicagemDetalhe {
  lote_id: number;
  lote_origem_id: number;
  data: string;
  quantidade: number;
  peso_medio_g: number;
  lote_destino_codigo: string;
  viveiro_destino_codigo: string;
  lote_origem_codigo: string;
  viveiro_origem_codigo: string;
  lote_origem_fechado: boolean;
}

export const painelRepicagem = (de?: string, ate?: string) => {
  const qs = de && ate ? `?de=${de}&ate=${ate}` : "";
  return cachedGet<RepicagemDetalhe[]>(`cache:painel:repicagem:${de ?? ""}:${ate ?? ""}`, `/paineis/repicagem${qs}`);
};

export const painelComercial = (de?: string, ate?: string, vendedor?: string | null) => {
  const params = new URLSearchParams();
  if (de) params.set("de", de);
  if (ate) params.set("ate", ate);
  if (vendedor) params.set("vendedor", vendedor);
  const qs = params.toString() ? `?${params}` : "";
  return cachedGet<ComercialResumo>(`cache:painel:comercial:${params.toString()}`, `/paineis/comercial${qs}`);
};

export const painelCaixa = (de?: string, ate?: string) => {
  const qs = de && ate ? `?de=${de}&ate=${ate}` : "";
  return cachedGet<CaixaResumo>(`cache:painel:caixa:${de ?? ""}:${ate ?? ""}`, `/paineis/caixa${qs}`);
};

export const painelComercialSerie = (
  granularidade: Granularidade, de?: string, ate?: string, clienteId?: number | null, vendedor?: string | null
) => {
  const params = new URLSearchParams({ granularidade });
  if (de) params.set("de", de);
  if (ate) params.set("ate", ate);
  if (clienteId) params.set("cliente_id", String(clienteId));
  if (vendedor) params.set("vendedor", vendedor);
  return cachedGet<ComercialSerie>(`cache:painel:comercial-serie:${params.toString()}`, `/paineis/comercial/serie?${params}`);
};

export const painelProducaoSerie = (granularidade: Granularidade, de?: string, ate?: string) => {
  const params = new URLSearchParams({ granularidade });
  if (de) params.set("de", de);
  if (ate) params.set("ate", ate);
  return cachedGet<ProducaoSerie>(`cache:painel:producao-serie:${params.toString()}`, `/paineis/producao/serie?${params}`);
};

export const painelDashboard = (de?: string, ate?: string) => {
  const qs = de && ate ? `?de=${de}&ate=${ate}` : "";
  return cachedGet<Dashboard>(`cache:painel:dashboard:${de ?? ""}:${ate ?? ""}`, `/paineis/dashboard${qs}`);
};

export const listarParametros = () => cachedGet<Parametro[]>("cache:parametros", "/parametros");

export async function atualizarParametro(chave: string, valor: number): Promise<Parametro> {
  const r = await fetch(`${apiBase()}/parametros/${chave}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ valor }),
  });
  if (r.status === 401) sessaoInvalida();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as Parametro;
}

// ---------- Tabelas informativas ----------

export interface TabelaArracoamentoLinha {
  semana: number;
  peso_inicial_g: number;
  peso_final_g: number;
  peso_ganho_g: number;
  consumo_diario_kg: number;
  consumo_semanal_kg: number;
  consumo_sacos: number;
  pct_proteina: number | null;
  tipo_racao: string | null;
  preco_saco: number | null;
  conversao: number | null;
  tratos_por_dia: number;
}

export interface TratoPrevisto {
  horario: string;
  sacos: number;
}

export interface ArracoamentoPrevistoDia {
  viveiro_codigo: string;
  lote_codigo: string;
  periodo_inicio: string;
  periodo_fim: string;
  semana: number;
  saldo_un: number;
  peso_estimado_g: number;
  tratos: TratoPrevisto[];
  sacos_total_dia: number;
}

export interface ItemRepicagem {
  viveiro_origem: string;
  lote_codigo: string;
  viveiro_destino: string;
  un_repicado: number;
}

export interface Mistura {
  viveiro_destino: string;
  origens: string[];
}

export interface NivelRepicagem {
  aplicavel: boolean;
  resumo: string;
  itens: ItemRepicagem[];
  misturas: Mistura[];
  restante_un: Record<string, number>;
}

export interface DespescaPrevia {
  viveiro_codigo: string;
  lote_codigo: string;
  peso_estimado_g: number;
  saldo_un: number;
  capacidade_liberada_un: number;
}

export interface NivelDespesca {
  aplicavel: boolean;
  resumo: string;
  despescar: DespescaPrevia[];
  repicagem: NivelRepicagem;
}

export interface SugestaoRepicagemGeral {
  tanques_acima_do_limite: string[];
  nivel_1: NivelRepicagem;
  nivel_2: NivelRepicagem;
  nivel_3: NivelDespesca;
}

export const tabelaArracoamentoBase = () =>
  cachedGet<TabelaArracoamentoLinha[]>("cache:tabela-arracoamento", "/paineis/tabela-arracoamento");

export const arracoamentoPrevisto = (de?: string, ate?: string) => {
  const qs = de && ate ? `?de=${de}&ate=${ate}` : "";
  return cachedGet<ArracoamentoPrevistoDia[]>(
    `cache:arracoamento-previsto:${de ?? ""}:${ate ?? ""}`, `/paineis/arracoamento-previsto${qs}`,
  );
};

export const sugestaoRepicagem = () =>
  cachedGet<SugestaoRepicagemGeral>("cache:sugestao-repicagem", "/paineis/sugestao-repicagem");

export interface EventoProjetado {
  viveiro_codigo: string;
  lote_codigo: string;
  semanas_a_partir_de_hoje: number;
  data_prevista: string;
  resolvido: boolean;
  resolvido_com: "repicagem" | "despesca" | "ativacao";
  detalhe: string;
  tanques_a_despescar: string[];
  tanques_a_ativar: string[];
}

export interface ProjecaoCapacidade {
  horizonte_semanas: number;
  eventos: EventoProjetado[];
  algum_precisa_ativar_tanque: boolean;
}

export const projecaoCapacidade = () =>
  cachedGet<ProjecaoCapacidade>("cache:projecao-capacidade", "/paineis/projecao-capacidade");

export interface PontoHistoricoLote {
  data: string;
  peso_real_g: number;
  peso_esperado_g: number;
  saldo_un: number;
  densidade_kg_m2: number | null;
  conversao_realizada_intervalo: number | null;
  conversao_esperada_intervalo: number | null;
}

export interface HistoricoLote {
  viveiro_codigo: string;
  lote_codigo: string;
  area_m2: number;
  data_inicio: string;
  pontos: PontoHistoricoLote[];
}

export const historicoLote = (viveiroId: number) =>
  cachedGet<HistoricoLote>(`cache:historico-lote:${viveiroId}`, `/paineis/viveiros/${viveiroId}/historico-lote`);
