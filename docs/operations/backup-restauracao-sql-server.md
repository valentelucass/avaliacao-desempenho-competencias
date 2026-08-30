# Teste controlado de backup e restauração do SQL Server

> Status: procedimento operacional opt-in. Este documento e o script associado não autorizam sua execução. A janela, o alvo, o impacto, a proteção do artefato e a limpeza precisam ser aprovados antes do uso.

## Escopo e travas

O script [`database/scripts/testar-backup-restauracao-producao.ps1`](../../database/scripts/testar-backup-restauracao-producao.ps1) aceita exclusivamente a instância local `localhost,1433` e o banco `AVALIACAO_PROD`. Ele exige simultaneamente `-Execute` e a confirmação textual literal abaixo. A conexão usa autenticação integrada, TLS com validação do certificado e uma sessão DBA local; nenhuma credencial é recebida ou impressa.

Antes de qualquer escrita, o procedimento confirma:

- que a instância pertence à máquina local e o banco-fonte está `ONLINE`, gravável e em acesso normal;
- que o marcador técnico identifica este projeto;
- que todas as migrations e seus SHA-256 correspondem à fonte versionada;
- que não existe clone anterior com o prefixo reservado;
- que os diretórios padrão de backup, dados e log da instância existem e ficam fora do repositório;
- que a sessão possui autoridade DBA para criar, restringir e descartar somente o clone desta execução.

## Execução autorizada

Execute apenas no console protegido da VM e em uma janela previamente aprovada:

```powershell
.\database\scripts\testar-backup-restauracao-producao.ps1 `
  -Execute `
  -ConfirmationText 'TESTAR BACKUP E RESTAURACAO AVALIACAO_PROD' `
  -RemoveBackupAfterValidation
```

`-RemoveBackupAfterValidation` é a autorização explícita para remover, somente depois do sucesso integral, o arquivo único criado pelo próprio script. Use esse modo quando a execução serve apenas como teste e o ambiente ainda não possui criptografia em repouso aprovada. Sem o switch, o arquivo permanece sujeito à política de retenção; esse modo só deve ser usado quando a proteção e a retenção já estiverem aprovadas.

O script informa somente etapas e um identificador técnico aleatório. Ele não imprime caminho de arquivo, identidade SQL, conteúdo, contagem de negócio ou dado pessoal.

## O que o procedimento faz

1. Gera um arquivo novo e exclusivo no diretório padrão de backup da instância com `COPY_ONLY`, `CHECKSUM` e `COMPRESSION`. Ele não substitui um arquivo existente nem altera a base diferencial.
2. Executa `RESTORE VERIFYONLY WITH CHECKSUM` e confere no cabeçalho o banco-fonte, `COPY_ONLY`, checksum e compressão.
3. Lê a lista de arquivos e restaura em caminhos exclusivos sob os diretórios padrão de dados e log. O nome do clone é aleatório, reservado e inexistente antes do teste.
4. Marca o clone com o identificador da execução, aplica `RESTRICTED_USER` e `READ_ONLY`, executa `DBCC CHECKDB` e reconcilia o marcador do projeto e o histórico integral das migrations.
5. No bloco de limpeza, valida novamente nome, horário de criação e marcador antes de colocar somente esse clone em `SINGLE_USER` e executar `DROP DATABASE`.
6. Quando `-RemoveBackupAfterValidation` foi informado, valida novamente diretório, nome, extensão, identificador, horário, catálogo, tamanho, checksum e presença física antes de pedir ao próprio serviço SQL Server que apague apenas o arquivo desta execução. Qualquer divergência falha fechada e preserva o arquivo para análise protegida.

A aplicação, seus processos PM2 e o banco-fonte não são parados, reiniciados ou reconfigurados pelo procedimento.

## Impacto e proteção de dados

- O backup e a restauração geram I/O, uso de CPU e ocupação temporária de disco. A janela deve considerar o tamanho atual do banco e espaço suficiente para o arquivo de backup e o clone completo.
- O backup e o clone contêm a mesma classificação de dados do banco-fonte. O diretório padrão precisa ter acesso restrito e proteção em repouso previamente aprovada.
- Este script não cria certificado de backup, TDE, BitLocker, job, alerta, retenção ou cópia externa. `CHECKSUM` e TLS não substituem criptografia em repouso.
- Sem `-RemoveBackupAfterValidation`, o arquivo permanece no diretório padrão ao final. Isso preserva o artefato validado, mas sua retenção e remoção dependem de uma política autorizada.
- Com `-RemoveBackupAfterValidation`, o arquivo só é apagado depois de `VERIFYONLY`, restauração, `DBCC CHECKDB`, migrations e limpeza do clone concluírem. A remoção é irreversível e o procedimento informa explicitamente sua conclusão.
- O clone é temporário e não fica disponível à identidade da aplicação depois da restauração, pois é restringido e colocado em somente leitura antes das verificações.

## Retorno e falhas

O backup é aditivo e `COPY_ONLY`; portanto não há alteração de schema, dado ou cadeia diferencial a desfazer no banco-fonte. O retorno normal consiste em descartar somente o clone criado, ação executada automaticamente no `finally` inclusive quando uma validação posterior falha.

A limpeza automática se recusa a usar curinga ou nome informado pelo operador. Ela só descarta o nome aleatório gerado nesta execução quando o horário de criação e, quando disponível, o marcador técnico também conferem. `AVALIACAO_PROD` nunca é um alvo aceito pela rotina de limpeza.

Se a VM ou o processo for interrompido antes do `finally`, suspenda novas execuções. Um DBA autorizado deve usar o identificador técnico exibido para localizar exatamente o clone com o prefixo reservado, confirmar o marcador `ADC_RECOVERY_TEST_RUN_ID` e só então removê-lo. Não execute limpeza em massa por prefixo. O arquivo de backup correspondente também deve ser tratado individualmente pela política aprovada; não o remova apenas por uma correspondência ampla de nome. Mesmo com o switch, um arquivo parcial ou não validado é preservado em caso de falha para evitar exclusão automática baseada em estado incompleto.

Falhas são apresentadas apenas por referência técnica sanitizada. Diagnóstico que exija caminho, identidade ou detalhe do SQL Server deve ocorrer em sessão DBA protegida e não deve ser copiado para Git, `STATES.md`, tickets públicos ou respostas.

## Evidência de encerramento

Uma execução só comprova a restauração quando termina com as confirmações de backup criado, `VERIFYONLY`, restauração isolada, `DBCC CHECKDB` sem inconsistência, migrations reconciliadas e clone descartado. Quando o switch de remoção for usado, a confirmação final também precisa registrar que o arquivo único foi apagado. Registre em local protegido o responsável, a janela, o identificador técnico, o horário, o resultado e a política aplicada ao arquivo.

Esse teste pontual não define RPO, RTO, frequência, backups de log, retenção, alerta nem criptografia. Esses controles continuam exigindo decisão operacional própria.
