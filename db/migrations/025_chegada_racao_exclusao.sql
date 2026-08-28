-- Rio Vita — Migração 025: chegada de ração ganha edição/exclusão
-- reversível — igual já existe pra despesca/repicagem/arraçoamento/
-- biometria/produção/venda/despesa/ajuste de estoque. Era a única tela
-- de lançamento do sistema sem opção nenhuma de corrigir.

ALTER TABLE chegada_racao ADD COLUMN excluido_em timestamptz;
ALTER TABLE chegada_racao ADD COLUMN excluido_por text;
