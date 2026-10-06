-- Rio Vita — Migração 010: tabela de arraçoamento completa (consumo de
-- ração por 1000 peixes, por semana da curva de crescimento) — a mesma
-- aba "Tabela de arraçoamento" da planilha original, cuja única coluna
-- (semana -> peso final) já tinha entrado na migração 003 como
-- tabela_crescimento. Aqui entra a tabela inteira, usada pela ficha de
-- "Arraçoamento previsto" e exibida como referência na tela de
-- Tabelas informativas.

CREATE TABLE tabela_arracoamento (
  semana             smallint PRIMARY KEY CHECK (semana > 0),
  peso_inicial_g     numeric(8,2) NOT NULL,
  peso_final_g       numeric(8,2) NOT NULL,
  peso_ganho_g       numeric(8,2) NOT NULL,
  consumo_diario_kg  numeric(8,4) NOT NULL,  -- por 1000 peixes
  consumo_semanal_kg numeric(8,4) NOT NULL,  -- por 1000 peixes
  consumo_sacos      numeric(8,4) NOT NULL,  -- por 1000 peixes, por semana
  pct_proteina       numeric(5,2),
  tipo_racao         text,
  preco_saco         numeric(10,2),
  conversao          numeric(6,3),
  tratos_por_dia     smallint NOT NULL CHECK (tratos_por_dia > 0)
);

INSERT INTO tabela_arracoamento
  (semana, peso_inicial_g, peso_final_g, peso_ganho_g, consumo_diario_kg, consumo_semanal_kg, consumo_sacos, pct_proteina, tipo_racao, preco_saco, conversao, tratos_por_dia)
VALUES
  (1,  0.5,  1.5,  1,  0.18, 1.26,  0.0504, 0.55, '55% pó',        NULL, 1.26,   6),
  (2,  1.5,  3,    1.5,0.36, 2.52,  0.1008, 0.45, '45% 0,8mm',     NULL, 1.68,   6),
  (3,  3,    5,    2,  0.6,  4.2,   0.168,  0.45, '45% 1,5mm',     NULL, 2.1,    6),
  (4,  5,    7,    2,  0.72, 5.04,  0.2016, 0.45, '45% 1,5mm',     NULL, 2.52,   6),
  (5,  7,    12,   5,  0.76, 5.32,  0.2128, 0.45, '45% 1,5mm',     NULL, 1.064,  6),
  (6,  12,   20,   8,  1.12, 7.84,  0.3136, 0.4,  '40% 2mm',       NULL, 0.98,   6),
  (7,  20,   30,   10, 1.5,  10.5,  0.42,   0.4,  '40% 2mm',       NULL, 1.05,   6),
  (8,  30,   50,   20, 2.2,  15.4,  0.616,  0.36, '36% 2 a 4mm',   112,  0.77,   6),
  (9,  50,   75,   25, 2.5,  17.5,  0.7,    0.36, '36% 2 a 4mm',   112,  0.7,    6),
  (10, 75,   100,  25, 3,    21,    0.84,   0.36, '36% 2 a 4mm',   112,  0.84,   6),
  (11, 100,  115,  15, 3.5,  24.5,  0.98,   0.36, '36% 2 a 4mm',   112,  1.633,  6),
  (12, 115,  140,  25, 3.8,  26.6,  1.064,  0.36, '36% 2 a 4mm',   112,  1.064,  6),
  (13, 140,  170,  30, 4.65, 32.55, 1.302,  0.36, '36% 2 a 4mm',   112,  1.085,  6),
  (14, 170,  200,  30, 5.4,  37.8,  1.512,  0.36, '36% 2 a 4mm',   112,  1.26,   6),
  (15, 200,  240,  40, 6.4,  44.8,  1.792,  0.32, '32% 4 a 6mm',   86,   1.12,   3),
  (16, 240,  280,  40, 6.8,  47.6,  1.904,  0.32, '32% 4 a 6mm',   86,   1.19,   3),
  (17, 280,  325,  45, 7.6,  53.2,  2.128,  0.32, '32% 4 a 6mm',   86,   1.182,  3),
  (18, 325,  370,  45, 8.7,  60.9,  2.436,  0.32, '32% 4 a 6mm',   86,   1.353,  3),
  (19, 370,  420,  50, 8.7,  60.9,  2.436,  0.32, '32% 4 a 6mm',   86,   1.218,  3),
  (20, 420,  475,  55, 8.9,  62.3,  2.492,  0.32, '32% 4 a 6mm',   86,   1.133,  3),
  (21, 475,  535,  60, 9.6,  67.2,  2.688,  0.32, '32% 4 a 6mm',   86,   1.12,   3),
  (22, 535,  595,  60, 10.7, 74.9,  2.996,  0.32, '32% 4 a 6mm',   86,   1.248,  3),
  (23, 595,  660,  65, 11.9, 83.3,  3.332,  0.32, '32% 4 a 6mm',   86,   1.282,  3),
  (24, 660,  725,  65, 12.5, 87.5,  3.5,    0.32, '32% 4 a 6mm',   86,   1.346,  3),
  (25, 725,  795,  70, 12.5, 87.5,  3.5,    0.32, '32% 4 a 6mm',   86,   1.25,   3),
  (26, 795,  870,  75, 12.5, 87.5,  3.5,    0.32, '32% 4 a 6mm',   86,   1.167,  3),
  (27, 870,  945,  75, 12.7, 88.9,  3.556,  0.32, '32% 4 a 6mm',   86,   1.185,  3),
  (28, 945,  1025, 80, 12.8, 89.6,  3.584,  0.32, '32% 4 a 6mm',   86,   1.12,   3);
