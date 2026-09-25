# Runbook de pré-publicação

> Status: checklist para uma nova publicação ou mudança operacional. O release técnico atual possui evidências próprias; este documento não autoriza alteração de Cloudflare, firewall, PM2 ou banco.

## Objetivo

Verificar de forma repetível o que precisa estar pronto antes de expor o sistema pelos hosts definidos. A nova topologia usa Cloudflare Tunnel para serviços privados em `127.0.0.1:38080` (front-end) e `127.0.0.1:28081` (API). A troca de portas exige atualização coordenada das duas rotas externas antes da ativação.

## Recuperação da rota pública em 2026-09-23

Após a recuperação do PM2, os 14 nomes foram salvos e os serviços da Avaliação responderam HTTP 200 nas novas portas privadas. Os dois hostnames públicos inicialmente responderam HTTP 502. O serviço `cloudflared` usa token de conexão de túnel gerenciado remotamente; a VM não dispõe de credencial para editar as rotas na Cloudflare. A ponte local abaixo faz a configuração remota antiga alcançar as novas portas, sem reiniciar o PM2 ou alterar o código da aplicação. Após sua aplicação em 2026-09-23, os dois hosts públicos responderam HTTP 200.

Executar em PowerShell elevado da **mesma conta `RTR-SVW-002\suporte`**:

```powershell
.\scripts\repair-public-route.ps1
.\scripts\register-pm2-boot.ps1
```

O primeiro script verifica HTTP 200 nas novas portas, cadastra somente no loopback as pontes TCP `18080→38080` e `18081→28081`, testa as duas URLs públicas e, se necessário, também atende `::1`. Em 2026-09-23, bastaram as duas pontes IPv4. O segundo valida os 14 nomes em `dump.pm2` sem `ConvertFrom-Json`, solicita a senha da conta Windows, registra a tarefa `PM2-Projetos` para executar `pm2 resurrect` após o boot sem login e remove a entrada antiga de logon apenas depois do registro. A tarefa foi registrada com estado `Ready`; a entrada antiga foi removida. Ambos aceitam `-CheckOnly` para diagnóstico sem alteração. A tarefa ainda precisa de validação em um reinício real.

Quando as duas rotas remotas forem editadas diretamente para `38080`/`28081`, remover apenas as pontes criadas por este procedimento com `repair-public-route.ps1 -Remove`, depois de confirmar HTTP 200 nos hosts públicos. A ponte é uma etapa de recuperação e não substitui a atualização da configuração remota do túnel.

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
| Cloudflare Tunnel      | HTTPS dos dois hosts, headers finais, HTTP→HTTPS, WAF/bot e limite de borda                                | Dois hosts HTTP 200 após a ponte local; rotas remotas ainda exigem atualização direta quando houver acesso administrativo |
| Porta SQL e firewall   | Acesso à 1433 restrito ao escopo aprovado sem afetar os demais bancos da instância compartilhada           | Pendente de inventário, regra e recuperação de infraestrutura                                                        |
| Processos              | Processos PM2 exclusivos, portas privadas, ambiente mínimo e teste após reinício da VM                     | 14 nomes salvos no PM2, novas portas locais ativas e tarefa `PM2-Projetos` registrada; falta ensaio após reboot       |
| Logs                   | Local definido, acesso restrito, retenção, rotação e consulta de erro/correlação                           | Diretório externo restrito existe; retenção, rotação e alertas pendentes                                             |
| Dependências           | Scanner de segredos, auditorias npm/Java e SBOM no gate                                                    | Gate consolidado e gate do release aprovados em 2026-08-29                                                           |
| Backup                 | Política, responsável, retenção, criptografia/RPO-RTO e restauração comprovada em ambiente seguro          | Restauração técnica comprovada; política, agenda, retenção, criptografia e RPO/RTO pendentes                         |
| Atualização e rollback | Artefato identificado, responsável, janela, comunicação e retorno sem afetar outros processos PM2          | Evidência específica exigida em cada mudança                                                                         |
| Segurança e negócio    | Checklist de aceite, RH/LGPD, segundo administrador/custodiantes e validação assistiva manual              | Condições externas pendentes                                                                                         |

## Publicação controlada

Somente depois de autorização explícita para o alvo correto:

1. Registrar o responsável, horário, versão/artefato e forma de retorno.
2. Executar novamente as verificações sem alteração.
3. Preparar a troca coordenada das duas rotas externas na Cloudflare, com retorno às portas anteriores caso a nova origem falhe. Não presumir que a configuração remota já usa as novas portas.
4. Iniciar ou atualizar somente os processos `avaliacao-api-28081` e `avaliacao-front-38080` pelo script do repositório. O launcher remove os nomes anteriores `avaliacao-api-18081` e `avaliacao-front-18080` durante a migração; há uma janela de indisponibilidade até as rotas externas apontarem para as novas portas. O `pm2 save` do launcher só grava o novo snapshot após os dois listeners responderem.
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
