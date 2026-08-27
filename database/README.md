# Banco de dados — Avaliação de Desempenho e Competências

Esta pasta contém a fonte versionada do banco SQL Server do projeto. Os nomes canônicos são `AVALIACAO_DEV` para desenvolvimento e `AVALIACAO_PROD` para produção. A fonte contém as migrations `V0001` a `V0011`; o estado operacional registrado em [`../STATES.md`](../STATES.md) informa os dois históricos reconciliados até `V0010`, portanto `V0011` permanece pendente de aplicação autorizada. A migration `V0010` carrega somente o catálogo inicial aprovado; não cria colaboradores, vínculos, ciclos, atribuições ou avaliações. A base de produção usa uma identidade SQL de mínimo privilégio definida em [`production/`](production/README.md).

## Estrutura

```text
database/
├── config.example.bat        # Exemplo local sem senha
├── config.production.example.bat # Exemplo de produção com TLS obrigatório
├── executar-database.bat     # Valida ou aplica o bootstrap de forma confirmada
├── production/               # Provisionamento manual da identidade SQL da aplicação
├── scripts/                  # Auxiliares internos sem acesso a dados da aplicação
│   ├── calcular-sha256.ps1    # Hash de migration por .NET, sem depender de cmdlet opcional
│   ├── preparar-master-migration.ps1 # Wrapper SQL atômico, sem metacomandos sqlcmd
│   └── preparar-migrations.ps1 # Lista e manifesto UTF-8 sem BOM das migrations
└── sql/
    ├── bootstrap/            # Criação controlada do banco e infraestrutura de migrations
    ├── migrations/           # Fonte única do schema, em ordem V0001 a V0011
    ├── validation/           # Consultas de validação somente leitura e detecção de deriva
    └── manual/               # Scripts manuais que nunca são executados automaticamente
```

## Uso seguro

1. Copie `config.example.bat` para `config.local.bat` e mantenha o arquivo local fora do Git.
2. Para desenvolvimento, mantenha `localhost`, porta `1433` e `AVALIACAO_DEV`. Para produção, copie `config.production.example.bat` para `config.production.local.bat`, use `AVALIACAO_PROD` e mantenha a validação de certificado habilitada.
3. Para verificar os dois alvos canônicos sem alterar bancos, execute:

   ```bat
   database\executar-database.bat --check-all
   ```

4. Executar o runner sem argumentos **falha fechado**: ele não consulta, cria nem altera banco. Use um comando explícito.

5. Para atualizar os dois alvos, execute:

   ```bat
   database\executar-database.bat --apply-all
   ```

   O runner executa `AVALIACAO_DEV` antes de `AVALIACAO_PROD`. Se `config.local.bat` ou `config.production.local.bat` não existir, ele para antes de alterar qualquer alvo. A operação exige a confirmação global e as confirmações individuais dos dois alvos; verificações de propriedade, checksum, ordem de migrations e validação SQL continuam obrigatórias para cada banco.

6. Para operar apenas o alvo escolhido pela variável `ADC_DATABASE_CONFIG`, execute primeiro:

   ```bat
   database\executar-database.bat --check
   ```

7. Para validar o banco existente, o histórico e todas as consultas estruturais sem alterar nada, execute:

   ```bat
   database\executar-database.bat --validate
   ```

8. Para publicar migrations pendentes e validar a estrutura em um único alvo já preparado, execute:

   ```bat
   database\executar-database.bat --apply
   ```

   O script exige digitar `APLICAR <nome-do-banco-configurado>` antes de fazer qualquer alteração. Para produção, a confirmação é `APLICAR AVALIACAO_PROD`. A primeira criação de `AVALIACAO_PROD` deve seguir a sequência de bootstrap abaixo; `--apply` a bloqueia antes de criar a base, para não tentar `V0010` sem administrador supremo.

Se um alvo reportar migration pendente, checksum divergente ou estrutura incompatível, não edite migration aplicada nem use esse resultado para publicar sem confirmar o alvo e receber autorização explícita.

## Bootstrap explícito de uma `AVALIACAO_PROD` nova

`V0010` registra autoria do catálogo inicial e, por isso, exige uma conta ativa com `administrador_supremo = 1`. Para evitar uma base parcialmente aplicada, a primeira criação de produção deve usar exatamente esta sequência, em console administrativo autorizado e sem reutilizar senhas, arquivos de configuração ou dados de outro ambiente:

1. Aponte `ADC_DATABASE_CONFIG` para `database\config.production.local.bat` e execute `database\executar-database.bat --check` para conferir o alvo inexistente, sem escrita.
2. Execute `database\executar-database.bat --apply-bootstrap-prerequisites` e digite `PREPARAR BOOTSTRAP AVALIACAO_PROD V0001-V0009`. Esse comando cria somente a base nova, aplica `V0001` a `V0009` e valida a estrutura até essa versão. Ele não aplica `V0010`.
3. No console seguro da VM, crie o primeiro administrador supremo com a rotina transacional abaixo. A senha é lida como `SecureString`; não a coloque em argumentos, arquivos, variáveis de ambiente persistentes, histórico, logs ou repositório.

   ```powershell
   $senhaInicial = Read-Host 'Senha inicial' -AsSecureString
   .\database\scripts\bootstrap-primeiro-administrador-producao.ps1 `
     -Login 'login-autorizado@dominio' `
     -DisplayName 'Nome autorizado' `
     -InitialPassword $senhaInicial `
     -ConfirmProductionBootstrap
   Remove-Variable senhaInicial
   ```

   A rotina aceita somente `AVALIACAO_PROD` com exatamente `V0001` a `V0009`, sem usuários, dados de negócio ou auditoria anterior, e com `V0010` pendente. Ela cria uma conta ativa, protegida e marcada com `administrador_supremo = 1`, atribui apenas o perfil vigente `ADMINISTRADOR_PLATAFORMA`, grava a credencial BCrypt com troca obrigatória no primeiro acesso e audita a operação na mesma transação. Ela não concede papéis legados nem imprime senha ou hash.

