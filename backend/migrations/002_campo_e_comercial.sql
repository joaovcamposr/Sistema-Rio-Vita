-- Rio Vita — Migração 002: operação de campo restante (biometria,
-- arraçoamento, análise da água) e comercial (cliente, venda).
-- Povoamento e repicagem não precisam de tabela nova — usam lote/lote_origem,
-- já criadas na 001. Mas "lote" ainda não tinha client_id (só passou a ser
-- criado por uma API de lançamento agora) — adiciona aqui para idempotência.

ALTER TABLE lote ADD COLUMN client_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE;

CREATE TABLE biometria (
  id           bigserial PRIMARY KEY,
  client_id    uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  lote_id      bigint NOT NULL REFERENCES lote,
  data         date   NOT NULL,
  peso_medio_g numeric(8,2) NOT NULL CHECK (peso_medio_g > 0),
  criado_em    timestamptz NOT NULL DEFAULT now(),
  criado_por   text,
  UNIQUE (lote_id, data)
);
CREATE INDEX ON biometria (lote_id, data DESC);

CREATE TABLE arracoamento (
  id         bigserial PRIMARY KEY,
  client_id  uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  lote_id    bigint NOT NULL REFERENCES lote,
  data       date   NOT NULL,
  trato      time   NOT NULL,   -- 07:00 09:00 11:00 13:00 15:00 17:00
  sacos      numeric(8,3) NOT NULL CHECK (sacos >= 0),
  criado_em  timestamptz NOT NULL DEFAULT now(),
  criado_por text,
  UNIQUE (lote_id, data, trato)
);
CREATE INDEX ON arracoamento (lote_id, data);

CREATE TABLE analise_agua (
  id            bigserial PRIMARY KEY,
  client_id     uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  viveiro_id    smallint NOT NULL REFERENCES viveiro,
  data          date     NOT NULL,
  oxigenio      numeric(6,2),
  temperatura_c numeric(5,2),
  amonia        numeric(6,3),
  ph            numeric(4,2) CHECK (ph BETWEEN 0 AND 14),
  nitrito       numeric(6,3),
  nitrato       numeric(6,3),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  criado_por    text,
  UNIQUE (viveiro_id, data),
  -- ao menos um parâmetro precisa ter sido medido
  CHECK (num_nonnulls(oxigenio,temperatura_c,amonia,ph,nitrito,nitrato) > 0)
);
CREATE INDEX ON analise_agua (viveiro_id, data DESC);

CREATE TABLE cliente (
  id                  bigserial PRIMARY KEY,
  nome                text NOT NULL,
  cnpj                text, contato text, nome_contato text,
  endereco            text, cidade  text, ramo    text,
  priorizacao         smallint,
  e_cliente           boolean NOT NULL DEFAULT false,
  fase                text,          -- Ativo, Negociação, ...
  temperatura         text,          -- Frio, Morno, Quente
  motivo              text, proxima_acao text,
  fornecedor_atual    text, preco_concorrente numeric(10,2),
  preferencia_tamanho text, fresco_congelado  text,
  observacoes         text
);

CREATE TABLE interacao_cliente (
  id         bigserial PRIMARY KEY,
  cliente_id bigint NOT NULL REFERENCES cliente ON DELETE CASCADE,
  data       date   NOT NULL,
  descricao  text   NOT NULL
);

CREATE TABLE venda (
  id            bigserial PRIMARY KEY,
  client_id     uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  data          date     NOT NULL,
  cliente_id    bigint   REFERENCES cliente,
  vendedor      text,
  produto_id    smallint NOT NULL REFERENCES produto,
  quantidade_un numeric(10,2),
  quantidade_kg numeric(12,3) NOT NULL CHECK (quantidade_kg > 0),
  preco_kg      numeric(10,2) NOT NULL CHECK (preco_kg >= 0),
  valor_total   numeric(14,2)
      GENERATED ALWAYS AS (quantidade_kg * preco_kg) STORED,
  forma_pgto    text, banco text, situacao text, observacoes text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  criado_por    text
);
CREATE INDEX ON venda (data, produto_id);
CREATE INDEX ON venda (cliente_id, data DESC);

-- Regra R8: estoque de produto acabado (só cálculo, nunca registro manual)
CREATE VIEW vw_estoque_produto AS
SELECT pr.id, pr.nome,
       COALESCE(e.kg, 0) AS produzido_kg,
       COALESCE(s.kg, 0) AS vendido_kg,
       COALESCE(e.kg, 0) - COALESCE(s.kg, 0) AS saldo_kg
FROM produto pr
LEFT JOIN (SELECT produto_id, SUM(quantidade_kg) kg FROM producao GROUP BY 1) e
       ON e.produto_id = pr.id
LEFT JOIN (SELECT produto_id, SUM(quantidade_kg) kg FROM venda    GROUP BY 1) s
       ON s.produto_id = pr.id
WHERE pr.ativo;
