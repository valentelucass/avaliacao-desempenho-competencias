# Especificação extraída da macro de avaliação — 2024

| Campo           | Valor                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Fonte           | `docs/AVALIAÇÃO DE DESEMPENHO - MACRO.xlsm`, recebida do usuário em 2026-08-25.                                                             |
| Leitura         | Somente leitura do pacote Excel; nenhuma macro foi aberta ou executada.                                                                     |
| Uso             | Fonte de requisitos para o novo sistema, não código executável nem modelo de segurança.                                                     |
| Dados sensíveis | O arquivo contém CPF, comentários, plano de ação e cache de dados históricos. Ele é local, está ignorado pelo Git e não deve ser publicado. |
| Testes afetados | Questionários, respostas obrigatórias, cálculo, limites, classificação, persistência, indicadores, privacidade e autorização.               |

> Atualização normativa: em 2026-08-25, o usuário autorizou o uso desta macro como fonte e a adoção de regras conservadoras para suas lacunas. A [Regra operacional 2024.1](regras-operacionais-v1.md) é a definição vigente; referências a pendências abaixo descrevem o estado da extração original e não autorizam reproduzir os defeitos do legado.

## Estrutura observada

As oito abas são visíveis: `GERAL`, `Listas`, `LIDERANÇA`, `ADMINISTRATIVO`, `OPERACIONAL`, `BASE`, `AVALIAÇÕES` e `ANÁLISE`.

O fluxo legado é: listas → formulário por tipo → ação “FINALIZAR A AVALIAÇÃO” → tabela consolidada → filtros/gráficos. O novo sistema não copiará o comportamento de limpar o formulário após finalizar: deverá preservar rascunho, envio, publicação e histórico conforme as regras já registradas.

Existem quatro tabelas, quatro gráficos, uma tabela dinâmica, dois filtros por funcionário e VBA para consolidar, limpar, atualizar, imprimir e exportar PDF. Não há integração externa no arquivo. As macros usam seleção/aba ativa e não possuem tratamento de erro; por isso não são referência de implementação ou controle de acesso.

## Regra confirmada para limites da nota

Por decisão explícita do gestor em 2026-08-25, uma nota final válida **nunca** pode ser menor que 80 nem maior que 120.

- O rascunho pode ficar incompleto, mas não recebe nota final ou classificação.
- Envio e publicação exigem todas as respostas obrigatórias válidas.
- O servidor calcula a nota; se uma configuração, importação ou defeito técnico produzir resultado fora de `80 ≤ nota ≤ 120`, a operação deve falhar, ser auditada e não persistir resultado/classificação.
- Não é permitido truncar, limitar, normalizar ou encaixar silenciosamente uma nota inválida em alguma faixa.

## Escala e cálculo presentes na macro

`Listas!A5:B9` e as listas de validação dos formulários definem cinco respostas. A entrada é textual, sem digitação direta de nota.

| Resposta                | Pontuação por item |
| ----------------------- | -----------------: |
| Abaixo do esperado      |                 80 |
| Em desenvolvimento      |                 90 |
| Dentro das expectativas |                100 |
| Supera as expectativas  |                110 |
| É referência            |                120 |

Cada formulário converte a resposta em um destes cinco valores e calcula a média aritmética simples dos itens. Não há pesos no arquivo. A macro não usa uma fórmula explícita de arredondamento; as células de apresentação estão formatadas como inteiro, enquanto a média subjacente pode ter casas decimais.

Essa é a base funcional recebida para a escala e o cálculo. A fundação de domínio mantém as cinco pontuações e a média como soma/quantidade exatas, sem escolher arredondamento nem classificação final. A precisão, o arredondamento e a versão aprovada do cálculo ainda precisam ser fechados antes de persistir ou publicar um resultado.

## Questionários por tipo de avaliação

| Tipo           | Fonte no arquivo         | Itens |
| -------------- | ------------------------ | ----: |
| Liderança      | `LIDERANÇA!C12:H33`      |    21 |
| Administrativo | `ADMINISTRATIVO!C13:H31` |    18 |
| Operacional    | `OPERACIONAL!C13:H30`    |    17 |

Cada item tem título e descrição comportamental. Na aplicação, eles deverão ser questionário/competência versionados; não serão campos livres do navegador.

### Liderança

