# Runbook de pré-publicação

> Status: checklist para uma nova publicação ou mudança operacional. O release técnico atual possui evidências próprias; este documento não autoriza alteração de Cloudflare, firewall, PM2 ou banco.

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

| Item                   | Evidência necessária                                                                                       | Situação atual                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Configuração externa   | Arquivo `.properties`, URL pública da API e diretório de logs fora do repositório validados pelo preflight | Configurada externamente; revalidar antes de qualquer alteração                                                      |
| Migrations             | Histórico completo e validações do runner nos alvos canônicos                                              | `V0001`–`V0013` reconciliadas em DEV e PROD em 2026-08-29                                                            |
| Identidade SQL e TLS   | Login dedicado, mínimo privilégio, ausência de acesso cruzado e certificado validado                       | Validador mínimo e conexão TLS aprovados; repetir após qualquer troca                                                |
| Cloudflare Tunnel      | HTTPS dos dois hosts, headers finais, HTTP→HTTPS, WAF/bot e limite de borda                                | HTTPS/headers finais validados; HTTP ainda retorna `200`, e redirecionamento/WAF/limite de borda permanecem externos |
| Porta SQL e firewall   | Acesso à 1433 restrito ao escopo aprovado sem afetar os demais bancos da instância compartilhada           | Pendente de inventário, regra e recuperação de infraestrutura                                                        |
| Processos              | Processos PM2 exclusivos, portas privadas, ambiente mínimo e teste após reinício da VM                     | Release e ambiente mínimo validados; recuperação após reinício da VM ainda precisa de ensaio operacional             |
| Logs                   | Local definido, acesso restrito, retenção, rotação e consulta de erro/correlação                           | Diretório externo restrito existe; retenção, rotação e alertas pendentes                                             |
| Dependências           | Scanner de segredos, auditorias npm/Java e SBOM no gate                                                    | Gate consolidado e gate do release aprovados em 2026-08-29                                                           |
| Backup                 | Política, responsável, retenção, criptografia/RPO-RTO e restauração comprovada em ambiente seguro          | Restauração técnica comprovada; política, agenda, retenção, criptografia e RPO/RTO pendentes                         |
| Atualização e rollback | Artefato identificado, responsável, janela, comunicação e retorno sem afetar outros processos PM2          | Evidência específica exigida em cada mudança                                                                         |
| Segurança e negócio    | Checklist de aceite, RH/LGPD, segundo administrador/custodiantes e validação assistiva manual              | Condições externas pendentes                                                                                         |

## Publicação controlada

Somente depois de autorização explícita para o alvo correto:

1. Registrar o responsável, horário, versão/artefato e forma de retorno.
2. Executar novamente as verificações sem alteração.
3. Configurar ou confirmar as duas rotas externas na Cloudflare. Não presumir que o túnel existente já pertence a este projeto.
4. Iniciar ou atualizar somente os processos `avaliacao-desempenho-backend-prod` e `avaliacao-desempenho-frontend-prod` pelo script do repositório.
5. Confirmar que cada processo escuta exclusivamente em loopback, que os hosts externos retornam o serviço esperado e que não há rota cruzada entre front-end e API.
   A validação de ambiente pode ser repetida sem expor valores:

   ```powershell
   pm2 jlist | node .\scripts\validate-pm2-runtime.cjs
   ```

6. Confirmar no endereço final HSTS/CSP/headers defensivos e, no Cloudflare, redirecionamento HTTP→HTTPS, WAF/bot protection e limite de borda conforme a decisão aprovada.
7. Salvar a evidência do teste, registrar a versão em operação e configurar/testar a restauração após reinício da VM.

O script `iniciar-prod.bat` não configura Cloudflare, firewall, TLS de SQL Server, backup, política de logs, PM2 após reinício ou rollback automático.

## Parada e retorno

Interrompa a publicação se houver falha de validação, rota externa inesperada, escuta fora do loopback, ausência de backup/restauração comprovada, erro de autorização ou ausência do artefato anterior.

Um retorno seguro requer instrução operacional aprovada, preservação de evidências e intervenção somente nos dois processos PM2 deste projeto. Não apague banco, avaliações, logs ou processos de outros sistemas como parte do retorno.
