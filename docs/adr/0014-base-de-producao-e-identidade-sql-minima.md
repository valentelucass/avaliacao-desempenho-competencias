# ADR-0014 — Base de produção e identidade SQL de mínimo privilégio

- **Status:** Aceita; nomes de base substituídos pela ADR-0015
- **Data:** 2026-08-26
- **Origem:** Solicitação explícita para criar os scripts de provisionamento da nova base de produção.

## Contexto

O banco de desenvolvimento já reconciliado não deve ser reutilizado para a publicação, pois isso misturaria credenciais, chaves de sessão, testes e dados de produção. A ADR-0015 padroniza os nomes canônicos como `AVALIACAO_DEV` e `AVALIACAO_PROD`.

## Decisão

- Reservar `AVALIACAO_PROD` como o único nome adicional autorizado para a base de produção na mesma instância local.
- Preservar `AVALIACAO_DEV` exclusivamente como alvo local de desenvolvimento; o renomeio controlado dos alvos legados é documentado na ADR-0015.
- Permitir que `database/executar-database.bat` crie e migre somente um dos dois nomes autorizados, com confirmação literal, marcador de propriedade e reconciliação de checksum já existentes.
- Exigir configuração de produção com validação de certificado SQL Server (`ADC_SQLCMD_TRUST_SERVER_CERTIFICATE=0`).
- Fornecer script manual, fora das migrations, para o login SQL `rodogarcia_adc_app`, restrito a `CONNECT`, `SELECT`, `INSERT` e `UPDATE` no schema `dbo`, com negação explícita de `DELETE` e sem papéis administrativos, DDL ou acesso a outros bancos.

## Consequências

- A execução dos scripts requer conta Windows administrativa autorizada para criar a base e conta SQL; a aplicação não recebe essa identidade.
- A senha do login é fornecida somente ao `sqlcmd` no terminal seguro e nunca é escrita nos scripts, `.env`, documentação, logs ou Git.
- Antes de iniciar a API em produção, ainda é obrigatório configurar certificado SQL Server confiável, arquivo externo de propriedades, diretório de logs, backup/restauração e validar o preflight. Esta decisão não executa SQL Server, Cloudflare, PM2 ou publicação.

## Estado posterior — 2026-08-29

A decisão acima registra o privilégio inicialmente previsto. No alvo canônico, o `DENY DELETE` global foi removido e `DELETE` ficou concedido somente sobre `dbo.ciclo_questionario` e `dbo.filial`, as duas operações administrativas limitadas que exigem remoção física. O validador confirmou login dedicado ativo, sem `sa`, `sysadmin`, papéis de servidor/banco, DDL, `CONTROL`, `ALTER`, acesso a outros bancos ou `DELETE` adicional. A aplicação também comprovou conexão criptografada com cadeia e nome do certificado validados, sem `trustServerCertificate=true`.

A ADR-0018 classifica RLS como não aplicável à topologia inicial de API única com identidade técnica compartilhada; essa decisão não reduz RBAC/ABAC da aplicação nem resolve firewall, criptografia em repouso, backup ou proteção do segredo SQL.

## Referências

- [Provisionamento de produção](../../database/production/README.md)
- [Banco de dados](../../database/README.md)
- [Configuração externa](../operations/configuracao-externa-da-aplicacao.md)
