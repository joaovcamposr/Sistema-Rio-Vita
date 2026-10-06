-- Rio Vita — Migração 007: parâmetros do sistema (chave/valor genérico,
-- já previsto desde a Etapa 3 — ver comentário na migração 001). Primeiro
-- uso: limite de densidade (Kg de biomassa por m²) usado no semáforo do
-- painel do viveiro e no alerta do dashboard. Editável pelo operador —
-- por isso mora em tabela, não em constante no código.
CREATE TABLE parametro (
  chave     text PRIMARY KEY,
  valor     numeric NOT NULL,
  descricao text
);

INSERT INTO parametro (chave, valor, descricao) VALUES
  ('limite_densidade_kg_m2', 2.5,
   'Densidade máxima recomendada, em Kg de biomassa por m², antes de repicar ou despescar.');
