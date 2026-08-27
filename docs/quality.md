# Qualidade e verificações locais

## Gate local completo

Execute na raiz do repositório:

```powershell
.\scripts\verify-quality.ps1
```

O comando é um gate local. Ele não cria usuários, dados de negócio, migrations, processos PM2, regras de firewall ou rotas da Cloudflare.

| Área         | Verificação executada                                                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repositório  | Scanner heurístico de segredos e análise de sintaxe de todos os scripts PowerShell versionáveis. O scanner informa apenas arquivo, linha e categoria; nunca imprime o possível valor sensível.s |
| Banco         | Nome, checksum e conteúdo permitido das migrations; depois, com o banco existente, reconciliação de histórico e validações SQL somente leitura.                                                |
| Back-end      | Maven Enforcer, convergência/limite superior de dependências, Spotless, testes unitários e empacotamento.                                                                                         |
| Front-end     | Prettier, Oxlint, Vitest, teste de acessibilidade com axe e build Vite/TypeScript.                                                                                                                   |
| Dependências | `npm audit --audit-level=high`. Essa etapa consulta o registro npm e requer conectividade externa.                                                                                                 |

Use o comando sem `-SkipDatabase` no banco local dedicado. A evidência de 2026-08-26 registra `V0001`–`V0010` reconciliadas em `AVALIACAO_DEV` e `AVALIACAO_PROD`; a `V0011` da fonte aguarda aplicação e validação autorizadas. Use `-SkipDatabase` somente quando o alvo SQL Server não estiver disponível para o gate; essa opção ainda valida os arquivos de migration, mas não substitui a execução completa contra SQL Server antes da liberação.

## Acessibilidade

O teste com axe cobre regras automatizáveis na tela disponível. A regra de contraste é desabilitada nesse teste porque o `jsdom` não implementa o canvas usado pelo axe para medir cores. Isso não substitui a revisão em navegador de contraste, foco visível, teclado, responsividade e leitores de tela quando houver os fluxos reais.

## Verificação operacional pré-publicação

`./scripts/check-operation.ps1` é somente leitura: confirma JDK, Node.js, npm, disponibilidade do comando PM2, serviço `cloudflared` e a exposição das portas privadas `18080`/`18081`. Ele alerta sobre firewall e diretório de logs, mas não altera nada e não é aceite de produção. O procedimento completo está em [Runbook de pré-publicação](operations/pre-publication-runbook.md).

## Lacunas conhecidas

- Não há scanner de vulnerabilidades Java/SBOM contínuo, SpotBugs, Semgrep, Gitleaks, Trivy, OSV Scanner ou PSScriptAnalyzer instalados. Não os substitua por alegação de conformidade; a validação atual é uma base local proporcional ao estado do projeto.
- Ainda não há testes de integração reais com SQL Server, contrato HTTP, interface fim a fim, navegador/dispositivo, carga, backup/restauração ou CI em provedor.
- Autenticação persistida, JWT, autorização por vínculo e recurso, auditoria, limiter e módulos de negócio estão implementados no código-fonte, mas não foram validados contra SQL Server real, proxy/Tunnel ou em fluxo fim a fim. Portanto essas propriedades não podem ser certificadas para produção.

As lacunas permanecem em `ADC-007`, `ADC-008` a `ADC-014` no [STATES.md](../STATES.md).
