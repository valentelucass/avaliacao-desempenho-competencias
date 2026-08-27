# ADR-0008 — Banco SQL Server dedicado e migrations versionadas

- **Status:** Aceita para estrutura e provisionamento controlado
- **Data:** 2026-08-25
- **Origem:** Decisão explícita do usuário de criar um banco novo para este projeto.

## Contexto

A VM já possui uma instância SQL Server local em execução e bancos de outras aplicações. O inventário somente leitura encontrou quatro bancos de usuário, sem banco correspondente a este projeto. Reutilizar um banco de outro sistema misturaria permissões, migrations, backup, retenção e risco operacional.

## Decisão

- Reutilizar apenas a instância SQL Server local existente.
- Criar o banco exclusivo `AvaliacaoDesempenhoCompetencias`; não reutilizar tabelas, schema ou dados de outro projeto.
- Manter `database/sql/migrations` como fonte única da estrutura. A primeira migration contém somente a fundação de identidade, sessão, permissões, auditoria e idempotência necessária para a ADC-007; não cria dados, usuários, senhas, avaliações ou questionários.
- Separar bootstrap, migrations, validações de leitura e SQL manual.
- Usar `database/executar-database.bat` com autenticação integrada do Windows, verificação como padrão e `--apply` somente após confirmação literal. O runner não contém `DROP DATABASE`, recriação, `--force`, senha, login de aplicação ou uso de `sa`.

## Consequências

- A estrutura pode ser validada antes da alteração e aplicada de modo repetível. Cada migration registra versão, checksum SHA-256, horário UTC e executor; o runner reconcilia o histórico completo antes de publicar e bloqueia arquivos removidos, renomeados, alterados ou inseridos fora de ordem.
- Um banco preexistente com o mesmo nome só é aceito quando possui o marcador interno deste projeto. Banco sem marcador ou marcado por outro projeto é recusado antes de criar tabelas.
- O script exige uma conta Windows autorizada a criar o banco. Antes de produção, a aplicação deverá receber uma identidade distinta de mínimo privilégio, por conta SQL Server ou identidade Windows do processo, sem credencial no Git. O desenvolvimento local atual usa autenticação integrada da identidade Windows que executa a JVM e não substitui esse requisito de produção.
- O banco exclusivo foi criado posteriormente sob confirmação explícita. O registro acima descreve o estágio inicial; veja o estado posterior abaixo.
- Cadastro mestre, avaliações, questionários, indicadores e autenticação já têm implementação fonte associada às migrations posteriores. Retenção e workflow operacional de administrador supremo continuam dependentes de aceite e procedimento externo.

## Estado operacional posterior — 2026-08-26

Por autorização registrada no estado do projeto, `AVALIACAO_DEV` e `AVALIACAO_PROD` reconciliaram o histórico completo disponível à época, até `V0010`; as validações somente leitura confirmaram o catálogo inicial sem ciclos, lotações, vínculos, atribuições ou avaliações. A `V0011` já existe em fonte e aguarda aplicação autorizada. Esses fatos não autorizam aplicar migrations em outro alvo, nem substituem a verificação própria de bootstrap, privilégio SQL mínimo, backup/restauração ou aceite de negócio.

## Referências

- [Estrutura de banco](../../database/README.md)
- [Modelo relacional lógico](../architecture/modelo-relacional-logico.md)
- [Fundação de segurança HTTP](../security/fundacao-seguranca-http.md)
