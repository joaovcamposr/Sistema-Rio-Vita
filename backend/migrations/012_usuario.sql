-- Rio Vita — Migração 012: login por usuário. Papel já existe pra permitir
-- perfis de acesso diferentes no futuro, mas por enquanto todo usuário
-- logado acessa tudo — a única trava real hoje é "está logado ou não".

CREATE TYPE papel_usuario AS ENUM ('operador', 'comercial', 'gerente');

CREATE TABLE usuario (
  id         bigserial PRIMARY KEY,
  nome       text NOT NULL,
  email      text NOT NULL,
  senha_hash text NOT NULL,
  papel      papel_usuario NOT NULL DEFAULT 'operador',
  ativo      boolean NOT NULL DEFAULT true,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

-- e-mail é o login — único, sem diferenciar maiúsculas/minúsculas
CREATE UNIQUE INDEX usuario_email_lower_idx ON usuario (lower(email));
