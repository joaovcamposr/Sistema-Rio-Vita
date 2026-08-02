-- Rio Vita — Migração 015: ajuste de estoque tipo "diferença de estoque"
-- passa a admitir correção pra cima (quantidade negativa). O saldo é
-- produzido - vendido - em trânsito - ajustado, então uma diferença
-- negativa SOMA ao saldo em vez de subtrair — cobre o caso em que a
-- contagem física é maior do que o sistema calcula (produção/venda não
-- lançada, por exemplo). Amostra e descarte continuam sempre positivos:
-- não faz sentido uma "amostra negativa".

ALTER TABLE ajuste_estoque DROP CONSTRAINT ajuste_estoque_quantidade_kg_check;
ALTER TABLE ajuste_estoque ADD CONSTRAINT ajuste_estoque_quantidade_kg_check
  CHECK (quantidade_kg <> 0 AND (quantidade_kg > 0 OR tipo = 'diferenca_estoque'));
