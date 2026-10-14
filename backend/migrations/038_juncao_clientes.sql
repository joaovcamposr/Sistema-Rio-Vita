-- Rio Vita — Migração 038: histórico de junção de clientes duplicados.
--
-- Cadastros repetidos do mesmo cliente (ex.: "Squina Lounge" 3x) são juntados
-- por POST /admin/clientes/juntar: vendas, interações, lembretes e preços do(s)
-- duplicado(s) passam pro cadastro principal e o duplicado é INATIVADO (nunca
-- apagado). Esta tabela guarda exatamente o que foi movido, pra desfazer.

CREATE TABLE cliente_juncao_hist (
  id             bigserial PRIMARY KEY,
  principal_id   bigint NOT NULL REFERENCES cliente,
  duplicado_id   bigint NOT NULL REFERENCES cliente,
  venda_ids      bigint[] NOT NULL DEFAULT '{}',
  interacao_ids  bigint[] NOT NULL DEFAULT '{}',
  lembrete_ids   bigint[] NOT NULL DEFAULT '{}',
  preco_produto_ids smallint[] NOT NULL DEFAULT '{}',
  observacoes_antes text,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  criado_por     text,
  desfeito_em    timestamptz
);
CREATE INDEX ON cliente_juncao_hist (principal_id, desfeito_em);
