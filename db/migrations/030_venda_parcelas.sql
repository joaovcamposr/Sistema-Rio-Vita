-- Rio Vita — Migração 030: parcelamento de vendas.
-- Até aqui uma venda só tinha UM evento de pagamento (forma_pgto,
-- situacao, data_pagamento, data_prevista_recebimento). Passa a poder
-- ter várias parcelas, cada uma com seu próprio valor, forma e data —
-- cobre parcelamento, pagamento misto (parte dinheiro, parte Pix) e
-- parte à vista + parte a prazo na mesma venda.
--
-- Tudo numa transação só: se o backfill falhar no meio (ex.: venda com
-- valor_total = 0, que existe em ~490 vendas históricas sem preço
-- lançado), o DROP COLUMN das linhas finais NÃO roda e nada fica pela
-- metade. Isso já aconteceu uma vez em produção sem a transação — as
-- colunas antigas foram dropadas com o backfill vazio, e os dados só
-- foram recuperados na mão via pg_attribute (ver histórico da sessão).

BEGIN;

CREATE TABLE venda_parcela (
  id             bigserial PRIMARY KEY,
  client_id      uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  venda_id       bigint NOT NULL REFERENCES venda ON DELETE CASCADE,
  numero         smallint NOT NULL,
  -- >= 0, não > 0: vendas antigas de cortesia/brinde (ou preço nunca
  -- lançado) têm valor_total = 0 e ainda assim precisam de uma parcela
  -- pra preservar forma_pgto/situacao/data. Criação de parcela NOVA
  -- continua exigindo valor > 0 na validação do schema (VendaParcelaIn).
  valor          numeric(14,2) NOT NULL CHECK (valor >= 0),
  forma_pgto     text NOT NULL,
  data_prevista  date NOT NULL,
  data_pagamento date,
  observacao     text,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  criado_por     text,
  excluido_em    timestamptz,
  excluido_por   text,
  UNIQUE (venda_id, numero)
);
CREATE INDEX ON venda_parcela (venda_id);
CREATE INDEX ON venda_parcela (data_prevista);
CREATE INDEX ON venda_parcela (data_pagamento);

-- backfill: toda venda existente vira uma única parcela, preservando o
-- que já estava lançado (pagas continuam pagas, a prazo continua com a
-- mesma data prevista)
INSERT INTO venda_parcela (venda_id, numero, valor, forma_pgto, data_prevista, data_pagamento, criado_por)
SELECT id, 1, valor_total, COALESCE(forma_pgto, 'Dinheiro'),
       COALESCE(data_prevista_recebimento, data), data_pagamento, 'migracao_030'
FROM venda;

-- resumo de pagamento por venda — mesmo espírito de vw_saldo_lote/
-- vw_estoque_produto: computado, não lançado
CREATE VIEW vw_venda_pagamento AS
SELECT v.id AS venda_id,
       COALESCE(SUM(p.valor) FILTER (WHERE p.data_pagamento IS NOT NULL AND p.excluido_em IS NULL), 0) AS valor_recebido,
       v.valor_total - COALESCE(SUM(p.valor) FILTER (WHERE p.data_pagamento IS NOT NULL AND p.excluido_em IS NULL), 0) AS valor_pendente,
       CASE
         WHEN COUNT(p.id) FILTER (WHERE p.excluido_em IS NULL) = 0 THEN 'Sem parcela'
         WHEN COUNT(p.id) FILTER (WHERE p.excluido_em IS NULL AND p.data_pagamento IS NULL) = 0 THEN 'Pago'
         WHEN COUNT(p.id) FILTER (WHERE p.excluido_em IS NULL AND p.data_pagamento IS NOT NULL) = 0 THEN 'Em aberto'
         ELSE 'Parcial'
       END AS situacao,
       MIN(p.data_prevista) FILTER (WHERE p.data_pagamento IS NULL AND p.excluido_em IS NULL) AS proxima_data_prevista
FROM venda v
LEFT JOIN venda_parcela p ON p.venda_id = v.id
GROUP BY v.id, v.valor_total;

-- vw_caixa_dia agora soma pela parcela (uma venda dividida entre formas
-- conta a fatia certa em cada forma), mas continua chaveada pela data
-- da venda (lançado), não pela data de pagamento da parcela
CREATE OR REPLACE VIEW vw_caixa_dia AS
SELECT dia,
       COALESCE(v.total, 0) AS vendas_dinheiro,
       COALESCE(d.total, 0) AS despesas_dinheiro,
       COALESCE(v.total, 0) - COALESCE(d.total, 0) AS saldo
FROM (
  SELECT ve.data AS dia
  FROM venda_parcela vp JOIN venda ve ON ve.id = vp.venda_id
  WHERE vp.forma_pgto = 'Dinheiro' AND vp.excluido_em IS NULL AND ve.excluido_em IS NULL
  UNION
  SELECT data AS dia FROM despesa WHERE forma_pgto = 'Dinheiro' AND excluido_em IS NULL
) dias
LEFT JOIN (
  SELECT ve.data, SUM(vp.valor) AS total
  FROM venda_parcela vp JOIN venda ve ON ve.id = vp.venda_id
  WHERE vp.forma_pgto = 'Dinheiro' AND vp.excluido_em IS NULL AND ve.excluido_em IS NULL
  GROUP BY ve.data
) v ON v.data = dias.dia
LEFT JOIN (
  SELECT data, SUM(valor) AS total FROM despesa
  WHERE forma_pgto = 'Dinheiro' AND excluido_em IS NULL GROUP BY data
) d ON d.data = dias.dia;

-- os campos de pagamento de venda agora vivem em venda_parcela
ALTER TABLE venda DROP COLUMN forma_pgto;
ALTER TABLE venda DROP COLUMN situacao;
ALTER TABLE venda DROP COLUMN data_pagamento;
ALTER TABLE venda DROP COLUMN data_prevista_recebimento;
ALTER TABLE venda DROP COLUMN prazo_dias;

COMMIT;
