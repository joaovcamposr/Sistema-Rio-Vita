-- Rio Vita — Migração 031: trilha de auditoria.
-- Todo INSERT/UPDATE/DELETE nas tabelas de negócio grava, em `auditoria`, a
-- linha ANTES e DEPOIS (como JSON). Com isso qualquer edição ou exclusão —
-- feita pelo sistema, por engano ou na mão — pode ser desfeita depois:
--   SELECT antes FROM auditoria WHERE tabela = 'venda' AND registro_id = '123' ORDER BY id DESC;
-- A coluna `usuario` vem do login de quem fez a requisição (a API define
-- app.usuario por requisição); alterações feitas direto no banco ficam sem
-- usuário, o que por si só já é um sinal.

CREATE TABLE auditoria (
  id          bigserial PRIMARY KEY,
  quando      timestamptz NOT NULL DEFAULT now(),
  tabela      text NOT NULL,
  operacao    text NOT NULL,
  registro_id text,
  usuario     text,
  antes       jsonb,
  depois      jsonb
);
CREATE INDEX auditoria_tabela_registro_idx ON auditoria (tabela, registro_id);
CREATE INDEX auditoria_quando_idx ON auditoria (quando);

CREATE FUNCTION fn_auditoria() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  reg text;
BEGIN
  IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN
    RETURN NULL;  -- UPDATE que não mudou nada não vira ruído
  END IF;
  IF TG_OP = 'DELETE' THEN
    reg := to_jsonb(OLD) ->> 'id';
  ELSE
    reg := to_jsonb(NEW) ->> 'id';
  END IF;
  INSERT INTO auditoria (tabela, operacao, registro_id, usuario, antes, depois)
  VALUES (
    TG_TABLE_NAME, TG_OP, reg,
    NULLIF(current_setting('app.usuario', true), ''),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN NULL;
END;
$$;

CREATE TRIGGER aud_venda          AFTER INSERT OR UPDATE OR DELETE ON venda          FOR EACH ROW EXECUTE FUNCTION fn_auditoria();
CREATE TRIGGER aud_venda_parcela  AFTER INSERT OR UPDATE OR DELETE ON venda_parcela  FOR EACH ROW EXECUTE FUNCTION fn_auditoria();
CREATE TRIGGER aud_despesa        AFTER INSERT OR UPDATE OR DELETE ON despesa        FOR EACH ROW EXECUTE FUNCTION fn_auditoria();
CREATE TRIGGER aud_despesca       AFTER INSERT OR UPDATE OR DELETE ON despesca       FOR EACH ROW EXECUTE FUNCTION fn_auditoria();
CREATE TRIGGER aud_producao       AFTER INSERT OR UPDATE OR DELETE ON producao       FOR EACH ROW EXECUTE FUNCTION fn_auditoria();
CREATE TRIGGER aud_ajuste_estoque AFTER INSERT OR UPDATE OR DELETE ON ajuste_estoque FOR EACH ROW EXECUTE FUNCTION fn_auditoria();
CREATE TRIGGER aud_expedicao      AFTER INSERT OR UPDATE OR DELETE ON expedicao      FOR EACH ROW EXECUTE FUNCTION fn_auditoria();
CREATE TRIGGER aud_cliente        AFTER INSERT OR UPDATE OR DELETE ON cliente        FOR EACH ROW EXECUTE FUNCTION fn_auditoria();
CREATE TRIGGER aud_lote           AFTER INSERT OR UPDATE OR DELETE ON lote           FOR EACH ROW EXECUTE FUNCTION fn_auditoria();
