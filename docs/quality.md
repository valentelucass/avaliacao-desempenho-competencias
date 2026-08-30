# Qualidade e verificações locais

## Gate local completo

Execute na raiz do repositório:

```powershell
.\scripts\verify-quality.ps1
```

O comando é um gate local. Ele não cria usuários, dados de negócio, migrations, processos PM2, regras de firewall ou rotas da Cloudflare.

| Área         | Verificação executada                                                                                                                                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repositório  | Scanner heurístico de segredos, análise de sintaxe dos scripts PowerShell versionáveis e validação estática do manifesto PM2. O scanner informa apenas arquivo, linha e categoria; nunca imprime o possível valor sensível.                    |
| Banco        | Nome, checksum e conteúdo permitido das migrations; depois, com o banco existente, reconciliação de histórico e validações SQL somente leitura.                                                                                                |
| Back-end     | Maven Enforcer, convergência/limite superior de dependências, Spotless, testes unitários, empacotamento e geração de SBOM CycloneDX.                                                                                                           |
| Front-end    | Prettier, Oxlint, Vitest, testes automatizados de acessibilidade com axe e build Vite/TypeScript.                                                                                                                                              |
| Dependências | `npm audit --audit-level=high` e verificação do SBOM Java pelo OSV Scanner. As consultas de vulnerabilidade dependem de conectividade externa; o binário oficial do scanner Java é fixado por versão e validado por SHA-256 antes da execução. |

Use o comando sem `-SkipDatabase` no banco local dedicado. A evidência de 2026-08-29 registra `V0001`–`V0013` reconciliadas em `AVALIACAO_DEV` e `AVALIACAO_PROD`. Use `-SkipDatabase` somente quando o alvo SQL Server não estiver disponível para o gate; essa opção ainda valida os arquivos de migration, mas não substitui a execução completa contra SQL Server antes da liberação.

## Acessibilidade

Os testes com axe cobrem regras automatizáveis nas jornadas principais e nos diálogos administrativos. A regra de contraste é desabilitada nesses testes porque o `jsdom` não implementa o canvas usado pelo axe para medir cores. Isso não substitui a revisão em navegador de contraste, foco visível, teclado, responsividade, zoom e leitor de tela no ambiente-alvo.

## Verificação operacional pré-publicação

`./scripts/check-operation.ps1` é somente leitura: confirma JDK, Node.js, npm, disponibilidade do comando PM2, serviço `cloudflared` e a exposição das portas privadas `18080`/`18081`. Ele alerta sobre firewall e diretório de logs, mas não altera nada e não é aceite de produção. O procedimento completo está em [Runbook de pré-publicação](operations/pre-publication-runbook.md).

Depois de uma publicação, `pm2 jlist | node .\scripts\validate-pm2-runtime.cjs` valida sem imprimir valores que os dois processos estão online, usam o release e as portas esperadas, possuem logs e não receberam chaves ou valores de ambiente fora da allowlist explícita e dos três metadados internos do PM2.

## Lacunas conhecidas

- O gate agora gera SBOM CycloneDX e o verifica com OSV Scanner, mas ainda não inclui SAST avançado independente, como SpotBugs ou Semgrep, nem CI em provedor. Isso não deve ser convertido em alegação de conformidade ou certificação.
- O cenário autenticado automatizado em `AVALIACAO_DEV` exercita a API/SPA locais, persistência SQL Server, autorização por papel e recurso, sessão/CSRF, feedback, indicadores e CSV com massa exclusivamente fictícia. Por decisão explícita, teste autenticado em `AVALIACAO_PROD` não faz parte deste encerramento técnico.
- Permanecem externos ao gate: carga e desempenho com dados aprovados, navegador/dispositivo e tecnologia assistiva manuais, política/agenda/criptografia dos backups, proxy/Cloudflare, firewall, monitoração e CI. O procedimento técnico de backup e restauração foi executado com sucesso em 2026-08-29, mas não substitui uma política de continuidade.

O estado canônico, as evidências executadas e os pré-requisitos externos para uso real ficam no [STATES.md](../STATES.md).
