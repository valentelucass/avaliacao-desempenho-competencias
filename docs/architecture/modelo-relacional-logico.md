# Modelo relacional lógico — SQL Server

| Campo           | Valor                                                                                                                                                                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status          | `V0001`–`V0007` estão aplicadas e reconciliadas no banco local dedicado. Elas incluem a regra operacional, a extensão RBAC e a aplicabilidade de questionário `2024.1`; não há dados de negócio semeados nem esse estado é automaticamente aceito em outro ambiente. |
| Origem          | ADC-006, regras de `AGENTS.md`, ADR-0003, ADR-0011, decisões registradas no `STATES.md` e [Regra operacional 2024.1](../business/regras-operacionais-v1.md).                                                                                                         |
| Banco-alvo      | Microsoft SQL Server.                                                                                                                                                                                                                                                |
| Testes afetados | Migrations futuras, integridade referencial, concorrência, autorização por escopo, sessões, auditoria, histórico e retenção.                                                                                                                                         |

## Princípios

- `usuario` e `colaborador` são registros diferentes. A `V0005` introduz `vinculo_usuario_colaborador`; uma conta ativa e um colaborador ativo só podem ter um vínculo vigente cada.
- Campos livres de colaborador e gestor servem à identificação operacional. Somente a conta autenticada, a permissão e o vínculo gestor–colaborador concedem acesso.
- Identificadores são opacos, horários são UTC, notas usam decimal e rascunhos usam revisão ou `rowversion`; não usar `float` para nota. Nota final persistida é sempre `decimal` no intervalo fechado de 80 a 120.
- Histórico de ciclo, questionário, cálculo, classificação, lotação, avaliação e auditoria é preservado. Nenhuma mudança futura reinterpreta silenciosamente avaliação publicada.
- Senha, hash de token em texto, token de renovação em texto, código de recuperação e comentário integral de avaliação não entram em auditoria.

## Blocos de entidades

| Bloco                    | Entidades lógicas                                                                                                                                                                          | Finalidade                                                                                                                                                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identidade               | `usuario`, `credencial_local`, `papel`, `permissao`, `atribuicao_papel`, `papel_permissao`, `concessao_permissao_usuario`                                                                  | Conta local, papéis e permissões explícitas. `credencial_local` guarda somente hash, algoritmo e datas de troca. A `V0002` semeia o catálogo inicial; a `V0006` acrescenta `COLABORADOR`, permissões mínimas v2024.1 e `ACESSOS.NEGOCIO.GERIR`. A única conta local de desenvolvimento recebeu somente o papel técnico `ADMINISTRADOR_PLATAFORMA`. |
| Sessão                   | `sessao_autenticacao`, `token_renovacao`                                                                                                                                                   | Sessões revogáveis, família/rotação, expiração e hash do token de renovação; nunca o token puro.                                                                                                                                                                                                                                                   |
| Administrador supremo    | `solicitacao_alteracao_adm_supremo`, `aprovacao_alteracao_adm_supremo`, `custodiante_recuperacao`, `recuperacao_adm_supremo`, `autorizacao_recuperacao`                                    | Dupla atuação, custodiantes e recuperação única definidos na ADR-0003.                                                                                                                                                                                                                                                                             |
| Cadastro mestre          | `colaborador`, `filial`, `area`, `lotacao_colaborador`, `vinculo_usuario_colaborador`                                                                                                      | Cadastro operacional e histórico de área/filial. A `V0005` acrescenta o vínculo explícito entre conta local e colaborador, necessário para autoavaliação; CPF e cargo continuam fora do schema.                                                                                                                                                    |
| Escopo do gestor         | `vinculo_gestor_colaborador`                                                                                                                                                               | Autoridade de acesso entre a conta do gestor e o colaborador, com vigência e autoria da alteração. A `V0005` acrescenta unicidade filtrada para apenas um vínculo ativo por colaborador.                                                                                                                                                           |
| Ciclos e questionários   | `ciclo_avaliacao`, `ciclo_questionario`, `questionario`, `versao_questionario`, `competencia`, `versao_competencia`, `questionario_competencia`, `pergunta_questionario`, `opcao_resposta` | A `V0003` criou a estrutura vazia; a `V0005` acrescenta obrigatoriedade, pontos, fuso, habilitação de autoavaliação, configuração/matriz do ciclo e gatilhos de imutabilidade.                                                                                                                                                                     |
| Aplicabilidade           | `atribuicao_questionario_colaborador`                                                                                                                                                      | A `V0007` determina um único `ciclo_questionario` ativo por colaborador e ciclo, com autoria, revogação auditável e vínculo composto que impede questionário livre na avaliação.                                                                                                                                                                   |
| Cálculo e faixas         | `configuracao_calculo_versao`, `matriz_classificacao_versao`, `faixa_classificacao`                                                                                                        | Criadas pela `V0005` para identificar os parâmetros `2024.1` usados no ciclo. A fórmula continua código de domínio versionado, não expressão arbitrária gravada no banco.                                                                                                                                                                          |
| Avaliações               | `avaliacao`, `versao_avaliacao`, `resposta_avaliacao`, `transicao_avaliacao`, `resultado_avaliacao`                                                                                        | A `V0004` sustenta rascunho, envio e histórico. A `V0005` adiciona GESTOR/AUTOAVALIACAO, resultado imutável, comentário/plano opcionais e reabertura registrada.                                                                                                                                                                                   |
| Auditoria e idempotência | `evento_auditoria`, `chave_idempotencia`                                                                                                                                                   | Trilha append-only para ações críticas e reenvio seguro de operações HTTP.                                                                                                                                                                                                                                                                         |
| Retenção                 | `politica_retencao_versao`, `execucao_retencao`                                                                                                                                            | Avaliações e históricos não têm exclusão automática. Estrutura reservada para eventual política futura formal de descarte.                                                                                                                                                                                                                         |

