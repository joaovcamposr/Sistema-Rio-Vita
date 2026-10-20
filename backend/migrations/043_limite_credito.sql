-- Rio Vita — Migração 043: limite de crédito por cliente.
--
-- Valor máximo que o cliente pode ficar devendo (soma das parcelas em aberto). NULL = sem limite
-- definido. O sistema só avisa e mostra o disponível ao lançar a venda — não bloqueia.

ALTER TABLE cliente ADD COLUMN IF NOT EXISTS limite_credito numeric(14,2);
ALTER TABLE cliente DROP CONSTRAINT IF EXISTS cliente_limite_credito_check;
ALTER TABLE cliente ADD CONSTRAINT cliente_limite_credito_check CHECK (limite_credito IS NULL OR limite_credito >= 0);
