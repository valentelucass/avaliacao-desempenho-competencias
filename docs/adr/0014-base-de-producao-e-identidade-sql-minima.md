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

## Referências

- [Provisionamento de produção](../../database/production/README.md)
- [Banco de dados](../../database/README.md)
- [Configuração externa](../operations/configuracao-externa-da-aplicacao.md)
