-- Rio Vita — Migração 014: estoque de ração por fornecedor/tipo.
-- Chegada de ração (fornecedor + um ou mais tipos/quantidades, igual ao
-- padrão de Expedição) e o tipo passa a ser informado no arraçoamento,
-- pra poder calcular estoque = chegadas - consumo, por tipo.

CREATE TABLE fornecedor_racao (
  id    smallserial PRIMARY KEY,
  nome  text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true
);

CREATE TABLE tipo_racao (
  id            smallserial PRIMARY KEY,
  fornecedor_id smallint NOT NULL REFERENCES fornecedor_racao,
  codigo        text NOT NULL,
  ativo         boolean NOT NULL DEFAULT true,
  UNIQUE (fornecedor_id, codigo)
);

CREATE TABLE chegada_racao (
  id           bigserial PRIMARY KEY,
  client_id    uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  data         date NOT NULL,
  fornecedor_id smallint NOT NULL REFERENCES fornecedor_racao,
  observacao   text,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  criado_por   text
);

CREATE TABLE chegada_racao_item (
  id               bigserial PRIMARY KEY,
  chegada_id       bigint   NOT NULL REFERENCES chegada_racao ON DELETE CASCADE,
  tipo_racao_id    smallint NOT NULL REFERENCES tipo_racao,
  quantidade_sacos numeric(10,2) NOT NULL CHECK (quantidade_sacos > 0),
  UNIQUE (chegada_id, tipo_racao_id)
);
CREATE INDEX ON chegada_racao_item (tipo_racao_id);

ALTER TABLE arracoamento ADD COLUMN tipo_racao_id smallint REFERENCES tipo_racao;
CREATE INDEX ON arracoamento (tipo_racao_id);

INSERT INTO fornecedor_racao (nome) VALUES ('Alinutri');
INSERT INTO tipo_racao (fornecedor_id, codigo)
SELECT f.id, x.codigo
FROM fornecedor_racao f, unnest(ARRAY['30AR','32AP','36AP','40AP','45AP']) AS x(codigo)
WHERE f.nome = 'Alinutri';
