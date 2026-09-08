# Qualidade e verificações locais

## Gate local completo

Execute na raiz do repositório:

```powershell
.\scripts\verify-quality.ps1
```

O comando é um gate local. Ele não cria usuários, dados de negócio, migrations, processos PM2, regras de firewall ou rotas da Cloudflare.

O gate inclui regressões dos launchers com processos simulados e impressão/hover em Microsoft Edge headless instalado no caminho padrão do Windows. O teste do navegador usa componentes reais, o CSS compilado e dados inteiramente fictícios, sem conexão com a API; valida uma única página A4, 21 notas, ausência de espaço no topo, tamanho físico dos rótulos e alternativas desabilitadas sem hover. Para executá-lo isoladamente após o build: `node frontend/scripts/check-assessment-print.cjs`. Aguarda fontes e quadros de renderização antes das medições; não substitui o aceite da impressora real.

O mesmo ensaio também executa a [alternância de tema com cortina](operations/alternancia-tema-cortina.md) com React no Edge: animação real em 375/1440 px, Enter/foco, troca nos dois sentidos, tema das tabelas, campos preservados, movimento reduzido, impressão e desmontagem. A fixture é compilada em memória pelo Vite, sem modificar a SPA ou acessar API/dados reais.

Os [botões globais compactos](operations/botoes-globais.md) são medidos em 16 variantes/contextos, cinco larguras e dois temas (160 combinações), com contraste mínimo de texto, dimensões/ícones, rótulos, foco por Tab e ausência de hover nos inativos. A geração das fixtures é local; nenhuma operação de negócio é disparada.

A regressão de `Encerrar` é verificada adicionalmente no `RelationshipAdministrationPanel` real: coluna de ação estreita, ícone e texto em uma linha, altura compacta, confirmação/cancelamento e paginação. Há casos responsivos e densidades 1/1,5/2 nos dois temas. Reaplicar o CSS defeituoso precisa reproduzir a quebra, para comprovar que o teste detecta o problema relatado. Dados e API são fictícios; não se encerra vínculo real. Densidade/viewport emulados não substituem a validação manual de zoom.

| Área         | Verificação executada                                                                                                                                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repositório  | Scanner heurístico de segredos, análise de sintaxe dos scripts PowerShell versionáveis e validação estática do manifesto PM2. O scanner informa apenas arquivo, linha e categoria; nunca imprime o possível valor sensível.                    |
| Banco        | Nome, checksum e conteúdo permitido das migrations; depois, com o banco existente, reconciliação de histórico e validações SQL somente leitura.                                                                                                |
| Back-end     | Maven Enforcer, convergência/limite superior de dependências, Spotless, testes unitários, empacotamento e geração de SBOM CycloneDX.                                                                                                           |
| Front-end    | Prettier, Oxlint, Vitest, testes automatizados de acessibilidade com axe e build Vite/TypeScript.                                                                                                                                              |
| Dependências | `npm audit --audit-level=high` e verificação do SBOM Java pelo OSV Scanner. As consultas de vulnerabilidade dependem de conectividade externa; o binário oficial do scanner Java é fixado por versão e validado por SHA-256 antes da execução. |

Use o comando sem `-SkipDatabase` no banco local dedicado. O catálogo versionado atual contém `V0001`–`V0014`; a reconciliação somente leitura dos dois bancos foi registrada em 2026-09-08. Use `-SkipDatabase` somente quando o alvo SQL Server não estiver disponível para o gate; essa opção ainda valida os arquivos de migration, mas não substitui a execução completa contra SQL Server antes da liberação.

## Acessibilidade

O ensaio Edge também cobre as tabelas administrativas Reshaped em dez variações, cinco larguras (320 a 1440 px) e dois temas, verificando overflow, células visíveis, ausência de interatividade nas linhas passivas e preservação de estilos representativos fora das tabelas. Detalhes e limites em [tabelas-administrativas-reshaped.md](operations/tabelas-administrativas-reshaped.md).

Os testes com axe cobrem regras automatizáveis nas jornadas principais e nos diálogos administrativos. A regra de contraste é desabilitada nesses testes porque o `jsdom` não implementa o canvas usado pelo axe para medir cores. Isso não substitui a revisão em navegador de contraste, foco visível, teclado, responsividade, zoom e leitor de tela no ambiente-alvo.

## Verificação operacional pré-publicação

`./scripts/check-operation.ps1` é somente leitura: confirma JDK, Node.js, npm, disponibilidade do comando PM2, serviço `cloudflared` e a exposição das portas privadas `18080`/`18081`. Ele alerta sobre firewall e diretório de logs, mas não altera nada e não é aceite de produção. O procedimento completo está em [Runbook de pré-publicação](operations/pre-publication-runbook.md).

Depois de uma publicação, `pm2 jlist | node .\scripts\validate-pm2-runtime.cjs` valida sem imprimir valores que os dois processos estão online, usam o release e as portas esperadas, possuem logs e não receberam chaves ou valores de ambiente fora da allowlist explícita e dos três metadados internos do PM2.

## Lacunas conhecidas

- O gate agora gera SBOM CycloneDX e o verifica com OSV Scanner, mas ainda não inclui SAST avançado independente, como SpotBugs ou Semgrep, nem CI em provedor. Isso não deve ser convertido em alegação de conformidade ou certificação.
- O cenário autenticado automatizado em `AVALIACAO_DEV` exercita a API/SPA locais, persistência SQL Server, autorização por papel e recurso, sessão/CSRF, feedback, indicadores e CSV com massa exclusivamente fictícia. Por decisão explícita, teste autenticado em `AVALIACAO_PROD` não faz parte deste encerramento técnico.
- Permanecem externos ao gate: carga e desempenho com dados aprovados, navegador/dispositivo e tecnologia assistiva manuais, política/agenda/criptografia dos backups, proxy/Cloudflare, firewall, monitoração e CI. O procedimento técnico de backup e restauração foi executado com sucesso em 2026-08-29, mas não substitui uma política de continuidade.

O estado canônico, as evidências executadas e os pré-requisitos externos para uso real ficam no [STATES.md](../STATES.md).
