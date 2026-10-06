-- Rio Vita — Migração 016: permite editar uma expedição ainda aberta
-- (vendedor, data de saída, itens carregados) — só antes do acerto, pra
-- não mexer em vendas/despesas já geradas. Cada edição fica registrada
-- (antes/depois em JSON), nada é sobrescrito sem rastro.

CREATE TABLE expedicao_edicao (
  id           bigserial PRIMARY KEY,
  expedicao_id bigint NOT NULL REFERENCES expedicao ON DELETE CASCADE,
  editado_em   timestamptz NOT NULL DEFAULT now(),
  editado_por  text,
  antes        jsonb NOT NULL,
  depois       jsonb NOT NULL
);
CREATE INDEX ON expedicao_edicao (expedicao_id, editado_em DESC);
