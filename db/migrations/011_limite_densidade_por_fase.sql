-- Rio Vita — Migração 011: limite de densidade separado por fase — peixe
-- jovem (pré-engorda) e peixe adulto (engorda) toleram cargas bem
-- diferentes por m², então o parâmetro único vira dois.

DELETE FROM parametro WHERE chave = 'limite_densidade_kg_m2';

INSERT INTO parametro (chave, valor, descricao) VALUES
  ('limite_densidade_pre_engorda_kg_m2', 2.5,
   'Densidade máxima recomendada (Kg de biomassa/m²) para viveiros de pré-engorda.'),
  ('limite_densidade_engorda_kg_m2', 2.5,
   'Densidade máxima recomendada (Kg de biomassa/m²) para viveiros de engorda.');
