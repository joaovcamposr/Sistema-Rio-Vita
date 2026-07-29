-- Rio Vita — Migração 004: Expedição (vendedor/entregador sai com carga,
-- volta com vendas + retorno + despesas), Caixa (conferência do dinheiro
-- da rota) e cadastro de cliente (preço por produto, prazo, NF, boleto).
-- Nada disso existe na planilha original — é uma extensão pedida
-- explicitamente pelo usuário (aprovada em conversa), não uma tradução de
-- aba existente. Ver Etapa 1/2 revisadas para o desenho combinado.

CREATE TABLE vendedor (
  id        smallserial PRIMARY KEY,
  nome      text    NOT NULL,
  telefone  text,
  ativo     boolean NOT NULL DEFAULT true
);

ALTER TABLE cliente
  ADD COLUMN prazo_dias   smallint,
  ADD COLUMN emite_nf     boolean NOT NULL DEFAULT false,
  ADD COLUMN emite_boleto boolean NOT NULL DEFAULT false;

CREATE TABLE cliente_produto_preco (
  cliente_id bigint   NOT NULL REFERENCES cliente ON DELETE CASCADE,
  produto_id smallint NOT NULL REFERENCES produto,
  preco      numeric(10,2) NOT NULL CHECK (preco >= 0),
  PRIMARY KEY (cliente_id, produto_id)
);

CREATE TABLE expedicao (
  id            bigserial PRIMARY KEY,
  client_id     uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  -- idempotência do ACERTO é separada da idempotência da abertura: a
  -- mesma expedição é criada uma vez, mas o acerto (retry offline) precisa
  -- do próprio client_id para não gravar vendas/despesas em dobro
  acerto_client_id uuid UNIQUE,
  vendedor_id   smallint NOT NULL REFERENCES vendedor,
  data_saida    date     NOT NULL,
  data_acerto   date,
  observacao    text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  criado_por    text,
  CHECK (data_acerto IS NULL OR data_acerto >= data_saida)
);

-- um vendedor não sai com uma segunda carga antes de acertar a anterior
CREATE UNIQUE INDEX expedicao_uma_aberta_por_vendedor
  ON expedicao (vendedor_id) WHERE data_acerto IS NULL;

CREATE TABLE expedicao_item (
  id                    bigserial PRIMARY KEY,
  expedicao_id          bigint   NOT NULL REFERENCES expedicao ON DELETE CASCADE,
  produto_id            smallint NOT NULL REFERENCES produto,
  quantidade_embalagens numeric(10,2),
  quantidade_kg         numeric(12,3) NOT NULL CHECK (quantidade_kg >= 0),
  UNIQUE (expedicao_id, produto_id)
);
-- reaproveita a mesma regra R1 (converte embalagem -> Kg) já usada em Produção
CREATE TRIGGER expedicao_item_fator_kg BEFORE INSERT OR UPDATE ON expedicao_item
  FOR EACH ROW EXECUTE FUNCTION aplica_fator_kg();

CREATE TABLE expedicao_retorno (
  id                    bigserial PRIMARY KEY,
  expedicao_id          bigint   NOT NULL REFERENCES expedicao ON DELETE CASCADE,
  produto_id            smallint NOT NULL REFERENCES produto,
  quantidade_embalagens numeric(10,2),
  quantidade_kg         numeric(12,3) NOT NULL CHECK (quantidade_kg >= 0),
  UNIQUE (expedicao_id, produto_id)
);
CREATE TRIGGER expedicao_retorno_fator_kg BEFORE INSERT OR UPDATE ON expedicao_retorno
  FOR EACH ROW EXECUTE FUNCTION aplica_fator_kg();

CREATE TABLE despesa (
  id           bigserial PRIMARY KEY,
  client_id    uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  data         date NOT NULL,
  categoria    text NOT NULL,
  valor        numeric(10,2) NOT NULL CHECK (valor > 0),
  forma_pgto   text NOT NULL DEFAULT 'Dinheiro',
  -- nulo = despesa solta, sem vínculo com nenhuma rota
  expedicao_id bigint REFERENCES expedicao,
  observacao   text,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  criado_por   text
);
CREATE INDEX ON despesa (data, forma_pgto);
CREATE INDEX ON despesa (expedicao_id);

ALTER TABLE venda
  ADD COLUMN expedicao_id bigint REFERENCES expedicao,
  ADD COLUMN prazo_dias   smallint,
  ADD COLUMN emite_nf     boolean,
  ADD COLUMN emite_boleto boolean;
CREATE INDEX ON venda (expedicao_id);

-- Caixa (Regra nova): conferência operacional, não fluxo de caixa completo
-- (financeiro continua no Omie) — só o que entra/sai em dinheiro por dia.
CREATE VIEW vw_caixa_dia AS
SELECT dia,
       COALESCE(v.total, 0) AS vendas_dinheiro,
       COALESCE(d.total, 0) AS despesas_dinheiro,
       COALESCE(v.total, 0) - COALESCE(d.total, 0) AS saldo
FROM (
  SELECT data AS dia FROM venda WHERE forma_pgto = 'Dinheiro'
  UNION
  SELECT data AS dia FROM despesa WHERE forma_pgto = 'Dinheiro'
) dias
LEFT JOIN (
  SELECT data, SUM(valor_total) AS total FROM venda
  WHERE forma_pgto = 'Dinheiro' GROUP BY data
) v ON v.data = dias.dia
LEFT JOIN (
  SELECT data, SUM(valor) AS total FROM despesa
  WHERE forma_pgto = 'Dinheiro' GROUP BY data
) d ON d.data = dias.dia;