1. **Preza pela segurança** — prioriza a segurança pessoal e de outras pessoas, identificando e mitigando riscos.
2. **Responsabilidade sobre decisões** — assume ações e decisões, entrega prazos e busca soluções em vez de culpados.
3. **Regulamento interno** — demonstra entendimento prático do regulamento, valores e princípios da empresa.
4. **Senso de dono** — atua pelo crescimento do negócio, excelência e resultados.
5. **Relacionamento interpessoal** — trata pessoas com respeito e dignidade e favorece ambiente positivo.
6. **Comunicação** — comunica com clareza, acessibilidade e transparência.
7. **Proatividade** — antecipa problemas e age para que as coisas aconteçam.
8. **Qualidade do trabalho** — realiza atividades com qualidade, sem retrabalho e com foco estratégico.
9. **Cumprimento de normas e regras** — pratica regras, normas e procedimentos com disciplina e comprometimento.
10. **Faturamento da filial/setor** — cumpre metas de faturamento, custos e demais metas da filial ou área.
11. **Trabalho em equipe** — colabora, soma esforços e permanece acessível à equipe.
12. **Flexibilidade** — adapta-se a ambientes e necessidades de mudança com organização.
13. **Criatividade na resolução de problemas** — compartilha conhecimento, propõe soluções e aprende com a experiência de outras pessoas.
14. **Mente empreendedora** — aprende, ensina, inova e age com senso de urgência.
15. **Gestão do tempo** — organiza rotinas, prioridades e necessidades da operação ou área.
16. **Feedback** — oferece e solicita feedbacks para o crescimento pessoal e da equipe.
17. **Desenvolvimento de equipe** — encoraja subordinados a aceitar desafios e buscar desempenho superior.
18. **Visão sistêmica** — integra processos, pessoas e recursos para alcançar resultados da área.
19. **Delegação de tarefas** — delega e gerencia tarefas com eficiência.
20. **Melhoria contínua da área/filial** — propõe e executa melhorias e novas abordagens.
21. **Aprimoramento** — busca conhecimentos e habilidades por cursos, faculdade, treinamentos e capacitações.

### Administrativo

1. **Aprendizagem** — desenvolve competências e habilidades da própria função.
2. **Comprometimento** — esforça-se, segue normas e condutas e se envolve com o propósito do setor.
3. **Trabalho em equipe** — colabora, soma esforços e permanece acessível à equipe.
4. **Responsabilidade e confiança** — demonstra confiabilidade, credibilidade e responsabilidade por decisões, erros e prazos.
5. **Relacionamento interpessoal** — interage com respeito e dignidade, promovendo ambiente positivo.
6. **Comunicação** — comunica de forma clara, acessível, transparente e objetiva.
7. **Proatividade** — antecipa problemas e assume postura proativa.
8. **Qualidade do trabalho** — trabalha com qualidade, sem retrabalho e no padrão exigido.
9. **Conduta pessoal** — cumpre normas, procedimentos e instruções do superior imediato.
10. **Pontualidade e assiduidade** — cumpre horários e jornada de trabalho integralmente.
11. **Flexibilidade** — adapta-se a ambientes e mudanças com flexibilidade e organização.
12. **Criatividade na resolução de problemas** — propõe ideias e soluções para situações inesperadas.
13. **Produtividade** — trabalha com agilidade e atinge ou supera expectativas da função.
14. **Gestão do tempo** — organiza rotina, prazos e prioridades.
15. **Recursos** — zela pelo local de trabalho, máquinas, equipamentos, ferramentas e limpeza.
16. **Conhecimento técnico** — aplica o conhecimento necessário à função.
17. **Aprimoramento** — busca novos conhecimentos e habilidades em capacitações.
18. **Preza pela segurança** — prioriza segurança e mitiga riscos de forma proativa.

### Operacional

O questionário operacional usa os mesmos itens e descrições do administrativo, exceto:

- não inclui **Gestão do tempo**;
- em **Conduta pessoal**, inclui expressamente o cumprimento de normas, procedimentos **e uso de EPI**, além das instruções do superior imediato.

## Autoavaliação

`Listas!N6:O26` contém a mesma lista de 21 competências de Liderança. Entretanto, o arquivo não tem formulário, fluxo, registro nem macro específicos para autoavaliação.

O arquivo não resolve esses pontos. A [Regra operacional 2024.1](regras-operacionais-v1.md) estabelece autoavaliação independente para colaborador com conta vinculada e ciclo habilitado, usando o questionário aplicável, sem efeito na nota de gestor e sem visibilidade ao gestor.

## Cadastros e campos observados

