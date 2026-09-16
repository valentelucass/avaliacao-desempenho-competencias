# Importação por planilha — cadastros e vínculos

## Escopo e origem

Em 16/09/2026, após a preparação visual `ADC-UI-057`, o usuário enviou os modelos de colaboradores e atribuições e autorizou aplicá-los (`ADC-IMP-001`). Esclareceu expressamente que **Filial deve ser desconsiderada nas atribuições**. Em seguida, definiu as cinco colunas de lotações e pediu implementação e testes dos três fluxos (`ADC-IMP-002`), desconsiderando as demais colunas de dados. Esta autorização permite implementar o recebimento e a gravação confirmada na interface; não implica executar a carga dos dados enviados, publicar ou alterar schema.

Responsável pela origem e pelo esclarecimento: usuário solicitante, repassando o modelo do gestor; identificação nominal de responsável de negócio não registrada. Regras de conferência abaixo são escolhas conservadoras desta implementação, preservando cadastro individual e as regras existentes do servidor.

## Onde usar

Tela **Cadastros e atribuições**, opção **Importar Excel** nos blocos Colaboradores, Lotações e Atribuições de questionário. Acesso e todas as rotas exigem `CADASTROS.GERIR`.

1. Importe primeiro Colaboradores.
2. Para Lotações, cadastre previamente as filiais e áreas que serão informadas. Em Atribuições, selecione o ciclo em rascunho correspondente ao arquivo.
3. Selecione o Excel e clique em **Conferir planilha**.
4. Confira os totais e as páginas de 25 linhas. Corrija pendências no arquivo ou nos cadastros e confira novamente.
5. Clique em **Confirmar importação**. Só então os registros novos são criados e as listas atualizadas.

Abrir a área não envia arquivo. A conferência não grava cadastro. Trocar arquivo ou ciclo descarta a conferência anterior. O usuário pode descartá-la explicitamente. Sair da tela também libera a prévia; respostas tardias são descartadas, e uma confirmação já enviada termina antes de liberar seu token. Se o descarte falhar por falta de rede, permanece a expiração no servidor. Sucesso/erro usa a notificação flutuante compartilhada, com expiração; instruções, totais, resultado concluído e pendências permanecem no painel.

## Vínculos gestor–colaborador (ADC-IMP-003)

Ampliação solicitada pelo usuário em 16/09/2026 para atender volume de vínculos em produção. O modelo foi definido consultando a relação administrativa existente, conforme pedido posterior do usuário. Tela **Vínculos**, seção **Vínculo gestor-colaborador**, permissão `VINCULOS_GESTOR_COLABORADOR.GERIR`. O botão **Baixar modelo de vínculos** oferece arquivo vazio.

Cabeçalhos obrigatórios: **Conta avaliadora** (nome de exibição da conta ativa de Gestor/RH no seletor), **Colaborador** (nome cadastrado ativo) e **Início** (dd/mm/aaaa ou data Excel sem horário). Ordem livre entre A:Z, extras de dados ignorados e controles de arquivo aplicados ao conteúdo inteiro. Não exige login nem consulta irrestrita de contas. Nomes ambíguos requerem vínculo individual; não inferir identidade a partir do Gestor de Lotações.

Somente um vínculo por colaborador no lote. Idêntico, não revogado e com mesmo início: manter. Conta/data diferente, vínculo não revogado ou período histórico sobreposto: bloquear sem encerrar/substituir. Fim inclusivo; início após o fim do vínculo anterior. A confirmação concede escopo de acesso e revalida elegibilidade/vigência/duplicidade sob bloqueios antes de gravar o lote e suas auditorias atomicamente.

A permissão de cadastros não autoriza este fluxo. Prévias são isoladas por ator e família de permissão em leitura, confirmação e descarte. Mesmos limites de memória/arquivo/tempo/reenvio dos importadores existentes. Diretoria–Gerência e conta–colaborador permanecem individuais. Regras, exemplo e recuperação: [manutenção e vínculos](../operations/manutencao-cadastros-e-importacao-vinculos.md).

## Modelos recebidos

XLSX com uma única aba e cabeçalho na linha 1. Colaboradores e Atribuições mantêm a ordem abaixo; **Lotações aceita as cinco colunas em qualquer ordem**, entre A e Z, ignorando colunas extras de dados. Cabeçalhos toleram caixa, acentos e espaços externos. Linhas inteiramente vazias nas colunas consideradas são ignoradas; a conferência mantém a numeração original. O intervalo literal do filtro automático do Excel (`_xlnm._FilterDatabase`), presente no modelo de atribuições, é aceito sem executar fórmulas ou nomes definidos arbitrários. Controles contra conteúdo perigoso também se aplicam às colunas ignoradas.

