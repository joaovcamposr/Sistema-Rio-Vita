-- Rio Vita — Migração 017: separa forma de pagamento (Pix/Boleto/Dinheiro/
-- Cheque) de quando o dinheiro entra (à vista ou a prazo). Antes a
-- "situação" era inferida só pela forma (Pix/Dinheiro = pago na hora,
-- resto = em aberto) — agora qualquer forma pode ser à vista ou a prazo,
-- e quem lança escolhe direto. Vendas a prazo ganham uma data prevista de
-- recebimento própria, em vez de depender só do prazo_dias do cliente.

ALTER TABLE venda ADD COLUMN data_prevista_recebimento date;
ALTER TABLE venda ADD CONSTRAINT venda_prevista_apos_venda
  CHECK (data_prevista_recebimento IS NULL OR data_prevista_recebimento >= data);
