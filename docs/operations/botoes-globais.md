# Botões globais — ADC-UI-050

## Referência e escopo

O usuário solicitou usar a imagem de um botão vermelho sólido com ícone e texto como referência global. Depois esclareceu que a referência é de estilo, saturação e ícones, não de tamanho: não deseja botões gigantes. A versão final mantém escala compacta: altura mínima de 38 px para ações comuns e 36 px para tabelas/controles de ícone, cantos de 10 px e ícones de 18 px. Rótulos longos podem quebrar nos espaços em telas estreitas; ações de tabela desktop reservam largura para ícone e texto em uma linha.

A mudança de produção está concentrada no bloco de botões de `frontend/src/visual-skin.css`, reutilizando `.button`, `.icon-button`, `.account-actions__trigger` e o indicador de paginação. Não adiciona componente, dependência, ícone por ação sem contexto nem reescreve JSX/callbacks. Os ícones Lucide existentes foram preservados, com tamanho/alinhamento uniformes e sem compressão no flex.

Cobertura: login/troca de senha, cabeçalho e botão de tema, formulários, avaliações, filtros, administração, diálogos, ações de conta e paginação. Cartões de jornada, links de navegação, ajuda contextual e backdrops mantêm sua composição; não são convertidos em botões retangulares de formulário. As larguras e a organização responsiva das telas continuam sob os componentes existentes.

## Aparência e estados

- Preenchimento sólido, sem os gradientes e sombras decorativas anteriores; ícone e texto com separação de 8 px.
- Azul nas ações primárias, verde em salvar/concluir, vermelho em ações destrutivas e neutro nas secundárias. Não foi aplicada cor de exclusão a todas as ações.
- Texto branco nas ações coloridas em ambos os temas. Vermelho `#dc3038`, ligeiramente mais escuro que o da referência, garante aproximadamente 4,64:1 com branco inclusive nos rótulos compactos. O mínimo de 4,5:1 para texto normal segue a [referência de contraste da W3C](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- `button--quiet` continua secundário e compacto, mas não herda mais `font-size: 0` no celular. A combinação danger/quiet mantém sua função destrutiva e o texto visível.
- Desabilitados (`disabled`/`aria-disabled`) usam cores neutras, não recebem ponteiro, hover, transformação ou transição. Isso não substitui os guardas de clique/permissão já existentes.
- Hover de controles habilitados altera somente a cor, sem ampliar/mover o botão. Foco por teclado continua visível; movimento reduzido remove transições.
- O número da página não é clicável e usa cursor padrão. A navegação permanece nos botões de anterior/próxima.

Todas as regras visuais de aplicação estão dentro de `@media screen`; as regras de impressão das avaliações não foram alteradas.

## Verificações

`frontend/scripts/check-global-buttons.cjs` é chamado pelo ensaio Edge existente. Usa os seletores reais e ícones Lucide, sem API ou dados reais, para verificar 16 variantes/contextos em 320/375/768/1024/1440 px, nos dois temas: 160 combinações. Mede contraste, escala compacta, cantos, ícones, rótulos, ausência de overflow, preenchimento sólido, foco/Tab, hover inativo e movimento reduzido. As capturas fictícias ficam em `frontend/dist/global-buttons-light.png` e `global-buttons-dark.png`, ignoradas pelo Git.

Após esse primeiro ensaio, o usuário encontrou `Encerrar` quebrado letra por letra no painel de vínculos. A regra `overflow-wrap: anywhere` combinada à coluna de ação de `width: 1%` permitia encolher o botão até inflar a linha. Foi substituída por quebra normal e, somente nas ações administrativas desktop, `min-width: max-content`, `flex-shrink: 0` e `white-space: nowrap`. Não se mudou a estrutura da tabela nem o comportamento no celular.

`check-relationship-table.cjs` passou a montar o `RelationshipAdministrationPanel` real, com sete vínculos fictícios e API simulada sem escritas. Verifica uma linha de texto, altura de 36–40 px, ícone, limites da célula, altura das linhas, confirmação/cancelamento e paginação. Abrange os dois temas, cinco larguras usuais e viewports efetivos de 1280/960 px com DPR 1,5/2; isso simula densidade/layout, não constitui teste manual do zoom do navegador. O teste de sensibilidade reaplica o CSS antigo e exige reproduzir a quebra antes de remover essa folha de teste. Capturas ficam em `frontend/dist/relationships-buttons-fixed-{light,dark}-150.png`, ignoradas pelo Git.

Os ensaios anteriores continuam sendo executados: tabelas administrativas, cortina de tema, impressão A4/21 notas e opções de avaliação desabilitadas. No helper da cortina, o valor anterior de `NODE_ENV` é restaurado após compilar a fixture em memória, evitando misturar React de desenvolvimento já carregado com renderer server de produção nos testes seguintes. Com a fixture longa, a largura da cortina é comparada ao viewport útil (`clientWidth`), excluindo a barra de rolagem. Essas correções são exclusivas do ensaio e não alteram configuração da SPA ou serviços.

Evidência final do gate, contagem de testes e ressalvas ficam no `STATES.md`. Aceite assistivo humano e testes com aparelhos/impressoras físicos continuam externos. Não há alteração de dados, API, autorização, configuração de dependências ou deploy nesta tarefa.

## Recuperação

Reverter somente o bloco de estilos/tokens de botões desta tarefa e a nova verificação, mantendo as integrações anteriores de tabelas e cortina. Não há migration ou dado para recuperar. O aviso anterior de bundle acima de 500 kB permanece conhecido, sem nova dependência ou limite silenciado.