| Modelo        | Cabeçalhos                                                                     |
| ------------- | ------------------------------------------------------------------------------ |
| Colaboradores | `Colaboradores`                                                                |
| Lotações      | `Filial`, `Colaborador`, `Área`, `Gestor`, `Início da Lotação`                 |
| Atribuições   | `Ciclo em Rascunho`, `Filial`, `Colaborador`, `Questionário Aplicado no Ciclo` |

Exemplo fictício de colaboradores: `Pessoa Exemplo`.

Exemplo fictício de atribuição: `Ciclo Exemplo 2026 | Referência ignorada | Pessoa Exemplo | Questionário Exemplo v1`. O nome do ciclo e o título precisam existir no cadastro. Filial não é exibida, conservada na prévia, validada contra lotação ou usada para criar relacionamento; pode estar vazia. Uma linha preenchida somente em Filial é ignorada, mantendo a numeração original das demais linhas.

O material recebido tem 379 colaboradores e 378 atribuições. Nenhum nome foi copiado para documentação, fixtures, logs ou repositório. O nome do ciclo no arquivo é compatível com identificação por nome, e os títulos dos questionários seguem os títulos versionados existentes.

### Lotações

Exemplo fictício: `Filial Exemplo | Pessoa Exemplo | Área Exemplo | Gestor Exemplo | 15/09/2026`. Os cinco cabeçalhos são obrigatórios. Os valores de Colaborador e Início da Lotação também; Filial, Área e Gestor podem estar vazios, seguindo o cadastro individual existente.

