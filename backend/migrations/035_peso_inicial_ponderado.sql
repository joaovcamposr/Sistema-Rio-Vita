-- Rio Vita — Migração 035: peso médio inicial dos lotes = média ponderada de
-- tudo que entrou nele.
--
-- Até aqui, uma repicagem num lote que já existia somava só a quantidade e
-- mantinha o peso da PRIMEIRA leva. Isso errava biomassa inicial, ganho de
-- biomassa e conversão alimentar (ex.: ENG-2026-21 mostrava peso inicial 186 g
-- quando as quatro levas deram 326 g na média). O código novo (lotes.py,
-- _ajustar_entrada_lote) mantém o peso ponderado daqui pra frente; esta
-- migração corrige os lotes que já existem.
--
-- Só mexe em lote cuja soma das repicagens (não excluídas) é exatamente a
-- quantidade_inicial — nesse caso o peso ponderado é exato. Lote misto
-- (povoamento direto + repicagem) não dá pra reconstruir e fica como está.
--
-- Decisão do gerente (11/10/2026): ENG-2026-23 tinha quantidade_inicial 8.696,
-- mas as três repicagens dele somam 9.696 — alinha a quantidade às repicagens
-- registradas (a auditoria do lote guarda o valor antigo).
-- Não apaga nada; as alterações ficam na tabela de auditoria (trigger do lote).

UPDATE lote
   SET quantidade_inicial = 9696
 WHERE codigo = 'ENG-2026-23'
   AND quantidade_inicial = 8696
   AND (SELECT COALESCE(SUM(o.quantidade), 0) FROM lote_origem o
         WHERE o.lote_id = lote.id AND o.excluido_em IS NULL) = 9696;

UPDATE lote l
   SET peso_medio_inicial_g = x.peso
  FROM (
    SELECT o.lote_id,
           SUM(o.quantidade) AS qtd,
           round((SUM(o.quantidade * o.peso_medio_g) / SUM(o.quantidade))::numeric, 2) AS peso
      FROM lote_origem o
     WHERE o.excluido_em IS NULL
     GROUP BY o.lote_id
  ) x
 WHERE l.id = x.lote_id
   AND x.qtd = l.quantidade_inicial
   AND x.peso > 0
   AND l.peso_medio_inicial_g IS DISTINCT FROM x.peso;
