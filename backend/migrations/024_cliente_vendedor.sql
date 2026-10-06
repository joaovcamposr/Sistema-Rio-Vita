-- Rio Vita — Migração 024: cliente ganha um vendedor responsável (quem
-- normalmente atende esse cliente) — usado como padrão ao lançar uma
-- venda pra ele no acerto de expedição, mas continua editável por venda.

ALTER TABLE cliente ADD COLUMN vendedor_id smallint REFERENCES vendedor;