- Colaborador precisa corresponder a um único cadastro ativo. Importe os colaboradores primeiro.
- Filial e Área, quando preenchidas, precisam corresponder a um único cadastro ativo existente. Não são criadas nem reativadas implicitamente.
- Gestor é texto informativo da lotação, até 200 caracteres; não cria conta, permissão nem vínculo de gestão.
- Início aceita texto estrito `dd/MM/aaaa` ou data numérica do Excel, respeitando o sistema de datas 1900/1904 informado no arquivo. Datas impossíveis e horários/frações são pendências; não se trunca horário. O serial 60 de 1900 é rejeitado por representar um dia inexistente. Referências: [sistemas de datas do Excel](https://support.microsoft.com/en-us/excel/date-systems-in-excel) e [compatibilidade histórica de 1900](https://learn.microsoft.com/en-us/troubleshoot/microsoft-365-apps/excel/wrongly-assumes-1900-is-leap-year).
- Cada linha cria uma lotação sem data de fim. Uma lotação aberta idêntica, com o mesmo início, filial, área e gestor normalizado, é mantida como existente. Uma pessoa repetida no lote bloqueia a confirmação.
- Outro período que alcance ou ultrapasse o início proposto bloqueia a linha, incluindo lotações futuras. O fim é inclusivo: histórico encerrado em 14/09 permite novo início em 15/09; encerrado em 15/09 conflita com início em 15/09. A importação não encerra, substitui ou reescreve histórico.
- Conferência mostra as cinco informações e a pendência específica. Somente o lote sem pendências pode ser confirmado.

## Conferência e integridade

O botão de confirmação informa a quantidade de pendências do **lote inteiro**, mesmo em uma página só com linhas válidas. Registros válidos não são importados parcialmente. Em Atribuições, o painel lista os questionários aplicados ao ciclo selecionado; questionário ausente e título ambíguo recebem orientações diferentes. Exemplo: se a planilha usa os questionários fictícios A e B, um ciclo que contém somente B não permite importar A. É preciso selecionar/configurar um rascunho com as duas combinações aprovadas e conferir novamente.

Em Lotações, uma área ausente deve ser cadastrada na seção Áreas quando representar uma nova área real, ou a planilha deve usar o nome do cadastro correto quando já existir. Não se deduz equivalência entre cargo e área nem se cria uma área automaticamente para eliminar a pendência. Em 16/09/2026 o usuário pediu que o teste reflita produção, sem decidir essa equivalência: a validação continua igual nos dois ambientes; a definição do catálogo é pendência de negócio.

- Nome de colaborador: obrigatório, até 200 caracteres, sem controles; espaços externos removidos, inclusive espaços não separáveis provenientes de cópia/Excel. Comparação sem distinção de caixa/acentos. O arquivo não fornece matrícula ou outro identificador.
- Nenhum cadastro correspondente: criar colaborador, ou bloquear atribuição até que o colaborador seja cadastrado.
- Um cadastro ativo correspondente: apresentar como existente na importação de colaboradores; nas atribuições, resolver esse cadastro para conferência.
- Mais de um cadastro correspondente: bloquear por ambiguidade. Não escolher homônimo automaticamente. Pessoa distinta com mesmo nome deve ser tratada individualmente até existir modelo com identificador aprovado.
- Cadastro inativo: bloquear, sem reativar automaticamente. Áreas/Colaboradores podem ser editados e reativados explicitamente em Cadastros e atribuições (ADC-COR-022); depois, conferir a planilha novamente. Nome repetido na planilha: bloquear o lote para correção.
- Ciclo: deve continuar em rascunho; cada linha precisa corresponder ao código, nome ou apresentação `código — nome` do ciclo selecionado.
- Questionário: título deve corresponder a exatamente um questionário já aplicado ao ciclo. Não é escolhido por categoria aproximada nem criado implicitamente.
- Atribuição ativa idêntica: manter e contar como existente. Atribuição ativa para outro questionário: bloquear; não revogar/substituir.
- Nenhuma conta, permissão ou vínculo de gestão é criado pelos três importadores de cadastros. O novo importador específico de vínculos segue a permissão e as regras próprias descritas acima. Somente o importador Lotações cria lotações; Filial permanece desconsiderada nas Atribuições.
- Confirmação reconsulta os registros sob bloqueios transacionais e compara com a conferência. Alterações relevantes exigem nova conferência. Todas as linhas novas e auditorias pertencem à mesma transação; qualquer falha desfaz o lote.
- Repetir a mesma confirmação retorna o resultado anterior durante a validade da prévia. Reenviar o arquivo depois produz registros existentes; não duplicação silenciosa. Não há exclusão nem atualização em lote.

## Segurança e operação

Contrato adicional em [API v1](../api/contrato-http-v1.md); decisões no [ADR-0020](../adr/0020-importacao-xlsx-restrita-com-conferencia.md).

O servidor aceita corpo binário XLSX de até 1.048.576 bytes e até 1.000 linhas de dados. Confere conteúdo OOXML, partes permitidas, uma aba, referências de células e cabeçalhos. Limita expansão ZIP a 8 MiB, profundidade XML a 64 e textos a 2.000 caracteres; proíbe DTD/entidades externas, fórmulas, hyperlinks, macros, objetos, partes desconhecidas e referências externas. Não executa Excel nem transmite arquivo a terceiros.

Arquivo apenas em memória durante leitura, sem armazenamento ou download posterior. A prévia guarda somente linhas necessárias e expira após 15 minutos, com limpeza a cada minuto; limite de quatro prévias por ator e 32 globais, duas leituras simultâneas e dez tentativas de upload/confirmação por minuto por ator. Limites são locais à instância única aprovada. Reinício invalida prévias: conferir novamente. Não há varredura antimalware por serviço externo; o escopo é extração restrita de valores, sem execução, conservação ou redistribuição de arquivos. Se houver armazenamento ou outros formatos, rever estes controles antes de ampliar.

Cookies, CSRF e permissão são verificados antes da leitura. Tokens de prévia são aleatórios e ligados ao ator; não concedem acesso por si só. Respostas paginadas não expõem IDs internos de colaborador/questionário. Auditoria reaproveita ações individuais existentes, com ator, recurso e requestId; não registra valores do arquivo. Logs não recebem nome de arquivo, conteúdo ou mensagens internas do parser.

## Validação e pendências

Testes sintéticos cobrem os três modelos, Filial ignorada nas Atribuições, colunas extras ignoradas em Lotações, datas e períodos, conteúdo perigoso e limites, nomes repetidos/ambíguos/inativos, ciclo e questionário incompatíveis, existência, revalidação, expiração, isolamento, repetição e atomicidade. Interface cobre seleção, conferência, paginação, confirmação, falha, troca de arquivo/ciclo, sessão, teclado e acessibilidade. HTTP/SQL DEV usa lotes fictícios de 379/378 linhas e cinco lotações, histórico e falha após a primeira gravação, com rollback obrigatório. Evidências finais no [STATES.md](../../STATES.md).

Sem novas dependências, migration ou deploy. Para ativar, publicar API e SPA compatíveis pelo processo existente. Reverter binários desabilita a importação, preservando registros e auditorias já criados; não remover dados como rollback.
