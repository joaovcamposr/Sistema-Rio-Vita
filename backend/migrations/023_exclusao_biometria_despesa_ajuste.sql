-- Rio Vita — Migração 023: biometria, despesa e ajuste_estoque ganham
-- edição/exclusão reversível, igual já existe pra despesca/repicagem/
-- venda/arraçoamento/produção.

ALTER TABLE biometria ADD COLUMN excluido_em timestamptz;
ALTER TABLE biometria ADD COLUMN excluido_por text;

ALTER TABLE despesa ADD COLUMN excluido_em timestamptz;
ALTER TABLE despesa ADD COLUMN excluido_por text;

ALTER TABLE ajuste_estoque ADD COLUMN excluido_em timestamptz;
ALTER TABLE ajuste_estoque ADD COLUMN excluido_por text;

-- vw_caixa_dia nunca tinha sido atualizada pra ignorar excluído — nem o
-- excluido_em de venda (que já existe desde a migração 020) nem o de
-- despesa (novo aqui). Sem isso, excluir um lançamento não tiraria ele
-- da conferência de caixa, o que anularia o sentido da exclusão.
CREATE OR REPLACE VIEW vw_caixa_dia AS
SELECT dia,
       COALESCE(v.total, 0) AS vendas_dinheiro,
       COALESCE(d.total, 0) AS despesas_dinheiro,
       COALESCE(v.total, 0) - COALESCE(d.total, 0) AS saldo
FROM (
  SELECT data AS dia FROM venda WHERE forma_pgto = 'Dinheiro' AND excluido_em IS NULL
  UNION
  SELECT data AS dia FROM despesa WHERE forma_pgto = 'Dinheiro' AND excluido_em IS NULL
) dias
LEFT JOIN (
  SELECT data, SUM(valor_total) AS total FROM venda
  WHERE forma_pgto = 'Dinheiro' AND excluido_em IS NULL GROUP BY data
) v ON v.data = dias.dia
LEFT JOIN (
  SELECT data, SUM(valor) AS total FROM despesa
  WHERE forma_pgto = 'Dinheiro' AND excluido_em IS NULL GROUP BY data
) d ON d.data = dias.dia;
