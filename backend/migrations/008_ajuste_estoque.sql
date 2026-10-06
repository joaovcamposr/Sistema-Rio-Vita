-- Rio Vita — Migração 008: ajuste de estoque (amostra, descarte, diferença
-- de estoque). Na planilha original esses lançamentos entravam como "venda"
-- para um cliente fictício ("Amostra", "Descarte", "Diferença de estoque")
-- — não são vendas de verdade, então ganham campo próprio, com histórico,
-- e o saldo de estoque passa a descontar esses ajustes também.

CREATE TYPE tipo_ajuste_estoque AS ENUM ('amostra', 'descarte', 'diferenca_estoque');

CREATE TABLE ajuste_estoque (
  id            bigserial PRIMARY KEY,
  client_id     uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  data          date     NOT NULL,
  produto_id    smallint NOT NULL REFERENCES produto,
  quantidade_kg numeric(12,3) NOT NULL CHECK (quantidade_kg > 0),
  tipo          tipo_ajuste_estoque NOT NULL,
  observacao    text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  criado_por    text
);
CREATE INDEX ON ajuste_estoque (data, produto_id);

DROP VIEW vw_estoque_produto;
CREATE VIEW vw_estoque_produto AS
SELECT pr.id, pr.nome,
       COALESCE(e.kg, 0) AS produzido_kg,
       COALESCE(s.kg, 0) AS vendido_kg,
       COALESCE(t.kg, 0) AS em_transito_kg,
       COALESCE(a.kg, 0) AS ajustado_kg,
       COALESCE(e.kg, 0) - COALESCE(s.kg, 0) - COALESCE(t.kg, 0) - COALESCE(a.kg, 0) AS saldo_kg
FROM produto pr
LEFT JOIN (SELECT produto_id, SUM(quantidade_kg) kg FROM producao GROUP BY 1) e
       ON e.produto_id = pr.id
LEFT JOIN (SELECT produto_id, SUM(quantidade_kg) kg FROM venda GROUP BY 1) s
       ON s.produto_id = pr.id
LEFT JOIN (
  SELECT ei.produto_id, SUM(ei.quantidade_kg) kg
  FROM expedicao_item ei JOIN expedicao ex ON ex.id = ei.expedicao_id
  WHERE ex.data_acerto IS NULL
  GROUP BY 1
) t ON t.produto_id = pr.id
LEFT JOIN (SELECT produto_id, SUM(quantidade_kg) kg FROM ajuste_estoque GROUP BY 1) a
       ON a.produto_id = pr.id
WHERE pr.ativo;
