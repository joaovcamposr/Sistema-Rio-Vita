-- Rio Vita — Migração 003: painéis gerenciais (somente leitura).
-- Nenhuma tabela de lançamento nova. A única adição é a curva de
-- crescimento padrão da Rio Vita ("Tabela de arraçoamento" da planilha,
-- semana -> peso final em gramas para um lote de 1000 peixes) — dado de
-- referência estático, não um formulário. Ela alimenta a Programação de
-- abate: cada lote é posicionado na semana da curva cujo peso final é o
-- primeiro >= peso da última biometria (regra confirmada linha a linha
-- contra a aba "Programação de abate" da planilha original).
CREATE TABLE tabela_crescimento (
  semana       smallint PRIMARY KEY CHECK (semana > 0),
  peso_final_g numeric(8,2) NOT NULL CHECK (peso_final_g > 0)
);

INSERT INTO tabela_crescimento (semana, peso_final_g) VALUES
  (1, 1.5), (2, 3), (3, 5), (4, 7), (5, 12), (6, 20), (7, 30), (8, 50),
  (9, 75), (10, 100), (11, 115), (12, 140), (13, 170), (14, 200),
  (15, 240), (16, 280), (17, 325), (18, 370), (19, 420), (20, 475),
  (21, 535), (22, 595), (23, 660), (24, 725), (25, 795), (26, 870),
  (27, 945), (28, 1025);
