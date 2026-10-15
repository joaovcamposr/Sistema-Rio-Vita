-- Rio Vita — Migração 041: pedido com vários produtos.
--
-- Uma venda (linha) continua sendo um produto. Um pedido com vários produtos pro
-- mesmo cliente vira várias vendas ligadas pelo mesmo pedido_id (o pagamento é
-- repartido entre elas, em proporção ao valor de cada produto).

ALTER TABLE venda ADD COLUMN IF NOT EXISTS pedido_id uuid;
CREATE INDEX IF NOT EXISTS venda_pedido_id_idx ON venda (pedido_id) WHERE pedido_id IS NOT NULL;