## Relações principais

```text
usuario ──< atribuicao_papel >── papel ──< papel_permissao >── permissao
   │
   ├──< vinculo_usuario_colaborador >── colaborador ──< lotacao_colaborador >── filial / area
   │
   ├──< vinculo_gestor_colaborador >── colaborador
   │                     │
   │                     └──< avaliacao >──< versao_avaliacao >──< resposta_avaliacao
   │                                               │              │
   │                                               │              └── resultado_avaliacao
   │                                               └──< transicao_avaliacao
   │
   ├──< sessao_autenticacao >──< token_renovacao
   │
   └──< evento_auditoria

ciclo_avaliacao ──< ciclo_questionario >── versao_questionario
                         │
                         ├── configuracao_calculo_versao
                         └── matriz_classificacao_versao ──< faixa_classificacao
ciclo_avaliacao ──< atribuicao_questionario_colaborador >── colaborador
                         │
                         ├── ciclo_questionario
                         └── avaliacao
versao_questionario ──< questionario_competencia >── versao_competencia
questionario_competencia ──< pergunta_questionario
versao_questionario ──< opcao_resposta
```

Os elementos adicionados pela `V0005`–`V0007` no diagrama existem fisicamente no banco local dedicado. Outros ambientes só os recebem por aplicação autorizada e validação própria.

## Invariantes obrigatórios para a implementação

1. Um gestor só cria, consulta ou envia avaliação se a conta estiver ativa, tiver permissão aplicável e possuir vínculo gestor–colaborador vigente. Após a `V0005`, a restrição filtrada impede dois vínculos de gestor ativos para o mesmo colaborador.
2. Uma autoavaliação exige vínculo conta–colaborador vigente e usa `tipo_avaliacao = 'AUTOAVALIACAO'`; a chave única por ciclo, colaborador e tipo impede duplicidade. A autorização de quem pode ver ou publicar continua exclusiva da aplicação.
3. O papel `COLABORADOR` recebe somente preencher, enviar e visualizar a própria autoavaliação. `ADMINISTRADOR_PLATAFORMA` administra cadastros e vínculos de conta ou gestor, `GERENCIA_RH` administra ciclos e questionários, e `DIRETORIA` administra ciclos; nenhum desses papéis herda acesso de avaliação por essa extensão. `ACESSOS.NEGOCIO.GERIR` pertence somente a RH/Diretoria, exige outro alvo e não permite autoatribuição.
4. Alterar ou encerrar um vínculo não apaga autoria, auditoria ou histórico. O gestor pode ler apenas avaliações que tenha elaborado; a relação ativa não concede acesso a avaliações de outro gestor.
5. O ciclo referencia versão de questionário, configuração de cálculo e matriz de classificação. Depois de aberto, a `V0005` impede mudar sua janela, fuso, autoavaliação, questionários, cálculo ou matriz; o questionário aprovado e seus filhos também se tornam imutáveis.
6. A `V0007` atribui um único questionário ativo a cada colaborador e ciclo. A avaliação referencia essa atribuição por chave composta, que também prova que o `ciclo_questionario` pertence ao ciclo; gestor e colaborador não escolhem questionário livremente.
7. Atribuição possui ator e data obrigatórios. Sua revogação requer ator, data e motivo, preserva histórico, não pode ocorrer com avaliação já criada e só é permitida enquanto o ciclo está em rascunho.
8. Pontos aceitos são somente 80, 90, 100, 110 e 120; perguntas aprovadas são obrigatórias. Respostas pertencem a uma versão da avaliação e a aplicação ainda deve validar que pergunta e opção pertencem ao questionário efetivamente usado.
9. Nota, resultado por competência e faixa são calculados exclusivamente no servidor a partir de dados persistidos e de configuração versionada. `resultado_avaliacao` preserva soma, quantidade, nota arredondada e classificação, com nota persistida entre 80 e 120.
10. Rascunho incompleto não possui resultado final. Toda nota final calculada, persistida ou publicada fora do intervalo falha de forma segura, sem classificação, persistência, truncamento ou ajuste silencioso.
11. Avaliação publicada não será sobrescrita. A reabertura exige motivo registrado, ação autorizada de RH/Diretoria e nova versão em rascunho; a migration fornece a estrutura, mas a autorização e a transação do fluxo pertencem à aplicação.
12. A unicidade v1 é uma avaliação de gestor por ciclo e colaborador e uma autoavaliação por ciclo e colaborador. A `V0005` a materializa por tipo de avaliação.
13. Não é permitido excluir, bloquear, rebaixar ou remover o último administrador supremo ativo. Mudanças críticas exigem solicitante e aprovador distintos.
14. Não haverá exclusão, anonimização ou arquivamento automático por retenção. Um eventual descarte futuro exigirá decisão formal, procedimento auditável e avaliação de recuperação.