4. Execute `database\executar-database.bat --apply`, digite `APLICAR AVALIACAO_PROD` e, após concluir `V0010` e as migrations posteriores pendentes, execute `database\executar-database.bat --validate`.

Cada passo exige alvo, impacto e autorização explícitos. A criação da segunda conta suprema e sua aprovação independente continuam obrigatórias antes de uso operacional.

Se o `--check` indicar fundação `PARCIAL`, o `--apply` é bloqueado. A recuperação só é permitida para o prefixo vazio e exato da `V0001`, exige uma confirmação diferente e recria a fundação na mesma transação:

```bat
database\executar-database.bat --recover-v0001-partial
```

Digite `RECUPERAR AVALIACAO_DEV V0001` somente após revisar o estado indicado pelo script. A recuperação recusa qualquer dado, histórico, objeto, permissão, trigger, propriedade estendida ou dependência externa não esperada.

Se uma primeira execução criar o banco e for interrompida antes do controle de migrations, o banco fica propositalmente sem marcador e o `--apply` continua bloqueado. Só nesse estado, após o runner confirmar que não existe tabela, histórico ou propriedade estendida, use:

```bat
database\executar-database.bat --recover-empty-bootstrap
```

Digite `RECUPERAR AVALIACAO_PROD BOOTSTRAP_VAZIO` somente para o alvo de produção vazio confirmado pelo próprio script. A recuperação não apaga, recria nem aceita banco com qualquer objeto ou metadado.

O runner usa autenticação integrada do Windows e não aceita senha, `sa`, conexão remota, recriação ou exclusão de banco. O checksum das migrations é calculado por .NET para funcionar mesmo quando o ambiente não disponibiliza `Get-FileHash`. Para a instância local atual, `ADC_SQLCMD_TRUST_SERVER_CERTIFICATE=1` permite a conexão local com o certificado atual; a base de produção exige certificado confiável e mantém esse valor em `0`.

Se já existir um banco com o nome esperado, o runner exige o marcador interno deste projeto antes de criar qualquer tabela. Um banco sem marcador ou marcado por outro projeto é recusado, para evitar alterar uma base homônima por engano.

## Renomeio único dos alvos existentes

O launcher `renomear-bases.bat` migra somente os nomes antigos autorizados para `AVALIACAO_DEV` e `AVALIACAO_PROD`. Primeiro execute `database\renomear-bases.bat --check`; depois, quando as conexões afetadas estiverem autorizadas, execute `database\renomear-bases.bat --apply` e digite `RENOMEAR AVALIACAO_DEV E AVALIACAO_PROD`. O renomeio encerra conexões das duas bases com rollback imediato, rejeita destinos existentes e tenta reverter ambos os nomes se a segunda alteração falhar. Não o execute enquanto houver processo desconhecido conectado sem autorização explícita.

## Convenção de migrations

- Um arquivo por alteração, no formato `V0001__descricao_em_minusculo.sql`.
- Uma migration aplicada é imutável. O runner armazena versão, nome, checksum SHA-256, horário UTC e executor em `dbo.schema_migrations`; alteração de checksum interrompe a execução.
- Antes de aplicar qualquer arquivo, o runner reconcilia o histórico do banco com o repositório: migration removida, renomeada, alterada ou inserida fora de ordem interrompe a publicação.
- O runner copia, confere novamente o checksum e incorpora cada migration em um wrapper SQL UTF-8 sem BOM. O wrapper usa bloqueio exclusivo, `TRY`/`CATCH` e rollback explícito; não depende de `:r`, `$(variavel)` ou da montagem de SQL por `echo` do CMD.
- O runner bloqueia automaticamente `GO`, `USE`, `DROP`, criação/alteração de banco ou login e comandos de transação própria nas migrations. Dados reais também não são permitidos pela regra de revisão, mesmo que não exista bloqueio textual específico para isso.
- A mesma validação estática também bloqueia metacomandos `:r`, `:setvar`, `:on error` e variáveis `$(...)` do `sqlcmd`, que não são compatíveis com o wrapper atômico. Ela roda no `--check`, `--validate`, `--apply` e no gate de qualidade local.
- Correções posteriores usam uma nova versão; nunca se edita uma migration já aplicada.
- `sql/validation` é somente leitura. `sql/manual` não é executado pelo runner.

O bootstrap exige uma conta Windows com permissão de criar o banco dedicado. No desenvolvimento local autorizado, a API usa autenticação integrada da identidade Windows que executa a JVM; isso não substitui a identidade dedicada de mínimo privilégio exigida antes de produção. Nenhuma credencial de aplicação deve ser colocada no Git.
