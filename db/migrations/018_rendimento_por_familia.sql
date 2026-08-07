-- Rio Vita — Migração 018: corrige vw_producao_detalhe pra calcular
-- rendimento por família de produto (Filé, Postas, Tilápia limpa), cada
-- uma contra o peso despescado do SEU destino — antes a view sempre usava
-- destino='file' e a produção de filé pra tudo, então Tilápia limpa e
-- Postas apareciam com o mesmo "rendimento de filé" da mesma despesca,
-- o que é errado (cada família tem seu próprio aproveitamento).

CREATE OR REPLACE VIEW vw_producao_detalhe AS
SELECT p.id, p.data, p.produto_id, p.quantidade_kg, p.lote_id, p.data_despesca,
       d.peso_medio_suja_g,
       CASE WHEN d.kg_despescado > 0 THEN f.kg_familia / d.kg_despescado END AS rendimento
FROM producao p
JOIN produto pr ON pr.id = p.produto_id
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN pr.nome LIKE 'Filé%' THEN 'file'
    WHEN pr.nome LIKE 'Postas%' THEN 'postas'
    WHEN pr.nome LIKE 'Tilápia limpa%' THEN 'inteira_limpa'
  END AS destino_familia
) fam
LEFT JOIN LATERAL (
  SELECT SUM(peso_total_kg) AS kg_despescado,
         SUM(quantidade_un * peso_medio_g) / NULLIF(SUM(quantidade_un), 0) AS peso_medio_suja_g
  FROM despesca
  WHERE lote_id = p.lote_id AND data = p.data_despesca AND destino = fam.destino_familia
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
