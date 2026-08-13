-- Rio Vita — Migração 021: produção ganha edição/exclusão reversível,
-- igual já existe pra despesca/repicagem/venda/arraçoamento.

ALTER TABLE producao ADD COLUMN excluido_em timestamptz;
ALTER TABLE producao ADD COLUMN excluido_por text;

-- vw_producao_detalhe agora expõe id/produto_id/lote_id/quantidade_embalagens
-- e excluido_em/excluido_por (pra edição e pra tela de excluídos) — não
-- filtra excluído no nível da view, quem decide é o painel que a usa,
-- igual já é feito pra despesca/venda/etc. Os LATERAL joins internos
-- (kg_despescado, kg_familia) continuam ignorando linha excluída, senão
-- o "excluído" continuaria contando no rendimento.
CREATE OR REPLACE VIEW vw_producao_detalhe AS
SELECT p.id, p.data, p.produto_id, p.quantidade_embalagens, p.quantidade_kg, p.lote_id, p.data_despesca,
       p.excluido_em, p.excluido_por,
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
  WHERE p2.lote_id = p.lote_id AND p2.data_despesca = p.data_despesca AND p2.excluido_em IS NULL
    AND (
      (fam.destino_familia = 'file' AND pr2.nome LIKE 'Filé%') OR
      (fam.destino_familia = 'postas' AND pr2.nome LIKE 'Postas%') OR
      (fam.destino_familia = 'inteira_limpa' AND pr2.nome LIKE 'Tilápia limpa%')
    )
) f ON true;
