-- Rio Vita — Migração 019: lançamento de arraçoamento passa a ser um
-- total por tanque/dia, sem dividir por horário — trato fica opcional
-- (NULL = "total do dia"). Lançamentos antigos, feitos por horário,
-- continuam intactos pra manter o histórico.

ALTER TABLE arracoamento ALTER COLUMN trato DROP NOT NULL;
