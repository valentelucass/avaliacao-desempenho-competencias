# Runbook de pré-publicação

> Status: checklist de preparação. Este documento não autoriza publicação, alteração de Cloudflare, firewall, PM2 ou banco.

## Objetivo

Verificar de forma repetível o que precisa estar pronto antes de expor o sistema pelos hosts definidos. A topologia aprovada é Cloudflare Tunnel para serviços privados em `127.0.0.1:18080` (front-end) e `127.0.0.1:18081` (API).

## Verificações sem alteração

Execute na raiz antes de solicitar ou realizar uma publicação:

```powershell
.\scripts\verify-quality.ps1
.\scripts\check-operation.ps1
```

Também confirme o preflight do script de produção:

```bat
iniciar-prod.bat --check
```

Esse preflight lê os três ponteiros de ambiente diretamente ou do `.env` local ignorado pelo Git: `AVALIACAO_DESEMPENHO_PRODUCTION_CONFIG` aponta para um arquivo `.properties` externo ao repositório, `AVALIACAO_DESEMPENHO_PRODUCTION_API_BASE_URL=https://api-formulario.rodogarcia.com.br/api/v1` e `AVALIACAO_DESEMPENHO_PRODUCTION_LOG_DIRECTORY` aponta para um diretório externo existente. O `.env` contém apenas caminhos e a URL pública; os segredos ficam exclusivamente no `.properties` externo ou no mecanismo de segredos aprovado. Ele deve ser executado em uma janela de publicação ou depois de parar o modo de desenvolvimento: ambos reservam as mesmas portas privadas e o preflight falha de forma segura se elas já estiverem ocupadas por processos que não sejam os PM2 deste projeto.

O preflight de Java também pode ser chamado diretamente sem iniciar processo:

```powershell
.\scripts\run-backend.ps1 -ValidateOnly
```

`iniciar-dev.bat` não tem modo `--check`: ele é exclusivamente o launcher de desenvolvimento local com HTTPS. Nenhum dos comandos acima inicia ou reinicia processos. Se um deles falhar, interrompa a preparação e corrija a causa antes de qualquer publicação.

## Itens obrigatórios antes de uma nova publicação ou alteração operacional

| Item                 | Evidência necessária                                                                                       | Situação atual                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Configuração externa | Arquivo `.properties`, URL pública da API e diretório de logs fora do repositório validados pelo preflight | Configurada externamente; revalidar antes de qualquer alteração        |
| Cloudflare Tunnel    | Rotas dos dois hosts apontando para os serviços corretos no loopback e teste externo HTTPS                 | Hosts responderam `200` anonimamente em 2026-08-26; validar novamente e sem inferir aceite |
| Processos            | Processos PM2 exclusivos em execução, portas privadas e teste após reinício da VM                          | Online em 2026-08-26; recuperação após reinício da VM continua pendente |
| Logs                 | Local definido, acesso restrito, retenção e consulta de erro/correlação                                    | Pendente                                                               |
| Backup               | Procedimento do banco, responsável, retenção e restauração comprovada em ambiente seguro                   | Pendente                                                               |
| Atualização          | Artefato identificado, responsável, janela e comunicação                                                   | Pendente                                                               |
| Rollback             | Artefato anterior disponível e passo de retorno testado sem afetar outros processos PM2                    | Pendente                                                               |
| Segurança            | Checklist de aceite preenchida e pendências bloqueadoras resolvidas                                        | Pendente                                                               |

## Publicação controlada

Somente depois de autorização explícita para o alvo correto:

1. Registrar o responsável, horário, versão/artefato e forma de retorno.
2. Executar novamente as verificações sem alteração.
3. Configurar ou confirmar as duas rotas externas na Cloudflare. Não presumir que o túnel existente já pertence a este projeto.
4. Iniciar ou atualizar somente os processos `avaliacao-desempenho-backend-prod` e `avaliacao-desempenho-frontend-prod` pelo script do repositório.
5. Confirmar que cada processo escuta exclusivamente em loopback, que os hosts externos retornam o serviço esperado e que não há rota cruzada entre front-end e API.
6. Salvar a evidência do teste, registrar a versão em operação e configurar/testar a restauração após reinício da VM.

O script `iniciar-prod.bat` não configura Cloudflare, firewall, TLS de SQL Server, backup, política de logs, PM2 após reinício ou rollback automático.

## Parada e retorno

Interrompa a publicação se houver falha de validação, rota externa inesperada, escuta fora do loopback, ausência de backup/restauração comprovada, erro de autorização ou ausência do artefato anterior.

Um retorno seguro requer instrução operacional aprovada, preservação de evidências e intervenção somente nos dois processos PM2 deste projeto. Não apague banco, avaliações, logs ou processos de outros sistemas como parte do retorno.
