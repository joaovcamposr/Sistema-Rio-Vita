-- Rio Vita — Migração 022: repicagem pode acontecer mais de uma vez
-- entre o mesmo par de tanques (repicagem parcial em datas diferentes,
-- caso real: PE3 → tanque 3 em duas levas). A chave primária composta
-- (lote_id, lote_origem_id) impedia isso, rejeitando a segunda
-- repicagem com "duplicate key value violates unique constraint
-- lote_origem_pkey" — o lançamento ficava preso pra sempre na fila
-- offline do aparelho, sem nenhum jeito de salvar.
--
-- lote_origem ganha um id próprio como chave primária. Também ganha
-- client_id pra idempotência de verdade: antes, o retry só era
-- detectado quando a repicagem criava um lote NOVO (client_id gravado
-- na tabela lote); quando o destino já tinha lote ativo (soma direto
-- na quantidade_inicial, sem criar lote novo), um reenvio silenciosamente
-- tentava inserir tudo de novo.

ALTER TABLE lote_origem DROP CONSTRAINT lote_origem_pkey;
ALTER TABLE lote_origem ADD COLUMN id bigserial;
ALTER TABLE lote_origem ADD CONSTRAINT lote_origem_pkey PRIMARY KEY (id);
ALTER TABLE lote_origem ADD COLUMN client_id uuid;
CREATE UNIQUE INDEX lote_origem_client_id_key ON lote_origem (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX lote_origem_lote_id_idx ON lote_origem (lote_id);
CREATE INDEX lote_origem_lote_origem_id_idx ON lote_origem (lote_origem_id);
