-- Rio Vita — Migração 044: módulo CRM (recompra e prospecção).
--
-- Cliente ganha: origem do contato, data da próxima ação (a data do "o que fazer a
-- seguir" que já existia em texto), volume estimado por mês e motivo da perda.
-- Prospecto = cliente com e_cliente = false; quando faz a primeira venda ele vira
-- cliente sozinho (trigger abaixo), em qualquer tela que lance a venda.

ALTER TABLE cliente ADD COLUMN IF NOT EXISTS origem text;
ALTER TABLE cliente ADD COLUMN IF NOT EXISTS proxima_acao_data date;
ALTER TABLE cliente ADD COLUMN IF NOT EXISTS volume_estimado_kg_mes numeric(10,1);
ALTER TABLE cliente ADD COLUMN IF NOT EXISTS motivo_perda text;

CREATE INDEX IF NOT EXISTS cliente_proxima_acao_idx ON cliente (proxima_acao_data) WHERE proxima_acao_data IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_prospecto_vira_cliente() RETURNS trigger AS $$
BEGIN
  IF NEW.cliente_id IS NOT NULL THEN
    UPDATE cliente
       SET e_cliente = true, fase = 'Cliente ativo', motivo_perda = NULL
     WHERE id = NEW.cliente_id AND NOT e_cliente;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS venda_converte_prospecto ON venda;
CREATE TRIGGER venda_converte_prospecto AFTER INSERT ON venda
  FOR EACH ROW EXECUTE FUNCTION fn_prospecto_vira_cliente();
