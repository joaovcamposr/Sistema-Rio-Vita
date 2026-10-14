-- Rio Vita — Migração 039: pedidos da Kaylanne (produção/relatório e ração).
--
-- 1) código de barras nos produtos (texto, pra não perder zero à esquerda);
-- 2) subprodutos (contrafilé, barriguinha, pescocinho) e tambaqui (outra espécie,
--    criada na piscicultura) como produtos de peso digitado;
-- 3) turno (manhã/tarde) no lançamento de produção;
-- 4) ajuste de estoque de ração (contagem física), com exclusão reversível.
-- Só acrescenta — não altera nem apaga dado existente.

ALTER TABLE produto ADD COLUMN IF NOT EXISTS codigo_barras text;

UPDATE produto SET codigo_barras = '0074468550735' WHERE nome = 'Filé de tilápia 400g' AND codigo_barras IS NULL;
UPDATE produto SET codigo_barras = '063191113905'  WHERE nome = 'Filé de tilápia 500g' AND codigo_barras IS NULL;
UPDATE produto SET codigo_barras = '0631911131912' WHERE nome = 'Filé de tilápia 1kg'  AND codigo_barras IS NULL;

-- peso digitado (kg) e produzidos aqui. Nomes NÃO começam com "Filé", "Postas" nem
-- "Tilápia limpa": os rendimentos por família usam esses prefixos.
INSERT INTO produto (nome, unidade_embalagem, fator_kg, kg_digitado, produzido_internamente, ativo) VALUES
  ('Contrafilé de tilápia',  NULL, NULL, true, true, true),
  ('Barriguinha de tilápia', NULL, NULL, true, true, true),
  ('Pescocinho de tilápia',  NULL, NULL, true, true, true),
  ('Tambaqui',               NULL, NULL, true, true, true)
ON CONFLICT (nome) DO NOTHING;

ALTER TABLE producao ADD COLUMN IF NOT EXISTS turno text;
ALTER TABLE producao DROP CONSTRAINT IF EXISTS producao_turno_check;
ALTER TABLE producao ADD CONSTRAINT producao_turno_check CHECK (turno IS NULL OR turno IN ('manha', 'tarde'));

CREATE TABLE ajuste_racao (
  id             bigserial PRIMARY KEY,
  client_id      uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  tipo_racao_id  smallint NOT NULL REFERENCES tipo_racao,
  data           date NOT NULL,
  sacos          numeric(10,2) NOT NULL CHECK (sacos <> 0),   -- + soma ao estoque, − tira
  saldo_antes    numeric(10,2),                                -- saldo do sistema no momento da contagem
  saldo_contado  numeric(10,2),                                -- o que foi contado (quando foi por contagem)
  motivo         text NOT NULL,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  criado_por     text,
  excluido_em    timestamptz,
  excluido_por   text
);
CREATE INDEX ON ajuste_racao (tipo_racao_id) WHERE excluido_em IS NULL;

CREATE TRIGGER aud_ajuste_racao AFTER INSERT OR UPDATE OR DELETE ON ajuste_racao
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria();
