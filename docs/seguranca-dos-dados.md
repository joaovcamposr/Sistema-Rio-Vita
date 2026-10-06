# Segurança dos dados — Rio Vita

Regra número 1: **dado de produção nunca se perde**. Este documento é o
contrato técnico que garante isso. Ele nasceu do incidente da migração 030
(outubro/2026): a migração foi digitada na mão, sem transação; o backfill
falhou no meio e as colunas antigas foram apagadas mesmo assim.

## O que protege os dados hoje

| Camada | O que faz | Onde |
|---|---|---|
| Executor de migrações | Cada migração roda em **uma transação**; falhou, volta tudo. Snapshot completo antes de aplicar. Conta linhas de toda tabela antes/depois e **desfaz** se alguma encolher. Recusa comandos destrutivos sem liberação explícita. Nunca se digita SQL de migração no console. | `backend/app/migrar.py`, roda no start (`Procfile`) |
| Migração em duas etapas | Apagar coluna/tabela **nunca** vai junto com a mudança que a substitui (ver abaixo). | convenção + trava do executor |
| Snapshot diário | Cópia interna de todas as tabelas de negócio (`dia_AAAAMMDD`), 7 dias. Recuperação em segundos de erro lógico. Trava de espaço (`SNAPSHOT_MAX_MB`, padrão 300; o volume do Postgres tem 500 MB e o banco hoje ocupa 15 MB). | `backend/app/rotinas.py` |
| Backup completo baixável | Arquivo `.rvbak.gz` com todos os dados; restaura em banco novo. Botão em *Cadastros → Segurança dos dados* (gerente). | `backend/app/backup.py`, `/admin/backup` |
| Trilha de auditoria | Todo INSERT/UPDATE/DELETE em venda, parcela, despesa, despesca, produção, ajuste de estoque, expedição, cliente e lote grava a linha **antes e depois**, com o usuário. Qualquer edição pode ser desfeita. | migração 031, `/admin/auditoria` |
| Trava de DDL na API | A API é incapaz de executar DROP/ALTER/CREATE/TRUNCATE. Só o executor de migrações e a restauração podem. | `backend/app/db.py` |
| Registro de erros | Todo erro interno é gravado (rota, usuário, traceback) e vira resposta 500 normal (antes aparecia como "Failed to fetch"). | migração 032, `/admin/erros` |
| CI a cada commit | `pyflakes`, **todas** as migrações num banco vazio, fluxo de vendas/caixa, chamada a **todos** os GET, backup→restauração com comparação linha a linha, `tsc` e build do front. | `.github/workflows/ci.yml` |
| Monitor | A cada 15 min consulta `/health/detalhado` (banco, migração pendente, rajada de erros); falhou → e-mail do GitHub. | `.github/workflows/monitor.yml` |

## Como mudar o banco (único caminho)

1. Crie `backend/migrations/NNN_descricao.sql` (próximo número, sem buracos).
2. Escreva **só** coisas aditivas: `CREATE`, `ADD COLUMN`, `INSERT … SELECT`
   (backfill), views. Termine com conferências quando fizer sentido:
   `DO $$ BEGIN IF (SELECT …) <> (SELECT …) THEN RAISE EXCEPTION '…'; END IF; END $$;`
3. Abra um commit. O CI aplica no banco vazio e roda tudo.
4. No deploy o executor tira o snapshot, aplica em transação e confere as contagens.
5. Só **uma versão depois**, com o sistema rodando e os números conferidos, crie a
   migração que remove o que ficou obsoleto. Ela precisa de:
   - cabeçalho `-- destrutiva: <motivo>`;
   - variável `MIGRACAO_DESTRUTIVA_OK=NNN_arquivo.sql` no Railway só durante o deploy;
   - baixar um backup completo **antes**.
6. Migração que reduz linhas de propósito declara `-- invariantes: tabela1,tabela2`.

**Nunca** edite uma migração já aplicada (o executor acusa checksum diferente) e
**nunca** rode DDL no console do Postgres.

## Se algo der errado

* **Alteração/exclusão indevida** de um registro: *Segurança dos dados → Histórico*
  mostra o estado anterior (JSON). Para recuperar em massa, use o snapshot do
  dia: `SELECT * FROM dia_AAAAMMDD.venda WHERE …` (ou `snap_…` anterior à migração).
* **Perda do banco**: criar um Postgres novo, `python -m app.migrar` (cria o esquema),
  `python -m app.backup restaurar arquivo.rvbak.gz` (carrega os dados, conferindo
  contagens e reposicionando sequências). Exige banco novo; recusa se já houver dados.
* **Migração falhou no deploy**: o deploy novo não sobe e a versão anterior continua
  no ar; nada foi alterado (transação). Corrija a migração e faça novo commit.

## O que ainda depende de decisão/credencial humana

* **Cópia fora do Railway.** O backup baixável precisa ser guardado fora do servidor.
  Hoje é manual (botão). Automatizar exige uma credencial de armazenamento externo
  (Google Drive/Backblaze/S3) ou o plano Pro do Railway (backups agendados e
  recuperação a qualquer instante). Recomendado.
* **Usuário do banco sem permissão de DDL.** Hoje a API usa o usuário dono do banco;
  a trava de DDL é na aplicação. Criar um usuário só com SELECT/INSERT/UPDATE/DELETE
  e trocar o `DATABASE_URL` da API fecha também esse lado (exige gerar senha nova).
* O repositório do GitHub é **público**: nunca coloque dados, dumps ou segredos nele.
