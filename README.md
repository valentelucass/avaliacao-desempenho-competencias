# Avaliação de Desempenho e Competências

Aplicação interna para avaliações de colaboradores, com cálculo no servidor, classificação versionada e indicadores consolidados. As regras vigentes estão em [AGENTS.md](AGENTS.md), [STATES.md](STATES.md) e na [Regra operacional 2024.1](docs/business/regras-operacionais-v1.md).

## Estado da entrega

O código-fonte implementa autenticação local, administração de acesso, cadastros, questionários, ciclos, avaliações de gestor e autoavaliação, indicadores agregados e exportação CSV. A SPA cobre login, troca de senha, avaliações e indicadores.

Em 2026-08-26, os bancos canônicos `AVALIACAO_DEV` e `AVALIACAO_PROD` foram reconciliados até `V0010`; a validação somente leitura confirmou o catálogo inicial, sem ciclos, lotações, vínculos, atribuições ou avaliações. Na mesma evidência, a verificação anônima de `https://formulario.rodogarcia.com.br/` e de `GET /api/v1/auth/csrf` retornou `200`, com os dois processos PM2 do projeto online. A fonte já contém a `V0011`, que restringe a autoridade do Administrador e normaliza contas administrativas legadas para perfil único, preservando o histórico; ela permanece pendente de aplicação autorizada nos alvos canônicos. Isso confirma a disponibilidade observada naquele momento, não um aceite de negócio, uma jornada autenticada de ponta a ponta, autorização para alterar produção ou o uso de dados reais. As flags persistidas continuam desabilitadas por padrão na configuração versionada; qualquer ativação, alteração de banco ou publicação posterior exige alvo, autorização e validação próprios. Veja [Configuração externa da aplicação](docs/operations/configuracao-externa-da-aplicacao.md) antes de qualquer operação em outro alvo.

## Estrutura

```text
.
├── backend/                 # API Java / Spring Boot
├── database/                # Bootstrap e migrations SQL Server
├── frontend/                # SPA React + TypeScript / Vite
├── docs/                    # Arquitetura, negócio, operação e segurança
├── scripts/                 # Verificações locais não interativas
├── AGENTS.md                # Regras operacionais do projeto
└── STATES.md                # Estado, evidências e pendências
```

## Pré-requisitos de desenvolvimento

- JDK 21 ou superior; a VM está padronizada no Temurin JDK 25.0.2.
- Node.js 24.18.0 e npm 11.16.0.
- Acesso à internet somente para restaurar/auditar dependências de desenvolvimento.

## Verificação local

Na raiz, execute:

```powershell
.\scripts\verify.ps1
```

Para o gate de fonte completo, incluindo scanner heurístico de segredos, scripts PowerShell, migrations estáticas, testes, lint, acessibilidade e auditoria npm, execute:

```powershell
.\scripts\verify-quality.ps1 -SkipDatabase
```

Use o gate sem `-SkipDatabase` para validar o banco local dedicado, que já está reconciliado com todas as migrations. Use `-SkipDatabase` somente quando o alvo SQL Server não estiver disponível para a verificação; essa opção não substitui a validação contra o banco antes de uma liberação.

Também é possível validar os projetos separadamente:

```powershell
Set-Location backend
.\mvnw.cmd verify
```

```powershell
Set-Location frontend
npm ci
npm run format:check
npm run lint
npm test
npm run build
```

## Banco SQL Server

Os bancos exclusivos são `AVALIACAO_DEV` e `AVALIACAO_PROD`. A evidência mais recente registra `V0001`–`V0010` reconciliadas nos dois alvos e catálogo inicial sem ciclos, lotações, vínculos, atribuições ou avaliações; a `V0011` está em fonte e aguarda aplicação autorizada. Não aplique migrations em outro alvo, crie conta SQL ou cadastre dados de negócio sem autorização explícita e ambiente alvo confirmado.

Para inspeção sem alteração:

```bat
database\executar-database.bat --check
database\executar-database.bat --validate
```

No alvo local atual, `--validate` deve ficar verde porque o banco já está reconciliado. `--apply` exige confirmação literal e altera o banco; não faz parte da verificação de desenvolvimento.

## Desenvolvimento local

```bat
iniciar-dev.bat
```

Este é o único launcher canônico de desenvolvimento e é separado de `iniciar-prod.bat`. Ele inicia a SPA e a API somente em loopback com HTTPS local, configura o proxy Vite de `/api` e usa autenticação integrada da identidade Windows do processo para o SQL Server. Cada nova execução encerra somente os processos Java/Vite identificados como pertencentes a este repositório e os reinicia nas portas fixas `5181` e `5180`; se uma porta pertencer a outro processo, falha sem encerrá-lo. As portas privadas de produção `18080` e `18081` não são usadas pelo modo de desenvolvimento. O terminal permanece em execução enquanto o modo local estiver ativo; use `Ctrl+C` para encerrar somente a API e o front-end iniciados por aquele terminal. O launcher não compila a API nem instala dependências: ele exige um JAR atual em `backend/target` e dependências atuais em `frontend/node_modules`, preparados pelo fluxo de produção autorizado. Por padrão, o navegador não é aberto; para solicitá-lo explicitamente, use `iniciar-dev.bat --open-browser`.

`ecosystem.config.cjs` é o manifesto PM2 de produção. Ele não lê `.env`, não contém credenciais e só aceita caminhos, portas, JAR, executáveis e diretório de logs fornecidos pelo `iniciar-prod.bat` após o preflight. O launcher o utiliza para recriar individualmente apenas `avaliacao-desempenho-backend-prod` e `avaliacao-desempenho-frontend-prod` com reinício automático e backoff; não execute esse manifesto manualmente fora do launcher.

O launcher mantém o segredo de sessão e o PFX de execução apenas durante o processo, sem gravá-los no Git. Ele não publica a aplicação nem configura Tunnel, PM2, firewall ou produção. As demais propriedades, a sequência segura e os limites de operação ficam em [Configuração externa da aplicação](docs/operations/configuracao-externa-da-aplicacao.md).

## Contrato e segurança

- [Contrato HTTP v1](docs/api/contrato-http-v1.md)
- [Fundação de segurança HTTP](docs/security/fundacao-seguranca-http.md)
- [Modelo relacional lógico](docs/architecture/modelo-relacional-logico.md)
- [Qualidade e verificações locais](docs/quality.md)

O Administrador administra a plataforma e não é autoridade para publicar ou reabrir avaliações, consultar indicadores ou exportar dados: essas ações exigem Gerência de RH ou Diretoria, além da permissão e do escopo aplicáveis. Indicadores só retornam agregados com pelo menos cinco colaboradores distintos após os filtros. A validação autenticada contra SQL Server, Tunnel/TLS, backup/restauração, ASVS/LGPD e aceite de negócio ainda permanece necessária.
