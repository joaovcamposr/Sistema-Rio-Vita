"""
Contratos da API. Todo campo aqui tem correspondência direta com um campo
já existente na planilha — ver Etapa 2 (documentação funcional).
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

DestinoDespesca = Literal["file", "postas", "inteira_limpa", "inteira_suja"]
PapelUsuario = Literal["operador", "comercial", "gerente"]


# ---------- Autenticação ----------

class UsuarioLoginIn(BaseModel):
    email: str
    senha: str


class UsuarioLoginOut(BaseModel):
    token: str
    id: int
    nome: str
    email: str
    papel: PapelUsuario


class UsuarioOut(BaseModel):
    id: int
    nome: str
    email: str
    papel: PapelUsuario
    ativo: bool


class UsuarioIn(BaseModel):
    nome: str
    email: str
    senha: str = Field(min_length=6)
    papel: PapelUsuario = "operador"


class TrocarSenhaIn(BaseModel):
    senha_atual: str
    senha_nova: str = Field(min_length=6)


class LoteAtual(BaseModel):
    id: int
    codigo: str
    fase: str
    saldo_un: int
    data_inicio: date
    quantidade_inicial: int
    peso_medio_inicial_g: float


class ViveiroOut(BaseModel):
    id: int
    codigo: str
    tipo: str
    area_m2: float
    lote_atual: LoteAtual | None = None


class ViveiroAtivoOut(BaseModel):
    id: int
    codigo: str
    tipo: str
    ativo: bool


class ViveiroAtivoIn(BaseModel):
    ativo: bool


class ProdutoOut(BaseModel):
    id: int
    nome: str
    unidade_embalagem: str | None
    fator_kg: float | None
    kg_digitado: bool


class DespescaIn(BaseModel):
    # gerado no aparelho no momento do lançamento — garante que reenviar o
    # mesmo registro (retry após ficar offline) nunca duplique
    client_id: uuid.UUID
    lote_id: int
    data: date
    destino: DestinoDespesca
    quantidade_un: int = Field(gt=0)
    peso_medio_g: float = Field(gt=0)


class DespescaOut(BaseModel):
    id: int
    client_id: uuid.UUID
    lote_id: int
    data: date
    destino: DestinoDespesca
    quantidade_un: int
    peso_medio_g: float
    peso_total_kg: float
    criado_em: datetime


class DespescaResumoOut(BaseModel):
    """Alimenta o cálculo de rendimento ao vivo na tela de Produção
    (regra R2): o front soma o Kg que o operador está digitando a
    kg_file_lancado e divide por peso_despescado_kg."""
    peso_despescado_kg: float
    kg_file_lancado: float


class DespescaEditarIn(BaseModel):
    lote_id: int
    data: date
    destino: DestinoDespesca
    quantidade_un: int = Field(gt=0)
    peso_medio_g: float = Field(gt=0)


class DespescaDetalheOut(BaseModel):
    id: int
    data: date
    destino: DestinoDespesca
    quantidade_un: int
    peso_medio_g: float
    peso_total_kg: float
    lote_id: int
    lote_codigo: str
    viveiro_codigo: str
    criado_em: datetime
    excluido_em: datetime | None = None
    excluido_por: str | None = None


class ProducaoIn(BaseModel):
    client_id: uuid.UUID
    data: date
    produto_id: int
    quantidade_embalagens: float | None = Field(default=None, ge=0)
    quantidade_kg: float | None = Field(default=None, ge=0)
    lote_id: int | None = None
    data_despesca: date | None = None

    @model_validator(mode="after")
    def um_dos_dois_informado(self) -> "ProducaoIn":
        if self.quantidade_embalagens is None and self.quantidade_kg is None:
            raise ValueError("informe quantidade_embalagens ou quantidade_kg")
        return self


class ProducaoOut(BaseModel):
    id: int
    client_id: uuid.UUID
    data: date
    produto_id: int
    quantidade_embalagens: float | None
    quantidade_kg: float
    lote_id: int | None
    data_despesca: date | None
    criado_em: datetime


# ---------- Povoamento / Repicagem (lote) ----------

class LoteOut(BaseModel):
    id: int
    codigo: str
    fase: str
    viveiro_id: int
    data_inicio: date
    quantidade_inicial: int
    peso_medio_inicial_g: float
    data_fim: date | None
    observacao: str | None
    criado_em: datetime


class PovoamentoIn(BaseModel):
    client_id: uuid.UUID
    viveiro_id: int
    data: date
    quantidade_inicial: int = Field(gt=0)
    peso_medio_inicial_g: float = Field(gt=0)
    observacao: str | None = None


class PovoamentoEditarIn(BaseModel):
    data_inicio: date
    quantidade_inicial: int = Field(gt=0)
    peso_medio_inicial_g: float = Field(gt=0)
    observacao: str | None = None


class EncerrarLoteIn(BaseModel):
    data: date
    observacao: str | None = None


class RepicagemOrigemIn(BaseModel):
    viveiro_origem_id: int
    quantidade: int = Field(gt=0)


class RepicagemIn(BaseModel):
    client_id: uuid.UUID
    data: date
    viveiro_destino_id: int
    peso_medio_g: float = Field(gt=0)
    origens: list[RepicagemOrigemIn] = Field(min_length=1)


class RepicagemOut(BaseModel):
    lote: LoteOut
    lotes_origem_fechados: list[int]


class RepicagemEditarIn(BaseModel):
    data: date
    quantidade: int = Field(gt=0)
    peso_medio_g: float = Field(gt=0)


class RepicagemDetalheOut(BaseModel):
    lote_id: int
    lote_origem_id: int
    data: date
    quantidade: int
    peso_medio_g: float
    lote_destino_codigo: str
    viveiro_destino_codigo: str
    lote_origem_codigo: str
    viveiro_origem_codigo: str
    lote_origem_fechado: bool
    excluido_em: datetime | None = None
    excluido_por: str | None = None


# ---------- Biometria ----------

class BiometriaIn(BaseModel):
    client_id: uuid.UUID
    lote_id: int
    data: date
    peso_medio_g: float = Field(gt=0)


class BiometriaOut(BaseModel):
    id: int
    client_id: uuid.UUID
    lote_id: int
    data: date
    peso_medio_g: float
    criado_em: datetime


# ---------- Arraçoamento ----------

class ArracoamentoIn(BaseModel):
    client_id: uuid.UUID
    lote_id: int
    data: date
    trato: str | None = None  # "08:30", "10:30", ... — None = total do dia, sem dividir por horário
    sacos: float = Field(ge=0)
    tipo_racao_id: int | None = None


class ArracoamentoOut(BaseModel):
    id: int
    client_id: uuid.UUID
    lote_id: int
    data: date
    trato: str | None
    sacos: float
    tipo_racao_id: int | None
    criado_em: datetime


class ArracoamentoEditarIn(BaseModel):
    data: date
    sacos: float = Field(ge=0)
    tipo_racao_id: int | None = None


class ArracoamentoDetalheOut(BaseModel):
    id: int
    data: date
    trato: str | None
    sacos: float
    tipo_racao_id: int | None
    tipo_racao_codigo: str | None
    lote_id: int
    lote_codigo: str
    viveiro_codigo: str
    criado_em: datetime
    excluido_em: datetime | None = None
    excluido_por: str | None = None


class LeituraArracoamentoLinhaOut(BaseModel):
    tanque: str
    tipo_racao_texto: str | None
    valores: dict[str, float]  # horario ("08:30") -> sacos, só os que a ficha tinha preenchidos


class LeituraArracoamentoOut(BaseModel):
    data_lida: str | None
    linhas: list[LeituraArracoamentoLinhaOut]


class LeituraProducaoItemOut(BaseModel):
    produto_nome: str
    caixas_fechadas: float | None
    pacotes_soltos: float | None
    quantidade_un: float | None
    peso_total_kg: float | None


class LeituraProducaoOut(BaseModel):
    data_lida: str | None
    tanque_origem: str | None
    data_despesca: str | None
    itens: list[LeituraProducaoItemOut]


# ---------- Ração (fornecedor, tipo, chegada, estoque) ----------


class FornecedorRacaoOut(BaseModel):
    id: int
    nome: str


class FornecedorRacaoIn(BaseModel):
    nome: str


class TipoRacaoOut(BaseModel):
    id: int
    fornecedor_id: int
    codigo: str


class TipoRacaoIn(BaseModel):
    codigo: str


class FornecedorRacaoDetalheOut(BaseModel):
    id: int
    nome: str
    tipos: list[TipoRacaoOut]


class ChegadaRacaoItemIn(BaseModel):
    tipo_racao_id: int
    quantidade_sacos: float = Field(gt=0)


class ChegadaRacaoIn(BaseModel):
    client_id: uuid.UUID
    data: date
    fornecedor_id: int
    observacao: str | None = None
    itens: list[ChegadaRacaoItemIn] = Field(min_length=1)


class ChegadaRacaoItemOut(BaseModel):
    tipo_racao_id: int
    tipo_racao_codigo: str
    quantidade_sacos: float


class ChegadaRacaoOut(BaseModel):
    id: int
    data: date
    fornecedor_id: int
    fornecedor_nome: str
    observacao: str | None
    itens: list[ChegadaRacaoItemOut]


class EstoqueRacaoTipoOut(BaseModel):
    tipo_racao_id: int
    tipo_racao_codigo: str
    fornecedor_nome: str
    chegou_sacos: float
    consumido_sacos: float
    saldo_sacos: float
    consumo_sacos_dia: float | None
    dias_restantes: float | None
    sacos_sugeridos_proxima_carga: float | None


class EstoqueRacaoOut(BaseModel):
    saldo_total_sacos: float
    por_tipo: list[EstoqueRacaoTipoOut]
    consumo_total_sacos_dia: float
    dias_restantes_total: float | None
    data_prevista_proxima_carga: date | None
    sacos_sem_tipo_informado_ultimos_30_dias: float


# ---------- Análise da água ----------

class AnaliseAguaIn(BaseModel):
    client_id: uuid.UUID
    viveiro_id: int
    data: date
    oxigenio: float | None = None
    temperatura_c: float | None = None
    amonia: float | None = None
    ph: float | None = Field(default=None, ge=0, le=14)
    nitrito: float | None = None
    nitrato: float | None = None

    @model_validator(mode="after")
    def ao_menos_um(self) -> "AnaliseAguaIn":
        campos = [self.oxigenio, self.temperatura_c, self.amonia, self.ph, self.nitrito, self.nitrato]
        if all(c is None for c in campos):
            raise ValueError("informe ao menos um parâmetro medido")
        return self


class AnaliseAguaOut(BaseModel):
    id: int
    client_id: uuid.UUID
    viveiro_id: int
    data: date
    oxigenio: float | None
    temperatura_c: float | None
    amonia: float | None
    ph: float | None
    nitrito: float | None
    nitrato: float | None
    criado_em: datetime


# ---------- Comercial ----------

class ClienteOut(BaseModel):
    id: int
    nome: str
    cidade: str | None
    prazo_dias: int | None = None
    emite_nf: bool = False
    emite_boleto: bool = False


class VendaIn(BaseModel):
    client_id: uuid.UUID
    data: date
    cliente_id: int | None = None
    vendedor: str | None = None
    produto_id: int
    quantidade_un: float | None = Field(default=None, ge=0)
    quantidade_kg: float = Field(gt=0)
    preco_kg: float = Field(ge=0)
    forma_pgto: str | None = None
    a_vista: bool = True
    data_prevista_recebimento: date | None = None

    @model_validator(mode="after")
    def prazo_tem_data(self) -> "VendaIn":
        if not self.a_vista and self.data_prevista_recebimento is None:
            raise ValueError("venda a prazo exige data_prevista_recebimento")
        if self.a_vista:
            self.data_prevista_recebimento = None
        return self


class VendaEditarIn(BaseModel):
    data: date
    cliente_id: int | None = None
    vendedor: str | None = None
    produto_id: int
    quantidade_un: float | None = Field(default=None, ge=0)
    quantidade_kg: float = Field(gt=0)
    preco_kg: float = Field(ge=0)
    forma_pgto: str | None = None
    a_vista: bool = True
    data_prevista_recebimento: date | None = None

    @model_validator(mode="after")
    def prazo_tem_data(self) -> "VendaEditarIn":
        if not self.a_vista and self.data_prevista_recebimento is None:
            raise ValueError("venda a prazo exige data_prevista_recebimento")
        if self.a_vista:
            self.data_prevista_recebimento = None
        return self


class VendaOut(BaseModel):
    id: int
    client_id: uuid.UUID
    data: date
    cliente_id: int | None
    vendedor: str | None
    produto_id: int
    quantidade_un: float | None
    quantidade_kg: float
    preco_kg: float
    valor_total: float
    forma_pgto: str | None
    situacao: str | None
    data_pagamento: date | None
    data_prevista_recebimento: date | None
    criado_em: datetime


class VendaListaOut(BaseModel):
    id: int
    data: date
    cliente_id: int | None
    cliente_nome: str
    cliente_prazo_dias: int | None
    produto_id: int
    produto_nome: str
    quantidade_un: float | None
    quantidade_kg: float
    preco_kg: float
    valor_total: float
    forma_pgto: str | None
    vendedor: str | None
    situacao: str | None
    data_pagamento: date | None
    data_prevista_recebimento: date | None
    observacoes: str | None
    excluido_em: datetime | None = None
    excluido_por: str | None = None


class VendaPagamentoIn(BaseModel):
    situacao: str
    data_pagamento: date | None = None
    forma_pgto: str | None = None


class VendaObservacoesIn(BaseModel):
    observacoes: str | None = None


TipoAjusteEstoque = Literal["amostra", "descarte", "diferenca_estoque"]


class AjusteEstoqueIn(BaseModel):
    client_id: uuid.UUID
    data: date
    produto_id: int
    # negativo só é aceito pra tipo="diferenca_estoque" (correção pra cima —
    # ver model_validator abaixo); amostra/descarte continuam só positivos
    quantidade_embalagens: float | None = Field(default=None)
    quantidade_kg: float | None = Field(default=None)
    tipo: TipoAjusteEstoque
    observacao: str | None = None

    @model_validator(mode="after")
    def um_dos_dois_informado(self) -> "AjusteEstoqueIn":
        if self.quantidade_embalagens is None and self.quantidade_kg is None:
            raise ValueError("informe quantidade_embalagens ou quantidade_kg")
        if self.tipo != "diferenca_estoque":
            if (self.quantidade_embalagens or 0) < 0 or (self.quantidade_kg or 0) < 0:
                raise ValueError("amostra/descarte não podem ser negativos — só 'diferença de estoque' admite correção pra cima")
        return self


class AjusteEstoqueOut(BaseModel):
    id: int
    client_id: uuid.UUID
    data: date
    produto_id: int
    produto_nome: str
    quantidade_embalagens: float | None
    quantidade_kg: float
    tipo: TipoAjusteEstoque
    observacao: str | None
    criado_em: datetime


# ---------- Painéis gerenciais (somente leitura) ----------


class UltimaBiometria(BaseModel):
    data: date
    peso_medio_g: float
    dias_atras: int


class UltimaAgua(BaseModel):
    data: date
    oxigenio: float | None
    temperatura_c: float | None
    amonia: float | None
    ph: float | None
    nitrito: float | None
    nitrato: float | None


class PainelViveiroOut(BaseModel):
    id: int
    codigo: str
    tipo: str
    area_m2: float
    lote_atual: LoteAtual | None = None
    data_inicio_lote: date | None = None
    idade_dias: int | None = None
    idade_semanas: int | None = None
    peso_estimado_hoje_g: float | None = None
    peso_esperado_pela_idade_g: float | None = None
    cor_crescimento: str | None = None  # "vermelho" | "amarelo" | "verde"
    densidade_kg_m2: float | None = None
    conversao_alimentar: float | None = None
    biomassa_atual_kg: float | None = None
    ganho_biomassa_kg: float | None = None
    racao_acumulada_kg: float | None = None
    ultima_biometria: UltimaBiometria | None = None
    ultima_agua: UltimaAgua | None = None


class AbateOut(BaseModel):
    lote_id: int
    lote_codigo: str
    fase: str
    viveiro_codigo: str
    quantidade_un: int
    peso_medio_g: float
    data_biometria: date
    semana_atual: int
    semana_limite: int
    previsao_abate: date | None
    pronto: bool


class ProducaoPorProdutoOut(BaseModel):
    produto_id: int
    produto_nome: str
    quantidade_kg: float


class ProducaoDetalheOut(BaseModel):
    data: date
    produto_nome: str
    quantidade_kg: float
    lote_codigo: str | None
    viveiro_codigo: str | None
    data_despesca: date | None
    peso_medio_suja_g: float | None
    rendimento: float | None


class ProducaoResumoOut(BaseModel):
    de: date
    ate: date
    por_produto: list[ProducaoPorProdutoOut]
    produzido_file_kg: float
    produzido_postas_kg: float
    produzido_tilapia_limpa_kg: float
    peso_medio_suja_ponderado_g: float | None
    rendimento_medio_ponderado_file: float | None
    rendimento_medio_ponderado_postas: float | None
    rendimento_medio_ponderado_tilapia_limpa: float | None


class EstoqueItemOut(BaseModel):
    id: int
    nome: str
    fator_kg: float | None
    produzido_un: float | None
    vendido_un: float | None
    em_transito_un: float | None
    ajustado_un: float | None
    saldo_un: float | None
    produzido_kg: float
    vendido_kg: float
    em_transito_kg: float
    ajustado_kg: float
    saldo_kg: float


class MortalidadeLoteOut(BaseModel):
    lote_id: int
    lote_codigo: str
    fase: str
    viveiro_codigo: str
    data_inicio: date
    data_fim: date
    dias: int
    quantidade_inicial: int
    quantidade_perdida: int
    taxa: float


class MortalidadeResumoOut(BaseModel):
    taxa_media_pre_engorda: float | None
    taxa_media_engorda: float | None
    lotes: list[MortalidadeLoteOut]


class VendaPorProdutoOut(BaseModel):
    produto_id: int
    produto_nome: str
    quantidade_kg: float
    valor_total: float


class VendaClienteProdutoOut(BaseModel):
    produto_id: int
    produto_nome: str
    quantidade_kg: float
    valor_total: float
    preco_medio_ponderado: float


class VendaPorClienteOut(BaseModel):
    cliente_id: int | None
    cliente_nome: str
    quantidade_kg: float
    valor_total: float
    preco_medio_ponderado_file: float | None
    por_produto: list[VendaClienteProdutoOut]


class ComercialResumoOut(BaseModel):
    de: date
    ate: date
    quantidade_kg_total: float
    valor_total: float
    por_produto: list[VendaPorProdutoOut]
    por_cliente: list[VendaPorClienteOut]
    file_kg_total: float
    file_preco_medio_ponderado: float | None


class AguaPontoOut(BaseModel):
    data: date
    oxigenio: float | None
    temperatura_c: float | None
    amonia: float | None
    ph: float | None
    nitrito: float | None
    nitrato: float | None


class AguaViveiroOut(BaseModel):
    viveiro_id: int
    viveiro_codigo: str
    serie: list[AguaPontoOut]


# ---------- Séries por período (gráficos) ----------


class SerieBucketProdutoOut(BaseModel):
    produto_id: int
    produto_nome: str
    quantidade_kg: float
    valor_total: float
    preco_medio_ponderado: float | None


class ComercialSerieBucketOut(BaseModel):
    bucket: str
    por_produto: list[SerieBucketProdutoOut]


class ComercialSerieOut(BaseModel):
    de: date
    ate: date
    granularidade: str
    buckets: list[ComercialSerieBucketOut]


class ProducaoSerieBucketProdutoOut(BaseModel):
    produto_id: int
    produto_nome: str
    quantidade_kg: float


class ProducaoSerieBucketOut(BaseModel):
    bucket: str
    por_produto: list[ProducaoSerieBucketProdutoOut]
    rendimento_medio_ponderado: float | None
    peso_medio_suja_ponderado_g: float | None


class ProducaoSerieOut(BaseModel):
    de: date
    ate: date
    granularidade: str
    buckets: list[ProducaoSerieBucketOut]


# ---------- Parâmetros do sistema ----------


class ParametroOut(BaseModel):
    chave: str
    valor: float
    descricao: str | None


class ParametroIn(BaseModel):
    valor: float


# ---------- Dashboard ----------


class ViveiroAlertaOut(BaseModel):
    viveiro_codigo: str
    lote_codigo: str
    densidade_kg_m2: float
    limite_kg_m2: float
    situacao: str  # "acima" | "proximo"


class ProducaoDiaOut(BaseModel):
    data: date
    quantidade_kg: float


class SerieDiariaOut(BaseModel):
    data: date
    valor: float


class DashboardOut(BaseModel):
    de: date
    ate: date
    producao_total_kg: float
    dias_trabalhados: int
    producao_por_dia_kg: float | None
    vendas_kg: float
    vendas_valor: float
    serie_producao_diaria: list[ProducaoDiaOut]
    serie_vendas_kg_diaria: list[SerieDiariaOut]
    serie_vendas_valor_diaria: list[SerieDiariaOut]
    serie_rendimento_diario: list[SerieDiariaOut]
    serie_mortalidade_diaria: list[SerieDiariaOut]
    viveiros_alerta: list[ViveiroAlertaOut]
    biomassa_total_kg: float
    conversao_media_ponderada: float | None
    mortalidade_media_ponderada: float | None
    rendimento_medio_ponderado: float | None


# ---------- Vendedor ----------


class VendedorIn(BaseModel):
    nome: str
    telefone: str | None = None


class VendedorOut(BaseModel):
    id: int
    nome: str
    telefone: str | None


# ---------- Cliente (cadastro) ----------


class ClienteDetalheOut(BaseModel):
    id: int
    nome: str
    cnpj: str | None
    contato: str | None
    cidade: str | None
    prazo_dias: int | None
    emite_nf: bool
    emite_boleto: bool


class ClienteIn(BaseModel):
    nome: str
    cnpj: str | None = None
    contato: str | None = None
    cidade: str | None = None
    prazo_dias: int | None = None
    emite_nf: bool = False
    emite_boleto: bool = False


class ClienteProdutoPrecoOut(BaseModel):
    produto_id: int
    produto_nome: str
    preco: float


class ClienteProdutoPrecoIn(BaseModel):
    produto_id: int
    preco: float = Field(ge=0)


# ---------- Expedição ----------


class ExpedicaoItemIn(BaseModel):
    produto_id: int
    quantidade_embalagens: float | None = Field(default=None, ge=0)
    quantidade_kg: float | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def um_dos_dois(self) -> "ExpedicaoItemIn":
        if self.quantidade_embalagens is None and self.quantidade_kg is None:
            raise ValueError("informe quantidade_embalagens ou quantidade_kg")
        return self


class ExpedicaoIn(BaseModel):
    client_id: uuid.UUID
    vendedor_id: int
    data_saida: date
    observacao: str | None = None
    itens: list[ExpedicaoItemIn] = Field(min_length=1)


class ExpedicaoItemOut(BaseModel):
    produto_id: int
    produto_nome: str
    quantidade_embalagens: float | None
    quantidade_kg: float


class ExpedicaoOut(BaseModel):
    id: int
    vendedor_id: int
    vendedor_nome: str
    data_saida: date
    data_acerto: date | None
    observacao: str | None
    itens: list[ExpedicaoItemOut]


class ExpedicaoEditarIn(BaseModel):
    vendedor_id: int
    data_saida: date
    observacao: str | None = None
    itens: list[ExpedicaoItemIn] = Field(min_length=1)


class ExpedicaoEdicaoOut(BaseModel):
    id: int
    editado_em: datetime
    editado_por: str | None
    antes: dict
    depois: dict


class AcertoVendaIn(BaseModel):
    cliente_id: int | None = None
    produto_id: int
    quantidade_un: float | None = Field(default=None, ge=0)
    quantidade_kg: float = Field(gt=0)
    preco_kg: float = Field(ge=0)
    forma_pgto: str | None = None
    prazo_dias: int | None = None
    emite_nf: bool = False
    emite_boleto: bool = False


class AcertoRetornoIn(BaseModel):
    produto_id: int
    quantidade_embalagens: float | None = Field(default=None, ge=0)
    quantidade_kg: float | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def um_dos_dois(self) -> "AcertoRetornoIn":
        if self.quantidade_embalagens is None and self.quantidade_kg is None:
            raise ValueError("informe quantidade_embalagens ou quantidade_kg")
        return self


class AcertoDespesaIn(BaseModel):
    categoria: str
    valor: float = Field(gt=0)
    forma_pgto: str = "Dinheiro"
    observacao: str | None = None


class AcertoIn(BaseModel):
    client_id: uuid.UUID
    data_acerto: date
    vendas: list[AcertoVendaIn] = Field(default_factory=list)
    retornos: list[AcertoRetornoIn] = Field(default_factory=list)
    despesas: list[AcertoDespesaIn] = Field(default_factory=list)


class AcertoDiferencaOut(BaseModel):
    produto_id: int
    produto_nome: str
    quantidade_expedida_kg: float
    quantidade_vendida_kg: float
    quantidade_retornada_kg: float
    diferenca_kg: float


class AcertoOut(BaseModel):
    expedicao_id: int
    total_vendas_dinheiro: float
    total_despesas_dinheiro: float
    total_esperado_dinheiro: float
    diferencas: list[AcertoDiferencaOut]


# ---------- Despesa (solta ou de expedição) ----------


class DespesaIn(BaseModel):
    client_id: uuid.UUID
    data: date
    categoria: str
    valor: float = Field(gt=0)
    forma_pgto: str = "Dinheiro"
    observacao: str | None = None


class DespesaOut(BaseModel):
    id: int
    client_id: uuid.UUID
    data: date
    categoria: str
    valor: float
    forma_pgto: str
    expedicao_id: int | None
    observacao: str | None
    criado_em: datetime


# ---------- Painel Caixa ----------


class CaixaDiaOut(BaseModel):
    dia: date
    vendas_dinheiro: float
    despesas_dinheiro: float
    saldo: float


class ExpedicaoAbertaOut(BaseModel):
    id: int
    vendedor_nome: str
    data_saida: date
    dias_em_aberto: int


class CaixaResumoOut(BaseModel):
    de: date
    ate: date
    total_vendas_dinheiro: float
    total_despesas_dinheiro: float
    saldo: float
    dias: list[CaixaDiaOut]
    expedicoes_abertas: list[ExpedicaoAbertaOut]


# ---------- Tabelas informativas ----------


class TabelaArracoamentoLinhaOut(BaseModel):
    semana: int
    peso_inicial_g: float
    peso_final_g: float
    peso_ganho_g: float
    consumo_diario_kg: float
    consumo_semanal_kg: float
    consumo_sacos: float
    pct_proteina: float | None
    tipo_racao: str | None
    preco_saco: float | None
    conversao: float | None
    tratos_por_dia: int


class TratoPrevistoOut(BaseModel):
    horario: str
    sacos: float


class ArracoamentoPrevistoDiaOut(BaseModel):
    viveiro_codigo: str
    lote_codigo: str
    periodo_inicio: date
    periodo_fim: date
    semana: int
    saldo_un: int
    peso_estimado_g: float
    tratos: list[TratoPrevistoOut]
    sacos_total_dia: float


class ItemRepicagemOut(BaseModel):
    viveiro_origem: str
    lote_codigo: str
    viveiro_destino: str
    un_repicado: int


class MisturaOut(BaseModel):
    viveiro_destino: str
    origens: list[str]


class NivelRepicagemOut(BaseModel):
    aplicavel: bool
    resumo: str
    itens: list[ItemRepicagemOut]
    misturas: list[MisturaOut]
    restante_un: dict[str, int]


class DespescaPreviaOut(BaseModel):
    viveiro_codigo: str
    lote_codigo: str
    peso_estimado_g: float
    saldo_un: int
    capacidade_liberada_un: int


class NivelDespescaOut(BaseModel):
    aplicavel: bool
    resumo: str
    despescar: list[DespescaPreviaOut]
    repicagem: NivelRepicagemOut


class SugestaoRepicagemGeralOut(BaseModel):
    tanques_acima_do_limite: list[str]
    nivel_1: NivelRepicagemOut
    nivel_2: NivelRepicagemOut
    nivel_3: NivelDespescaOut


class EventoProjetadoOut(BaseModel):
    viveiro_codigo: str
    lote_codigo: str
    semanas_a_partir_de_hoje: int
    data_prevista: date
    resolvido: bool
    resolvido_com: str
    detalhe: str
    tanques_a_despescar: list[str]
    tanques_a_ativar: list[str]


class ProjecaoCapacidadeOut(BaseModel):
    horizonte_semanas: int
    eventos: list[EventoProjetadoOut]
    algum_precisa_ativar_tanque: bool


class PontoHistoricoLoteOut(BaseModel):
    data: date
    peso_real_g: float
    peso_esperado_g: float
    saldo_un: int
    densidade_kg_m2: float | None
    conversao_realizada_intervalo: float | None
    conversao_esperada_intervalo: float | None


class HistoricoLoteOut(BaseModel):
    viveiro_codigo: str
    lote_codigo: str
    area_m2: float
    data_inicio: date
    pontos: list[PontoHistoricoLoteOut]