## Índices e restrições no desenho versionado

| Entidade                              | Índice ou restrição                                                        | Justificativa                                                           |
| ------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `usuario`                             | login normalizado único; situação                                          | Impede contas ambíguas e permite consulta de autenticação.              |
| `atribuicao_papel`, `papel_permissao` | par de chaves único; consulta por usuário/papel ativo                      | Controle de acesso eficiente e sem concessões duplicadas.               |
| `vinculo_usuario_colaborador`         | usuário ativo único; colaborador ativo único; chave composta de vínculo    | Impede uma conta ativa vinculada a mais de um colaborador e vice-versa. |
| `vinculo_gestor_colaborador`          | gestor + vigência; colaborador ativo único; chave composta de vínculo      | Validação de escopo em cada requisição e coerência da avaliação.        |
| `lotacao_colaborador`                 | colaborador + intervalo de vigência                                        | Indicadores históricos por área e filial.                               |
| `versao_questionario`                 | questionário + número da versão; perguntas por versão + ordem              | Imutabilidade e formulário reprodutível.                                |
| `atribuicao_questionario_colaborador` | ciclo + colaborador ativo único; relação composta com `ciclo_questionario` | Define aplicabilidade auditável e impede seleção livre de questionário. |
| `avaliacao`                           | ciclo + colaborador + tipo único; ciclo + avaliador + situação             | Uma avaliação GESTOR e uma AUTOAVALIACAO por colaborador e ciclo.       |
| `resposta_avaliacao`                  | versão da avaliação + pergunta único                                       | Uma resposta por pergunta na mesma versão.                              |
| `resultado_avaliacao`                 | versão de avaliação única; classificação + nota; `CHECK` de 80 a 120       | Resultado histórico imutável e consulta por classificação.              |
| `evento_auditoria`                    | recurso + data/hora; autor + data/hora; ação + data/hora                   | Investigação e retenção controlada.                                     |
| sessão/token                          | hash ou `jti` único; expiração e revogação                                 | Rotação, revogação e detecção de reuso.                                 |

## Pendências de implementação

- A `V0005` foi aplicada no banco local autorizado e vazio. Ela falha deliberadamente se as estruturas de domínio já tiverem dados, para não inferir pontos, obrigatoriedade, cálculo, matriz ou histórico a partir de registros existentes; observar essa pré-condição em qualquer novo alvo.
- Semear, por fluxo administrativo autorizado, a configuração/matriz `2024.1`, suas cinco faixas, questionários aprovados, opções pontuadas e ciclos. A migration cria a estrutura, mas não inventa dados de negócio.
- A `V0006` foi aplicada sob autorização explícita. Ela acrescenta catálogo sem conceder acesso de negócio diretamente; a conta local de desenvolvimento possui somente o papel técnico. O RBAC/ABAC ainda requer configuração ativada e validação de integração para operar.
- A `V0007` foi aplicada no banco local antes de aceitar avaliações. Ela falha se existir avaliação, pois não infere retrospectivamente qual questionário era aplicável ao colaborador; observar essa pré-condição em qualquer novo alvo.
- Validar repositórios, casos de uso, endpoints, autenticação, autorização por escopo, coerência pergunta/opção e auditoria durável contra SQL Server autorizado. Esses componentes já existem no código-fonte, porém não foram exercitados em integração real.
- Semear áreas, filiais, questionários e ciclos apenas por fluxo administrativo autorizado; não importar dados pessoais da macro.
- Validar em integração as consultas de indicadores, mascaramento, exportação CSV agregada, limitação de consultas e auditoria conforme a regra v1. A implementação fonte já existe e continua desabilitada por padrão.
- Definir a identidade de mínimo privilégio, segredos persistentes de produção e custodiantes reais antes de liberar dados reais. A única conta técnica local de desenvolvimento exige troca da senha inicial e não substitui o processo de dois administradores para produção.

As migrations versionadas ficam em `database/sql/migrations`; os testes estáticos da `V0005`–`V0007` ficam em `database/scripts/testar-v0005-regra-operacional-2024-1.ps1`, `database/scripts/testar-v0006-catalogo-rbac-2024-1.ps1` e `database/scripts/testar-v0007-atribuicao-questionario-colaborador.ps1`. As validações SQL somente leitura correspondentes ficam em `database/sql/validation/006_validar_regra_operacional_2024_1.sql` a `database/sql/validation/008_validar_atribuicao_questionario_por_colaborador_e_ciclo.sql`. O bootstrap controlado está em `database/executar-database.bat`. A recriação do banco do zero deverá produzir o mesmo schema que um banco atualizado, mas nenhuma recriação nem aplicação é autorizada por este documento.
