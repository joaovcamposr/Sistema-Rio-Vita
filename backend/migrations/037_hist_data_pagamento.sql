-- Rio Vita — Migração 037: histórico de correções da data de pagamento das parcelas.
--
-- Vendas antigas tinham a data de pagamento igual à data da venda (ou uma data
-- em lote), mas a data real estava escrita na observação. A correção
-- (POST /admin/datas-pagamento-por-observacao) grava aqui o valor antigo e o
-- novo de cada parcela alterada, então dá pra desfazer exatamente o que mudou.

CREATE TABLE venda_parcela_data_pagamento_hist (
  id             bigserial PRIMARY KEY,
  parcela_id     bigint NOT NULL REFERENCES venda_parcela ON DELETE CASCADE,
  venda_id       bigint NOT NULL,
  data_antiga    date,
  data_nova      date NOT NULL,
  origem         text NOT NULL,
  observacao     text,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  criado_por     text,
  desfeito_em    timestamptz
);
CREATE INDEX ON venda_parcela_data_pagamento_hist (parcela_id);
CREATE INDEX ON venda_parcela_data_pagamento_hist (origem, desfeito_em);
