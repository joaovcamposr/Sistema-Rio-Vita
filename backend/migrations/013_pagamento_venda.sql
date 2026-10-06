-- Rio Vita — Migração 013: controle de recebimento das vendas.
-- "situacao" já existia como texto livre (vindo da planilha, com uns
-- typos históricos) — mantém como está para não quebrar dado antigo, só
-- adiciona a data em que o pagamento efetivamente entrou.

ALTER TABLE venda ADD COLUMN data_pagamento date;
ALTER TABLE venda ADD CONSTRAINT venda_data_pagamento_apos_venda
  CHECK (data_pagamento IS NULL OR data_pagamento >= data);

CREATE INDEX ON venda (situacao, data);
