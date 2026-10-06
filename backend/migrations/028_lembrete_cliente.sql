-- Rio Vita — Migração 028: lembretes/follow-up de cliente (Fase 3 do CRM).

CREATE TABLE lembrete_cliente (
  id            bigserial PRIMARY KEY,
  cliente_id    bigint NOT NULL REFERENCES cliente ON DELETE CASCADE,
  data_prevista date   NOT NULL,
  descricao     text   NOT NULL,
  vendedor_id   smallint REFERENCES vendedor,
  concluido     boolean NOT NULL DEFAULT false,
  concluido_em  timestamptz,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  criado_por    text,
  excluido_em   timestamptz,
  excluido_por  text
);

CREATE INDEX ON lembrete_cliente (cliente_id, data_prevista);
-- consulta principal do painel de follow-ups: pendentes ordenados por data
CREATE INDEX ON lembrete_cliente (data_prevista) WHERE concluido = false AND excluido_em IS NULL;
