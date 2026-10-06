-- Rio Vita — Migração 009: ajuste de estoque passa a registrar também a
-- contagem real de embalagens (não só o Kg), igual já acontece em produção/
-- expedição — reaproveita a mesma regra R1 (embalagens x fator_kg -> Kg).
-- A tela de Estoque passa a ter filtro de período, então o cálculo de
-- estoque deixa de vir de uma view estática (não dá pra parametrizar) e
-- passa a ser feito direto no endpoint — a view não é mais usada em
-- nenhum outro lugar do sistema.

ALTER TABLE ajuste_estoque ADD COLUMN quantidade_embalagens numeric(10,2);

CREATE TRIGGER ajuste_estoque_fator_kg BEFORE INSERT OR UPDATE ON ajuste_estoque
  FOR EACH ROW EXECUTE FUNCTION aplica_fator_kg();

-- backfill dos ajustes já existentes (histórico da planilha + reconciliação
-- manual): produtos com fator_kg fixo recebem a contagem de embalagens
-- equivalente; produtos com Kg digitado (Tilápia limpa) não têm embalagem
-- fixa, ficam sem contagem.
UPDATE ajuste_estoque a
SET quantidade_embalagens = ROUND(a.quantidade_kg / p.fator_kg, 2)
FROM produto p
WHERE p.id = a.produto_id AND NOT p.kg_digitado AND p.fator_kg IS NOT NULL;

DROP VIEW vw_estoque_produto;
