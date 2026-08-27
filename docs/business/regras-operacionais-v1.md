# Regras operacionais v1 — avaliação, acesso e indicadores

## Registro da decisão

| Campo            | Valor                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status           | Decisão de negócio v1 definida para implementação.                                                                                                                                               |
| Decisor          | Usuário solicitante, que autorizou explicitamente o uso da macro de 2024 como referência e a adoção de regras conservadoras para as lacunas em 2026-08-25.                                       |
| Fonte primária   | `AVALIAÇÃO DE DESEMPENHO - MACRO.xlsm`, hash SHA-256 `05F19FC0D4C5EBEAA9E3021F8E3D121DE36EECACCA126C1487143033D2B01004`, lida estaticamente sem executar VBA.                                    |
| Fonte sanitizada | [Especificação extraída da macro de avaliação — 2024](especificacao-macro-avaliacao-2024.md).                                                                                                    |
| Escopo           | Fecha as definições de produto de ADC-001, ADC-002 e ADC-003. Não autoriza importar dados históricos, criar contas, usar CPF, executar migrations, publicar a aplicação ou exportar dados reais. |
| Testes afetados  | Cálculo/classificação, versões de questionário, transições, unicidade, RBAC/ABAC, vínculo gestor–colaborador, autoavaliação, indicadores, exportação, auditoria e confidencialidade.             |

## Princípios conservadores

- A macro é referência para questionários, escala e matriz `GERAL`; seus defeitos, sua VBA e seus dados históricos não são requisito nem fonte de autorização.
- Nenhum dado pessoal presente no arquivo é importado. CPF continua fora do produto, e comentários ou planos de ação não são copiados do legado.
- A aplicação calcula resultados exclusivamente no servidor, preserva a versão usada e falha fechada diante de entrada, escopo, transição ou nota inválidos.
- Na ausência de regra explícita da macro, prevalecem minimização de dados, negação por padrão, histórico imutável e não divulgação de resultados individuais por indicadores.

## ADC-001 — avaliação e cálculo

### Versão de conteúdo

A primeira versão de negócio é `2024.1` e contém os três questionários descritos na especificação sanitizada:

- Liderança: 21 itens, incluindo **Aprimoramento** no cálculo;
- Administrativo: 18 itens;
- Operacional: 17 itens, sem Gestão do tempo e com uso de EPI em Conduta pessoal.

Os títulos e descrições da especificação sanitizada são o conteúdo normativo. A exclusão do 21º item de Liderança no legado é rejeitada. Uma alteração futura cria uma nova versão de questionário; nunca modifica uma avaliação existente.

### Escala, nota e classificação

Cada pergunta obrigatória recebe exatamente uma das respostas abaixo.

| Resposta                | Pontos |
| ----------------------- | -----: |
| Abaixo do esperado      |     80 |
| Em desenvolvimento      |     90 |
| Dentro das expectativas |    100 |
| Supera as expectativas  |    110 |
| É referência            |    120 |

A nota é a média aritmética simples, sem pesos, de todas as respostas obrigatórias da versão. A implementação preservará `soma de pontos` e `quantidade de respostas` para auditoria e calculará a nota final com uma casa decimal, usando `HALF_UP`. A nota final com uma casa decimal é a nota persistida e a usada na classificação; a razão exata permanece reconstituível a partir da soma e da quantidade.

| Nota final persistida | Classificação           |
| --------------------- | ----------------------- |
| 115,0 a 120,0         | É referência            |
| 105,0 a 114,9         | Supera as expectativas  |
| 95,0 a 104,9          | Dentro das expectativas |
| 85,0 a 94,9           | Em desenvolvimento      |
| 80,0 a 84,9           | Abaixo do esperado      |

A matriz `GERAL` é a única matriz de classificação v1. A fórmula da aba `ANÁLISE` é rejeitada por ser incompatível, possuir lacunas e conter uma referência quebrada. Uma nota anterior ou posterior ao arredondamento que não pertença ao intervalo fechado de 80 a 120 falha sem persistir classificação, ajuste silencioso ou publicação.

Todas as perguntas da versão são obrigatórias para envio e publicação. Comentário e plano de ação são opcionais em v1, limitados à finalidade da avaliação e não condicionam nota, faixa ou transição. Essa escolha evita coleta compulsória de texto livre sensível sem regra de negócio suficiente.

