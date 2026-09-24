-- Rio Vita — Migração 029: metas mensais de abate (Kg de peixe despescado),
-- usadas pela Programação de abate pra planejar quanto despescar de cada
-- tanque nos próximos meses.

CREATE TABLE meta_abate_mensal (
  mes           date PRIMARY KEY CHECK (mes = date_trunc('month', mes)::date),
  kg            numeric(12,2) NOT NULL CHECK (kg >= 0),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por text
);
