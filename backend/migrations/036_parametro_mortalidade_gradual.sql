-- Rio Vita — Migração 036: mortalidade gradual no tempo de cultivo.
--
-- Até aqui o saldo "com mortalidade" descontava a taxa do ciclo INTEIRO já no
-- dia seguinte ao povoamento (lote novo aparecia com biomassa e conversão
-- distorcidas). Agora a mortalidade vai se acumulando ao longo do ciclo, mais
-- forte logo depois do povoamento (predação):
--     fração acumulada = 1 − (1 − idade/ciclo) ^ expoente
-- Este parâmetro é o expoente. 1 = linear; 2 = padrão (≈44% da mortalidade já
-- aconteceu em 25% do ciclo, 75% em metade do ciclo); maior = mais concentrada
-- no início. Editável na tabela parametro.

INSERT INTO parametro (chave, valor, descricao) VALUES
  ('mortalidade_expoente_precoce', 2,
   'Expoente da curva de mortalidade acumulada: 1 = linear; 2 = mais forte logo após o povoamento (padrão); maior = mais concentrada no início.')
ON CONFLICT (chave) DO NOTHING;