Os formulários legados mostram funcionário, tipo de avaliação, função, área, CPF, filial, avaliador, gestão da filial, comentários e plano de ação. A tabela consolidada repete esses campos em uma linha para cada competência.

- **Colaborador e gestor/avaliador** seguem como texto livre conforme decisão já registrada; esse texto não concede acesso.
- A macro oferece listas de filiais e áreas para 2024. A regra `2024.1` as aceitou como base do catálogo inicial, com manutenção administrativa registrada e preservação histórica; nenhuma linha foi semeada a partir do arquivo.
- O CPF foi encontrado na planilha legado, mas não está aprovado para o novo sistema. Pela minimização de dados, não deve ser coletado ou usado sem necessidade e decisão explícita.
- Comentário e plano de ação aparecem como obrigatórios visualmente, mas o arquivo não os valida. A regra v1 os mantém opcionais para não impor coleta de texto livre sensível.

### Filiais candidatas de 2024

Osasco, Agudos, Matriz, Campinas, Curitiba, Castro, Rio de Janeiro, Recife e Novo Hamburgo.

### Áreas candidatas de 2024

Administrativo (ADM, Facilities, Compras, Custos, Projetos, Marketing), Operacional, Frota, Tráfego/Torre de Controle, Financeiro, RH/DP, Controladoria, Comercial, Distribuição, Expedição, GRC, TI, Qualidade e Gerência.

## Indicadores observados

O arquivo apresenta média geral do filtro selecionado, classificação, comentário/plano de ação, gráfico de pontuação por competência e filtros por funcionário. Não foram encontradas regras de agregação por área/filial, privacidade, grupo mínimo ou autorização de visualização/exportação.

Os indicadores do novo sistema respeitarão a [Regra operacional 2024.1](regras-operacionais-v1.md): RH e Diretoria consultam/exportam somente agregados permitidos, gestores não recebem indicadores ou exportação, o ciclo é obrigatório e dimensões populacionais não se combinam. Abaixo de cinco colaboradores distintos, o sistema não retorna média, total, faixa, gráfico, percentual ou contagem.

## Divergências e defeitos do legado que não devem ser copiados

1. A matriz em `GERAL!B4:E8` usa as faixas `80–84,9`, `85–94,9`, `95–104,9`, `105–114,9` e `115–120`. Já `ANÁLISE` usa cortes em 80, 90, 100 e 110, tem lacunas para alguns decimais e não define teto de 120. A regra v1 adota `GERAL` e rejeita definitivamente a fórmula `ANÁLISE`.
2. As validações das respostas permitem valor vazio e as fórmulas convertem resposta vazia/desconhecida em `0`. Isso contradiz a decisão de que não existem notas válidas abaixo de 80. O novo sistema deve manter ausência de resposta separada de pontuação.
3. Liderança possui 21 itens, mas a média e o gráfico legados usam somente os 20 primeiros e excluem **Aprimoramento**. A versão de questionário do sistema deverá declarar todos os itens que entram no cálculo.
4. Há uma fórmula quebrada `AVALIAÇÕES!#REF!` na aba `ANÁLISE`.
5. A busca de comentário/plano usa funcionário isoladamente, sem chave de ciclo, tipo ou versão; isso é ambíguo para histórico.
6. A tabela achatada repete CPF, avaliador, comentário e plano de ação por competência. O modelo novo usará avaliação-cabeçalho, respostas por item, resultado e histórico separados.
7. A ação de PDF/impressão do arquivo não define permissão. No sistema v1, a impressão individual só pode ser acionada pela tela que já possui escopo de leitura, registra `AVALIACOES.IMPRIMIR` na auditoria e gera a cópia exclusivamente no navegador; não existe PDF persistido, download individual ou exportação de comentários. A exportação de dados continua limitada a CSV agregado autorizado.

## Decisões consolidadas a partir da extração

- A matriz `GERAL` substitui a fórmula incompatível da aba `ANÁLISE`.
- A nota final usa uma casa decimal com `HALF_UP` e essa nota determina a faixa.
- Todas as respostas são obrigatórias; comentário e plano de ação são opcionais.
- A autoavaliação é independente, não altera a nota de gestor e só abre para colaborador com conta vinculada em ciclo habilitado.
- Áreas e filiais formam o catálogo inicial `2024.1`, com manutenção administrativa registrada e histórico.
- Nenhum identificador além do necessário ao cadastro operacional será assumido; CPF permanece fora do produto.
