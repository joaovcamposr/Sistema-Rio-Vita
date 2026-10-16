-- Rio Vita — Migração 042: quem lançou cada repicagem.
--
-- lote_origem (a repicagem) não guardava o usuário nem o momento do lançamento.
-- Daqui pra frente grava os dois; as repicagens antigas ficam sem essa informação.

ALTER TABLE lote_origem ADD COLUMN IF NOT EXISTS criado_por text;
ALTER TABLE lote_origem ADD COLUMN IF NOT EXISTS criado_em timestamptz;
ALTER TABLE lote_origem ALTER COLUMN criado_em SET DEFAULT now();
