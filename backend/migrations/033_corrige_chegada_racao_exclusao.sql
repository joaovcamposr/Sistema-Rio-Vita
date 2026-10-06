-- Rio Vita — Migração 033: corrige divergência de esquema em produção.
-- A migração 025 (chegada de ração com exclusão reversível) nunca foi
-- aplicada no banco de produção — o executor de migrações presumiu que sim
-- no baseline — e as telas de ração davam erro 500 ("column
-- c.excluido_em does not exist"). Descoberto pelo registro de erros e
-- confirmado pelo comparador de esquema (/admin/esquema): era a ÚNICA
-- diferença entre produção e o que as migrações criam.
-- IF NOT EXISTS: seguro em bancos novos (onde a 025 já criou as colunas).

ALTER TABLE chegada_racao ADD COLUMN IF NOT EXISTS excluido_em timestamptz;
ALTER TABLE chegada_racao ADD COLUMN IF NOT EXISTS excluido_por text;