### Ciclo, área e filial

O ciclo anual v1 abre em 1º de setembro às 00:00:00 e fecha em 16 de setembro às 00:00:00, horário `America/Sao_Paulo`; o início é inclusivo e o fim exclusivo. Cada ciclo persistirá suas datas e fuso, e não poderá ser alterado depois de aberto.

As listas de filiais e áreas de 2024 na especificação sanitizada são a base inicial do catálogo `2024.1`. Elas serão cadastradas somente por fluxo administrativo futuro, com histórico de vigência; não haverá importação de pessoas da macro. Administradores de plataforma manterão o catálogo mediante solicitação registrada da Gerência de RH.

## ADC-002 — acesso, fluxo e autoavaliação

### Autoridade de acesso

Uma conta só é gestora autorizada quando estiver ativa, receber explicitamente o papel `GESTOR` e possuir vínculo gestor–colaborador ativo. A macro não cria nem autoriza contas, vínculos ou gestores. Cada colaborador terá no máximo um vínculo de gestor ativo por vez; substituições encerram o vínculo anterior, criam outro com vigência e preservam autoria e histórico.

O perfil **Administrador** é representado pelo papel `ADMINISTRADOR_PLATAFORMA` e possui acesso integral aos módulos e operações autorizadas da versão. Ele pode administrar perfis de terceiros, mas não pode alterar a própria configuração de acesso no fluxo normal. Toda operação continua registrada e validada no servidor por recurso, vínculo, estado e privacidade; o acesso integral não cria, publica nem revela dados fora dessas regras.

| Perfil                            | Escopo v1                                                                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Administrador                     | Acessa todos os módulos e operações autorizadas, sempre sujeito às validações de recurso, vínculo, estado, auditoria e privacidade do servidor. |
| Usuário comum com conta vinculada | Preenche e lê apenas a própria autoavaliação; não visualiza a avaliação de gestor nesta versão.                                                 |

### Autoavaliação e transições

A autoavaliação é uma avaliação independente do tipo `AUTOAVALIACAO`. Ela só é habilitada para um colaborador que tenha conta local ativa vinculada e cuja abertura tenha sido configurada no ciclo por Gerência de RH ou Diretoria. Usa a mesma versão de questionário da avaliação de gestor aplicável ao colaborador, possui uma única ocorrência por ciclo e não compõe a nota, a classificação ou os indicadores da avaliação de gestor.

O colaborador pode manter rascunho e enviar a própria autoavaliação durante a janela do ciclo. O gestor não lê a autoavaliação. Gerência de RH e Diretoria podem lê-la para administração do processo. Não há recurso ou revisão por solicitação do avaliado.

O fluxo da avaliação de gestor é `RASCUNHO → ENVIADA → PUBLICADA`. Publicação exige respostas completas, cálculo válido e ação individual de Gerência de RH ou Diretoria. Reabertura só pode ser realizada por esses mesmos papéis, exige motivo obrigatório e cria nova versão em `RASCUNHO`, preservando a versão publicada e toda a trilha de auditoria. A reabertura administrativa não é recurso do colaborador.

Publicação e reabertura administrativa podem ocorrer também depois do encerramento do ciclo. Quando RH ou Diretoria reabre uma avaliação de gestor já encerrada, essa reabertura registrada é a única exceção à janela: o gestor autor da avaliação pode corrigir e reenviar exclusivamente aquele rascunho reaberto; o ciclo inteiro, autoavaliações e novas avaliações continuam encerrados. Isso permite tratar uma correção administrativa sem reabrir a população ou alterar o histórico do ciclo.

Há somente uma avaliação de gestor por combinação de ciclo e colaborador e uma autoavaliação por combinação de ciclo e colaborador. Reabrir cria versão da mesma avaliação, não outro registro lógico.

## ADC-003 — indicadores, exportação e confidencialidade

### População e métricas

Indicadores usam somente avaliações de gestor publicadas da versão vigente da avaliação, uma por colaborador e ciclo. Autoavaliações, rascunhos, envios, comentários, planos de ação e identificadores individuais ficam fora da população e do resultado agregado.

As métricas v1 são:

- média da nota final do grupo, com uma casa decimal;
- média por competência, com uma casa decimal; e
- distribuição percentual por classificação, arredondada para múltiplos de cinco pontos percentuais.

