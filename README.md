# Avaliação de Desempenho e Competências

Aplicação interna para avaliações de colaboradores, com cálculo no servidor, classificação versionada e indicadores consolidados. As regras vigentes estão em [AGENTS.md](AGENTS.md), [STATES.md](STATES.md) e na [Regra operacional 2024.1](docs/business/regras-operacionais-v1.md).

## Publicar atualizações na VM

Antes de publicar, a conta de operação pode conferir a credencial do SQL Server e a estrutura do `AVALIACAO_PROD` em modo de leitura. [Procedimento no manual do banco](database/README.md#conferir-a-credencial-antes-de-publicar-na-vm).

Execute `iniciar-prod.bat` sem argumentos para validar, compilar e publicar as atualizações de código. O comando mostra as etapas no terminal e mantém o gate de qualidade antes da publicação. `--publicar` continua aceito como equivalente. Ao terminar com sucesso, acesse https://formulario.rodogarcia.com.br/.

O frontend candidato e as capturas de teste ficam em `backend/target/frontend-staging/<id>/`, fora da pasta servida. A URL pública da API é aplicada somente ao build candidato; os testes de navegador usam dados fictícios e transporte isolado. Depois de todo o gate passar, o launcher confere os hashes aprovados, preserva um backup e promove os arquivos, com troca atômica do index por último. Falhas no gate preservam a tela em uso; erros durante a promoção acionam a recuperação dos arquivos anteriores antes de qualquer operação PM2.

Na atualização das dependências, o BAT valida o lockfile com `npm ci --dry-run --ignore-scripts` e instala suas versões com `npm install --no-save --include=dev`, conferindo a árvore e o hash do lockfile ao terminar. Isso evita a limpeza integral de `node_modules` que falha no Windows quando o preview mantém um módulo nativo aberto. Falhas de instalação ou divergência do lockfile interrompem o fluxo antes do gate e do reinício.

O rodapé interno exibe a data/hora da build carregada, em horário de Brasília, ao lado de “Ambiente interno”. Cada build de produção gera automaticamente uma nova marca; após a publicação, recarregue a página para conferir a versão recebida. A marca identifica a compilação do frontend, não a hora de abertura da página nem a conclusão do deploy da API. Em desenvolvimento, aparece “Build de desenvolvimento”.

Não é necessário parar a Avaliação no PM2 antes. Se o gerenciador existente recusar acesso por permissão, o launcher solicita o UAC da mesma conta e acompanha a saída no terminal original, com log privado no caminho informado. Cancelar o UAC interrompe a publicação. PM2 ausente ou ainda inacessível após elevação bloqueia o fluxo antes do build; o launcher não tenta criar outro gerenciador. `--check` permanece somente diagnóstico, sem solicitar elevação.

A publicação não solicita login ou senha SQL. A validação do banco usa a credencial DPAPI apontada por `ADC_DATABASE_CREDENTIAL_FILE` no arquivo local de produção (ou autenticação já configurada no processo). Credencial ausente ou inválida encerra com erro, sem prompt. A identidade operacional do runner é independente da conta da API; senhas não ficam no BAT nem no Git.

Para iniciar a versão já instalada, use `iniciar-prod.bat --subir` e confirme o UAC do Windows, quando solicitado. O comando confere a definição salva no PM2 e o hash SHA-256 do arquivo da API registrado na publicação. Ele verifica a conexão com o banco, atualiza a confiança TLS se o certificado local mudou e recupera os processos da Avaliação e as duas pontes de acesso público conforme necessário.

Na VM atual, a tarefa `Rodogarcia-Avaliacao-SQL-Recovery` verifica mudanças do processo SQL a cada minuto e recupera a conexão da API. Ela aguarda o banco voltar e não reinicia o SQL. Se a API foi parada pelo operador, use `iniciar-prod.bat --subir` para subi-la sem publicar código novo. Recibos ficam em `C:\ProgramData\Rodogarcia\AvaliacaoDesempenho\production\sql-recovery`; `REVIEW_PARTIAL_RECOVERY` exige revisão do recibo antes de outra recuperação automática.

`--check` conserva o diagnóstico de pré-requisitos de publicação; `--start-prepared` é um modo legado, dispensável no fluxo normal. A recuperação com `--subir` pressupõe o gerenciador PM2 existente e os dois processos cadastrados com a definição aprovada; divergências são informadas, sem criar um gerenciador concorrente.

## Estado da entrega

O código-fonte implementa autenticação local, administração de acesso, cadastros, questionários, ciclos, avaliações de gestor e autoavaliação, indicadores agregados e exportação CSV. A SPA cobre login, troca de senha, avaliações e indicadores.

Na administração de ciclos, a consulta distingue a situação `ABERTO` da vigência do prazo e mostra a configuração preservada. Com `CICLOS.GERIR`, um ciclo ainda aberto pode ter somente seu encerramento prorrogado para uma data futura posterior ao encerramento atual, mediante motivo e auditoria. Ciclos encerrados permanecem imutáveis. Essa ação exige `V0016` validada antes da publicação da API; veja a [regra de prorrogação](docs/business/regras-operacionais-v1.md#prorrogação-auditada-do-encerramento--19102026) e a [sequência de publicação](docs/operations/pre-publication-runbook.md#publicação-da-prorrogação-de-ciclos).

O inventário de 2026-08-26 é histórico: naquela data, `AVALIACAO_DEV` e `AVALIACAO_PROD` estavam reconciliados até `V0010`, com catálogo inicial e sem ciclos, lotações, vínculos, atribuições ou avaliações; a `V0011` ainda aguardava aplicação. Na mesma verificação, o frontend público e `GET /api/v1/auth/csrf` retornaram `200`. Esse retrato não descreve o conteúdo nem as migrations atuais dos bancos. Consulte [STATES.md](STATES.md) para as evidências posteriores e revalide o alvo antes de operar. As flags persistidas continuam desabilitadas por padrão na configuração versionada; ativação, alteração de banco e publicação exigem alvo, autorização e validação próprios. Veja [Configuração externa da aplicação](docs/operations/configuracao-externa-da-aplicacao.md) antes de qualquer operação em outro alvo.

## Estrutura

O Tailwind 4 usa `@tailwindcss/postcss` e carrega `tailwind.config.ts` explicitamente em `visual-skin.css` para compilar os tokens usados por `@apply`. Essa folha não importa Preflight ou utilities, preservando os estilos globais da aplicação. A migração e seus ensaios estão registrados em ADC-DEPS-20261013 no `STATES.md`.

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

- JDK 21 a 25. Os launchers DEV e PROD preservam `JAVA_HOME` quando compatível; caso contrário, procuram um JDK instalado nas pastas Eclipse Adoptium/Java do usuário e de Program Files. A seleção vale somente para o processo, sem alterar a configuração global do Windows.
- Node.js 24.18.0 e npm 11.16.0.
- Acesso à internet somente para restaurar/auditar dependências de desenvolvimento.

## Verificação local

Os scripts `verify.ps1` e `verify-quality.ps1` constroem o frontend em staging e mantêm `frontend/dist` preservado. O comando direto `npm run build` usa o diretório de saída padrão; execute-o em uma cópia isolada quando `frontend/dist` estiver em produção. Para verificar o projeto pelo fluxo isolado:

```powershell
.\scripts\verify.ps1
```

Para o gate de fonte completo, incluindo scanner heurístico de segredos, scripts PowerShell, migrations estáticas, testes, lint, acessibilidade e auditoria npm, execute:

```powershell
.\scripts\verify-quality.ps1 -SkipDatabase
```

Use o gate sem `-SkipDatabase` quando o banco dedicado autorizado estiver disponível para validação. `-SkipDatabase` não substitui a validação contra o banco antes de uma liberação.

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

Os bancos exclusivos são `AVALIACAO_DEV` e `AVALIACAO_PROD`. O inventário de `V0001`–`V0010` e catálogo vazio descrito acima corresponde a 26/08/2026; o estado posterior está registrado em [STATES.md](STATES.md) e deve ser conferido no alvo. Não aplique migrations em outro alvo, crie conta SQL ou cadastre dados de negócio sem autorização explícita e ambiente alvo confirmado.

Para inspeção sem alteração:

```bat
database\executar-database.bat --check
database\executar-database.bat --validate
```

`--validate` confere o alvo e informa eventuais divergências; um registro histórico não garante seu resultado atual. `--apply` exige confirmação literal e altera o banco; não faz parte da verificação de desenvolvimento.

## Desenvolvimento local

```bat
iniciar-dev.bat
```

Este é o único launcher canônico de desenvolvimento e é separado de `iniciar-prod.bat`. Ele inicia a SPA e a API somente em loopback com HTTPS local, configura o proxy Vite de `/api` e usa autenticação integrada da identidade Windows do processo para o SQL Server. Cada nova execução encerra somente os processos Java/Vite identificados como pertencentes a este repositório e os reinicia nas portas fixas `5181` e `5180`; se uma porta pertencer a outro processo, falha sem encerrá-lo. As portas privadas de produção `38080` e `28081` não são usadas pelo modo de desenvolvimento. O terminal permanece em execução enquanto o modo local estiver ativo; use `Ctrl+C` para encerrar somente a API e o front-end iniciados por aquele terminal. O launcher seleciona um JDK compatível antes de compilar a API em `backend/target/dev-local-releases`; ele não instala dependências do frontend e exige uma instalação atual em `frontend/node_modules`. Por padrão, o navegador não é aberto; para solicitá-lo explicitamente, use `iniciar-dev.bat --open-browser`.

`ecosystem.config.cjs` é o manifesto PM2 de produção. Ele não lê `.env`, não contém credenciais e só aceita caminhos, portas, JAR, executáveis e diretório de logs fornecidos pelo `iniciar-prod.bat` após o preflight. O launcher o utiliza para recriar individualmente apenas `avaliacao-desempenho-backend-prod` e `avaliacao-desempenho-frontend-prod` com reinício automático e backoff; não execute esse manifesto manualmente fora do launcher.

O launcher mantém o segredo de sessão e o PFX de execução apenas durante o processo, sem gravá-los no Git. Ele não publica a aplicação nem configura Tunnel, PM2, firewall ou produção. As demais propriedades, a sequência segura e os limites de operação ficam em [Configuração externa da aplicação](docs/operations/configuracao-externa-da-aplicacao.md).

## Contrato e segurança

- [Contrato HTTP v1](docs/api/contrato-http-v1.md)
- [Fundação de segurança HTTP](docs/security/fundacao-seguranca-http.md)
- [Modelo relacional lógico](docs/architecture/modelo-relacional-logico.md)
- [Qualidade e verificações locais](docs/quality.md)

O Administrador administra a plataforma e não recebe autoridade sobre avaliações ou indicadores. RH e Diretoria publicam avaliações; o Gestor também pode publicar avaliação de equipe do tipo `GESTOR` de sua autoria, enviada, com permissão de avaliar vinculados e vínculo vigente, conforme a decisão de 13/10/2026. Reabertura, indicadores e exportação continuam exigindo RH ou Diretoria e o escopo aplicável. Indicadores só retornam agregados com pelo menos cinco colaboradores distintos após os filtros. Evidências de SQL Server, Tunnel/TLS, backup/restauração e aceites estão em [STATES.md](STATES.md) e exigem validação própria para cada alvo.
