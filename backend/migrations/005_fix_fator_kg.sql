-- Rio Vita — Migração 005: corrige aplica_fator_kg().
-- Bug: a função sempre recalculava quantidade_kg a partir de
-- quantidade_embalagens quando o produto não é kg_digitado — mesmo
-- quando quem gravou já informou quantidade_kg diretamente e deixou
-- quantidade_embalagens em branco (caso do retorno de expedição, onde o
-- vendedor às vezes só sabe o Kg que sobrou, não em bandejas). Isso
-- zerava (NULL) o quantidade_kg informado e violava o NOT NULL.
-- Corrigido: só recalcula quando quantidade_embalagens foi de fato informada.
CREATE OR REPLACE FUNCTION aplica_fator_kg() RETURNS trigger AS $$
DECLARE p produto%ROWTYPE;
BEGIN
  SELECT * INTO p FROM produto WHERE id = NEW.produto_id;
  IF NOT p.kg_digitado AND NEW.quantidade_embalagens IS NOT NULL THEN
    NEW.quantidade_kg := NEW.quantidade_embalagens * p.fator_kg;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
