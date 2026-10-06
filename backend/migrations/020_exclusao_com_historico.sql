-- Rio Vita — Migração 020: exclusão de lançamentos passa a ser reversível.
-- Em vez de apagar a linha, marca excluido_em/excluido_por — as telas de
-- conferência (e a view de saldo do lote) passam a ignorar essas linhas,
-- mas elas continuam no banco e podem ser restauradas.

ALTER TABLE venda ADD COLUMN excluido_em timestamptz;
ALTER TABLE venda ADD COLUMN excluido_por text;

ALTER TABLE despesca ADD COLUMN excluido_em timestamptz;
ALTER TABLE despesca ADD COLUMN excluido_por text;

ALTER TABLE lote_origem ADD COLUMN excluido_em timestamptz;
ALTER TABLE lote_origem ADD COLUMN excluido_por text;

ALTER TABLE arracoamento ADD COLUMN excluido_em timestamptz;
ALTER TABLE arracoamento ADD COLUMN excluido_por text;

-- vw_saldo_lote precisa ignorar despesca/repicagem excluídas — senão um
-- lançamento "excluído" continuaria descontando peixe do tanque
CREATE OR REPLACE VIEW vw_saldo_lote AS
SELECT l.id AS lote_id,
       l.quantidade_inicial
         - COALESCE((SELECT SUM(d.quantidade_un) FROM despesca d
                     WHERE d.lote_id = l.id AND d.excluido_em IS NULL), 0)
         - COALESCE((SELECT SUM(o.quantidade) FROM lote_origem o
                     WHERE o.lote_origem_id = l.id AND o.excluido_em IS NULL), 0)
       AS saldo_un
FROM lote l;

-- vw_producao_detalhe também soma despesca por lote+data pra calcular
-- rendimento — mesma regra, ignora despesca excluída
CREATE OR REPLACE VIEW vw_producao_detalhe AS
SELECT p.id, p.data, p.produto_id, p.quantidade_kg, p.lote_id, p.data_despesca,
       d.peso_medio_suja_g,
       CASE WHEN d.kg_despescado > 0 THEN f.kg_familia / d.kg_despescado END AS rendimento
FROM producao p
JOIN produto pr ON pr.id = p.produto_id
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN pr.nome LIKE 'Filé%' THEN 'file'::destino_despesca
    WHEN pr.nome LIKE 'Postas%' THEN 'postas'::destino_despesca
    WHEN pr.nome LIKE 'Tilápia limpa%' THEN 'inteira_limpa'::destino_despesca
  END AS destino_familia
) fam
LEFT JOIN LATERAL (
  SELECT SUM(peso_total_kg) AS kg_despescado,
         SUM(quantidade_un * peso_medio_g) / NULLIF(SUM(quantidade_un), 0) AS peso_medio_suja_g
  FROM despesca
  WHERE lote_id = p.lote_id AND data = p.data_despesca AND destino = fam.destino_familia
    AND excluido_em IS NULL
) d ON true
LEFT JOIN LATERAL (
  SELECT SUM(p2.quantidade_kg) AS kg_familia
  FROM producao p2 JOIN produto pr2 ON pr2.id = p2.produto_id
  WHERE p2.lote_id = p.lote_id AND p2.data_despesca = p.data_despesca
    AND (
      (fam.destino_familia = 'file' AND pr2.nome LIKE 'Filé%') OR
      (fam.destino_familia = 'postas' AND pr2.nome LIKE 'Postas%') OR
      (fam.destino_familia = 'inteira_limpa' AND pr2.nome LIKE 'Tilápia limpa%')
    )
) f ON true;
