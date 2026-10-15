-- Rio Vita — Migração 040: produto "Resíduo" para vendas.
--
-- Resíduo (sobra do processamento) é vendido por peso, então é um produto de kg
-- digitado. Não tem produção nem estoque no sistema (não aparece em Estoque nem
-- no lançamento de produção) — só em venda e nos painéis comerciais.

INSERT INTO produto (nome, unidade_embalagem, fator_kg, kg_digitado, produzido_internamente, ativo)
VALUES ('Resíduo', NULL, NULL, true, true, true)
ON CONFLICT (nome) DO NOTHING;
