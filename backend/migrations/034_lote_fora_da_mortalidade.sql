-- Rio Vita — Migração 034: lotes que não entram na média de mortalidade.
--
-- A taxa de mortalidade por fase (média ponderada dos lotes encerrados)
-- estava distorcida por dois tipos de lote sem informação real:
--   * lotes importados da planilha (*-LEGADO): perda zero por construção
--     (povoamento = o que foi despescado) ou povoamento placeholder = 1;
--   * lotes lançados/encerrados por engano (ENG-2026-16/17/18, abertos e
--     fechados em 0–2 dias) e PRE-2026-04, cuja "perda" de 80% é erro de
--     lançamento (decisão do gerente em 11/10/2026).
-- O lote continua existindo e aparecendo na tela; só deixa de contar na média.
-- Mortalidade negativa (povoamento contado a menos) continua valendo.
-- Não apaga nem altera nenhum dado existente.

ALTER TABLE lote ADD COLUMN IF NOT EXISTS fora_da_mortalidade boolean NOT NULL DEFAULT false;
ALTER TABLE lote ADD COLUMN IF NOT EXISTS motivo_fora_da_mortalidade text;

UPDATE lote
   SET fora_da_mortalidade = true,
       motivo_fora_da_mortalidade = 'Lote legado (importado da planilha): sem mortalidade real'
 WHERE codigo LIKE '%-LEGADO';

UPDATE lote
   SET fora_da_mortalidade = true,
       motivo_fora_da_mortalidade = 'Lote lançado por engano (aberto e fechado em 0–2 dias)'
 WHERE codigo IN ('ENG-2026-16', 'ENG-2026-17', 'ENG-2026-18');

UPDATE lote
   SET fora_da_mortalidade = true,
       motivo_fora_da_mortalidade = 'Perda de 80% é erro de lançamento (decisão do gerente)'
 WHERE codigo = 'PRE-2026-04';
