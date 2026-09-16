-- Rio Vita — Migração 027: ativa interacao_cliente (Fase 2 do CRM).
-- A tabela já existia desde a migração 002 (id, cliente_id, data, descricao)
-- mas nunca foi usada por nenhuma tela. Completa com os mesmos campos que
-- todo lançamento de campo já tem: client_id (idempotência offline),
-- quem fez o contato, quem registrou e exclusão reversível.

ALTER TABLE interacao_cliente ADD COLUMN client_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE;
ALTER TABLE interacao_cliente ADD COLUMN tipo text NOT NULL DEFAULT 'Outro';
ALTER TABLE interacao_cliente ALTER COLUMN tipo DROP DEFAULT;
ALTER TABLE interacao_cliente ADD COLUMN vendedor_id smallint REFERENCES vendedor;
ALTER TABLE interacao_cliente ADD COLUMN criado_em timestamptz NOT NULL DEFAULT now();
ALTER TABLE interacao_cliente ADD COLUMN criado_por text;
ALTER TABLE interacao_cliente ADD COLUMN excluido_em timestamptz;
ALTER TABLE interacao_cliente ADD COLUMN excluido_por text;

CREATE INDEX ON interacao_cliente (cliente_id, data DESC);
