-- Rio Vita — Migração 045: limite de recompra ajustável por cliente (CRM).
--
-- O CRM calcula sozinho, por cliente, depois de quantos dias sem comprar ele entra em atraso
-- (intervalo médio entre os últimos pedidos + 50%). Esta coluna guarda o ajuste manual: quando
-- preenchida, vale no lugar do cálculo automático. NULL = automático.

ALTER TABLE cliente ADD COLUMN IF NOT EXISTS limite_recompra_dias integer;
ALTER TABLE cliente DROP CONSTRAINT IF EXISTS cliente_limite_recompra_check;
ALTER TABLE cliente ADD CONSTRAINT cliente_limite_recompra_check CHECK (limite_recompra_dias IS NULL OR limite_recompra_dias BETWEEN 1 AND 730);
