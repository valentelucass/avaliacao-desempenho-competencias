# ADR-0015 — Nomes de banco por ambiente

- **Status:** Aceita; nomes canônicos confirmados em 2026-08-26
- **Data:** 2026-08-26
- **Origem:** Solicitação explícita para padronizar os nomes das bases de desenvolvimento e produção.

## Contexto

Os nomes anteriores descreviam o produto e não o ambiente. A mesma instância local possui uma base de desenvolvimento com dados técnicos locais e uma base de produção estruturalmente preparada. A diferenciação precisa ser imediata em configuração, logs operacionais e comandos administrativos.

## Decisão

- Usar somente `AVALIACAO_DEV` para desenvolvimento e `AVALIACAO_PROD` para produção.
- O runner aceita exclusivamente esses dois nomes, e as configurações de desenvolvimento e produção os utilizam.
- O renomeio das bases existentes é manual, explícito e restrito aos nomes legados conhecidos. Ele confirma os alvos, derruba conexões com rollback imediato, tenta reverter ambos os nomes se houver falha e não aceita destinos existentes.
- O procedimento não altera schema, migrations, dados, logins, permissões ou arquivos físicos da base.

## Consequências

- A API de desenvolvimento deve ser reiniciada após o renomeio para receber a URL JDBC com `AVALIACAO_DEV`.
- Qualquer processo externo conectado a uma das bases é interrompido; deve ser identificado e autorizado antes da execução.
- A ADR-0014 permanece válida quanto à separação de ambientes e à identidade SQL mínima; apenas os nomes canônicos foram substituídos.

## Estado operacional posterior — 2026-08-26

`AVALIACAO_DEV` e `AVALIACAO_PROD` são os nomes em uso e seus históricos foram reconciliados até `V0010`. A `V0011` existe em fonte e aguarda aplicação autorizada; essa pendência não exige nem autoriza repetir o renomeio. A disponibilidade anônima observada dos hosts e os processos PM2 online também não substituem o aceite de negócio ou a validação autenticada por recurso.

## Referências

- [Procedimentos do banco](../../database/README.md)
- [Validação de renomeio](../../database/sql/manual/003_validar_renomeio_ambientes.sql)
- [Renomeio controlado](../../database/sql/manual/004_renomear_bases_para_ambientes_padronizados.sql)
