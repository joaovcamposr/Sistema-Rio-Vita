-- Rio Vita — Migração 001: fundação do modelo (Etapa 3) + fatia vertical
-- Despesca + Produção. Tabelas fora do escopo desta fatia (biometria,
-- arraçoamento, análise da água, vendas, tabela_arracoamento, parametro)
-- entram em migrações seguintes, junto com os módulos que as usam.

CREATE TYPE tipo_viveiro     AS ENUM ('pre_engorda', 'engorda', 'decantacao');
CREATE TYPE fase_lote        AS ENUM ('pre_engorda', 'engorda');
CREATE TYPE destino_despesca AS ENUM ('file', 'postas', 'inteira_limpa', 'inteira_suja');

CREATE TABLE viveiro (
  id      smallserial PRIMARY KEY,
  codigo  text          NOT NULL UNIQUE,   -- 'PE1', '11.1', '23', 'DEC'
  tipo    tipo_viveiro  NOT NULL,
  area_m2 numeric(10,2) NOT NULL CHECK (area_m2 > 0),
  ativo   boolean       NOT NULL DEFAULT true,
  UNIQUE (id, tipo)   -- suporte à trava de decantação em lote, via FK composta
);

CREATE TABLE produto (
  id                     smallserial PRIMARY KEY,
  nome                   text    NOT NULL UNIQUE,
  unidade_embalagem      text,                     -- bandeja, pacote, unidade
  fator_kg               numeric(6,3),             -- 1.0 / 0.5 / 0.4 / 0.8
  kg_digitado            boolean NOT NULL DEFAULT false,
  produzido_internamente boolean NOT NULL DEFAULT true,
  ativo                  boolean NOT NULL DEFAULT true,
  CONSTRAINT kg_tem_origem CHECK (kg_digitado OR fator_kg IS NOT NULL)
);

CREATE TABLE lote (
  id                   bigserial PRIMARY KEY,
  codigo               text      NOT NULL UNIQUE,   -- 'ENG-2026-14'
  fase                 fase_lote NOT NULL,
  viveiro_id           smallint  NOT NULL,
  viveiro_tipo         tipo_viveiro NOT NULL,
  data_inicio          date      NOT NULL,
  quantidade_inicial   integer   NOT NULL CHECK (quantidade_inicial > 0),
  peso_medio_inicial_g numeric(8,2) NOT NULL CHECK (peso_medio_inicial_g > 0),
  data_fim             date,
  observacao           text,
  criado_em            timestamptz NOT NULL DEFAULT now(),
  criado_por           text,
  CHECK (data_fim IS NULL OR data_fim >= data_inicio),
  CHECK (viveiro_tipo <> 'decantacao'),   -- decantação não cria peixe
  FOREIGN KEY (viveiro_id, viveiro_tipo) REFERENCES viveiro (id, tipo)
);

-- Um viveiro não pode ter dois lotes abertos ao mesmo tempo
CREATE UNIQUE INDEX lote_um_ativo_por_viveiro
  ON lote (viveiro_id) WHERE data_fim IS NULL;

CREATE TABLE lote_origem (
  lote_id        bigint  NOT NULL REFERENCES lote ON DELETE CASCADE,
  lote_origem_id bigint  NOT NULL REFERENCES lote,
  quantidade     integer NOT NULL CHECK (quantidade > 0),
  peso_medio_g   numeric(8,2) NOT NULL,
  data           date NOT NULL,
  PRIMARY KEY (lote_id, lote_origem_id),
  CHECK (lote_id <> lote_origem_id)
);

CREATE TABLE despesca (
  id            bigserial PRIMARY KEY,
  -- gerado no celular no momento do lançamento (antes de ter rede); permite
  -- reenviar o mesmo lançamento sem duplicar quando a conexão volta
  client_id     uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  lote_id       bigint NOT NULL REFERENCES lote,
  data          date   NOT NULL,
  destino       destino_despesca NOT NULL,
  quantidade_un integer      NOT NULL CHECK (quantidade_un > 0),
  peso_medio_g  numeric(8,2) NOT NULL CHECK (peso_medio_g > 0),
  peso_total_kg numeric(12,3)
      GENERATED ALWAYS AS (quantidade_un * peso_medio_g / 1000) STORED,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  criado_por    text
);

CREATE INDEX ON despesca (lote_id, data);
CREATE INDEX ON despesca (data, destino);

CREATE TABLE producao (
  id                    bigserial PRIMARY KEY,
  client_id             uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  data                  date     NOT NULL,
  produto_id            smallint NOT NULL REFERENCES produto,
  quantidade_embalagens numeric(10,2),
  quantidade_kg         numeric(12,3) NOT NULL CHECK (quantidade_kg >= 0),
  lote_id               bigint REFERENCES lote,
  data_despesca         date,          -- chave do rendimento (regra R2)
  criado_em             timestamptz NOT NULL DEFAULT now(),
  criado_por            text
);

CREATE INDEX ON producao (data, produto_id);
CREATE INDEX ON producao (lote_id, data_despesca);

-- Regra R1: converte embalagem em quilos, exceto quando o Kg é digitado
CREATE FUNCTION aplica_fator_kg() RETURNS trigger AS $$
DECLARE p produto%ROWTYPE;
BEGIN
  SELECT * INTO p FROM produto WHERE id = NEW.produto_id;
  IF NOT p.kg_digitado THEN
    NEW.quantidade_kg := NEW.quantidade_embalagens * p.fator_kg;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER producao_fator_kg BEFORE INSERT OR UPDATE ON producao
  FOR EACH ROW EXECUTE FUNCTION aplica_fator_kg();

-- Regra R3: saldo vivo do lote
CREATE VIEW vw_saldo_lote AS
SELECT l.id AS lote_id,
       l.quantidade_inicial
         - COALESCE((SELECT SUM(d.quantidade_un) FROM despesca d
                     WHERE d.lote_id = l.id), 0)
         - COALESCE((SELECT SUM(o.quantidade) FROM lote_origem o
                     WHERE o.lote_origem_id = l.id), 0)  -- saída por repicagem
       AS saldo_un
FROM lote l;

-- Regra R2/R9: rendimento por tanque+data de despesca, e peso suja ponderado
CREATE VIEW vw_producao_detalhe AS
SELECT p.id, p.data, p.produto_id, p.quantidade_kg, p.lote_id, p.data_despesca,
       d.peso_medio_suja_g,
       CASE WHEN d.kg_despescado > 0
            THEN f.kg_file / d.kg_despescado END AS rendimento
FROM producao p
LEFT JOIN LATERAL (
  SELECT SUM(peso_total_kg) AS kg_despescado,
         SUM(quantidade_un * peso_medio_g) / NULLIF(SUM(quantidade_un),0)
           AS peso_medio_suja_g
  FROM despesca
  WHERE lote_id = p.lote_id AND data = p.data_despesca
) d ON true
LEFT JOIN LATERAL (
  SELECT SUM(p2.quantidade_kg) AS kg_file
  FROM producao p2 JOIN produto pr ON pr.id = p2.produto_id
  WHERE p2.lote_id = p.lote_id AND p2.data_despesca = p.data_despesca
    AND pr.nome LIKE 'Filé%'
) f ON true;