Não são retornados contagem bruta, lista de colaboradores, resultados individuais, comentários, plano de ação ou qualquer identificador de avaliado.

### Filtros e proteção contra inferência

O ciclo é obrigatório. A consulta pode usar, além do ciclo, no máximo uma dimensão populacional entre filial, área ou gestor; competência apenas seleciona a métrica por competência. O filtro por colaborador é aceito somente para resultar em `DADOS_INSUFICIENTES`, pois nunca forma um grupo confidencial. Combinações de filial, área e gestor na mesma consulta são negadas.

Depois de todos os filtros, o servidor conta colaboradores distintos. Com menos de cinco, ou em qualquer consulta individual, a resposta contém somente `DADOS_INSUFICIENTES` e não inclui média, faixa, gráfico, percentual, total ou contagem. Mesmo quando disponível, o servidor não devolve contagem bruta e limita consultas repetidas; toda consulta e toda negação são auditadas. Esses controles evitam que filtros sobrepostos revelem pessoas por diferença.

Somente Gerência de RH e Diretoria consultam indicadores. Gestores consultam suas próprias avaliações por recurso individual, não indicadores agregados e nunca exportações.

### Exportação e auditoria

Uma exportação v1 é um arquivo CSV UTF-8 gerado sob demanda no navegador autenticado, contendo exatamente o agregado já permitido na consulta. Não há envio por e-mail, integração externa, exportação automática, exportação individual, comentários, planos de ação, CPF, logins ou lista de colaboradores.

O evento de consulta ou exportação registra ator, data/hora, ação, resultado permitido/negado, versão de política e identificação técnica dos filtros; não armazena valores retornados, conteúdo exportado, comentário integral, senha, token ou dado pessoal desnecessário. Auditorias e históricos permanecem sem exclusão automática até decisão formal posterior.

### Recuperação administrativa de senha

O administrador supremo pode recuperar o acesso de outra conta comum ativa definindo uma senha temporária de 12 a 200 caracteres. A senha é usada somente para formar o hash no servidor, não é devolvida pela API nem incluída em auditoria ou logs. A recuperação revoga as sessões existentes, limpa bloqueio de tentativas e obriga a troca no próximo login. O administrador supremo não redefine a própria senha por esse fluxo, nem a senha de conta suprema, protegida, desativada ou excluída logicamente; esses casos exigem o fluxo de troca da própria conta ou procedimento operacional segregado.

### Impressão individual auditada

Uma pessoa já autorizada a abrir o detalhe de uma avaliação pode solicitar a cópia local pela impressão do navegador. Antes de abrir essa caixa, a interface chama a API autenticada com CSRF para registrar o sucesso de `AVALIACOES.IMPRIMIR`, com ator, data/hora, recurso e correlação técnica; nenhuma resposta, comentário, plano de ação ou PDF é persistido nesse evento. A interface disponibiliza a cópia visual somente para avaliação enviada ou publicada com resultado calculado: em A4, ela contém apenas o gráfico radar, a nota final e a classificação calculadas pelo servidor, além de uma linha vazia para assinatura física do colaborador. Essa linha não coleta, valida, transmite nem armazena assinatura eletrônica. A permissão é exatamente o escopo de leitura do recurso — não há permissão de impressão que amplie acesso, download individual, anexo, e-mail ou exportação de dados individuais. A cópia local pode ser produzida pelo usuário fora do sistema, portanto o controle técnico cobre a ação iniciada pela interface e não pretende impedir captura de tela ou impressão pelo navegador fora dela.

## Exemplos de aceite

1. Uma avaliação de Liderança com as 21 respostas válidas calcula a média simples de todos os 21 itens; um item vazio impede envio.
2. Uma média exata de `2.200 / 21 = 104,7619...` recebe nota final 104,8 com `HALF_UP` e classificação **Dentro das expectativas**.
3. Um gestor com papel, mas sem vínculo ativo, recebe acesso negado para criar uma avaliação.
4. Uma autoavaliação enviada não altera a nota nem a faixa da avaliação de gestor.
5. Uma consulta de indicador com quatro colaboradores distintos não revela número algum; uma exportação recebe o mesmo bloqueio.
6. Uma consulta de ciclo e área não pode ser combinada com gestor para tentar subtrair grupos; a API a rejeita antes de calcular agregados.
