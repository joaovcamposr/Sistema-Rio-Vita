-- Rio Vita — Migração 032: registro de erros internos da API.
-- Toda exceção não tratada (as que viram "erro 500" e, no navegador,
-- "Failed to fetch") é gravada aqui com rota, usuário e traceback. Isso
-- permite ver o que está quebrando sem depender de alguém reportar, e
-- alimenta o alerta do /health/detalhado.

CREATE TABLE erro_log (
  id         bigserial PRIMARY KEY,
  quando     timestamptz NOT NULL DEFAULT now(),
  metodo     text,
  rota       text,
  usuario    text,
  tipo       text,
  mensagem   text,
  traceback  text
);
CREATE INDEX erro_log_quando_idx ON erro_log (quando DESC);
