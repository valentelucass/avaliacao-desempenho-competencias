# Referência de design system — Tailwind e shadcn

> Registro de referência técnica atualizado em 2026-08-30. A [ADR-0019](../adr/0019-tailwind-como-compilador-visual-sem-migracao-de-interface.md) autoriza Tailwind exclusivamente como compilador de refinamento visual; não autoriza migração de interface, componentes ou autenticação.

## Origem e objetivo

Foram recebidos arquivos e trechos de outro projeto para inspiração de interface. O material descreve um design system baseado em React, Tailwind CSS 3, variáveis CSS em OKLCH, componentes shadcn compostos sobre Radix UI e ícones Lucide.

O objetivo deste registro é preservar o que foi recebido, indicar dependências e limites de reutilização e evitar que código, bibliotecas ou decisões daquele projeto sejam incorporados por engano.

## Uso ativo restrito

O front-end agora possui Tailwind 3 como ferramenta de compilação de CSS, com configuração ativa em [frontend/tailwind.config.ts](../../frontend/tailwind.config.ts), PostCSS e Autoprefixer. O Preflight está desativado, não há `@tailwind base` e nenhuma classe Tailwind foi adicionada ao JSX.

A camada [visual-skin.css](../../frontend/src/visual-skin.css) é importada após `App.css` e usa apenas tokens da paleta Rodogarcia já existente. Ela não altera estrutura HTML, rotas, sidebar lateral, paginação, responsividade, impressão, autenticação, contrato ou regra de negócio. O tema continua selecionado por `data-theme="light|dark"`; a preferência existente do usuário ou do sistema não foi alterada.

Ela usa `@apply` de forma pontual e não emite utilities Tailwind globais. O `content` da configuração ativa não varre CSS legado, evitando que palavras de regras existentes gerem classes estruturais como `flex`, `grid` ou `fixed` no bundle.

Os arquivos brutos da origem foram organizados em [docs/references/design-system-externo](../references/design-system-externo/README.md). São consulta não normativa; a configuração ativa não reutiliza a configuração, componentes ou autenticação daquele projeto.

## Base documentada

- `tailwind.config.ts` de referência: habilita tema por classe (`darkMode: ["class"]`), mapeia tokens semânticos `--color-*` para utilitários Tailwind, define escala tipográfica, famílias, raio, container e animações de accordion. Está arquivado como fonte externa, não é a configuração ativa.
- Configuração PostCSS: `tailwindcss` e `autoprefixer`.
- `components.json`: configuração shadcn para TypeScript sem RSC, variáveis CSS, Tailwind e aliases como `@/components` e `@/lib/utils`.
- `src/index.css`: camadas Tailwind, tokens claros e escuros em OKLCH, estilos-base e regras adicionais específicas do outro produto.
- `cn`: combinação de `clsx` e `tailwind-merge` para compor utilitários sem classes conflitantes.

Os trechos de componentes recebidos incluem primitivas shadcn/Radix para accordion, alert, alert-dialog, avatar, badge, breadcrumb, botão, card, checkbox, command, dialog, drawer, formulário, input, label, paginação, popover, progress, radio group, sheet, slider, switch, tabela, tabs, textarea, toggle e tooltip. Os anexos também incluem `Calendar` (react-day-picker), `Carousel` (Embla), adaptadores de gráfico Recharts e menus de contexto, dropdown, barra de menu, navegação e select Radix.

O material complementar acrescenta wrappers de base para botão e badge, controle de autoplay, navegação cíclica com progresso, entrada de palavras-chave em chips, logo e primitivas de seção. Ele traz ainda exemplos de cascas de aplicação/workspace, com variações de barra superior, abas e card de conteúdo. Esses layouts são referências de composição visual; suas rotas, cópia, dados de conta e autenticação pertencem ao outro produto.

### Sidebar expansível com pré-visualização

O anexo `Peekable sidebar` encapsula a sidebar shadcn sem modificar a primitiva original. Ele mantém uma máquina de estados para os modos expandido, recolhido e aberto temporariamente por hover, persiste preferência de largura/expansão em `localStorage`, limita a largura entre 200 e 480 px e usa uma única superfície visual animada. O disparo por aproximação da borda esquerda é exclusivo para desktop; em telas menores, a sidebar fica recolhida e não monitora mouse.

Esse padrão é uma referência de comportamento, não uma recomendação adotada. Caso venha a ser avaliado, o botão explícito de expandir/recolher e todos os itens devem permanecer plenamente operáveis por teclado e toque; hover não pode ser a única forma de revelar navegação. Os `console.log` de diagnóstico, o armazenamento de preferência e a duração de animação deverão ser revisados para o contexto deste sistema. Preferências de apresentação podem ser armazenadas localmente, mas credenciais, dados de avaliação, permissão ou escopo nunca podem ser armazenados no navegador.

### Componentes complementares e limites

- `AutoplayToggle` e `CyclerNav`: controle visual para carrosséis/mostruários. Não há caso de uso aprovado para autoplay na aplicação interna; qualquer uso futuro deve permitir pausa, não depender de animação para transmitir informação e respeitar preferência de movimento reduzido.
- `KeywordChipsInput`: transforma texto separado por vírgula em chips removíveis. Caso seja usado, precisa de label externo associado ao `input`, regras explícitas de normalização, limite de quantidade/tamanho e mensagem de erro acessível. Não foi associado a nenhum campo do domínio.
- Wrappers de `Button` e `Badge`: exemplificam centralização de aparência. O badge de origem usa cores Tailwind diretas (`gray`, `blue`, `amber`, `red`, `green` e `purple`), portanto não deve ser copiado como token oficial; uma eventual versão deve se apoiar em tokens semânticos, contraste medido e significado que não dependa só da cor.
- `Section`, `SectionContainer`, `SectionRow` e `SectionTitle`: servem para landing pages e delimitam largura, espaçamento e títulos. Podem inspirar uma futura camada de layout, mas não determinam a estrutura atual por funcionalidades.
- `Logo` e os exemplos de workspace: contêm nome, rotas, textos em inglês, metadados de usuário e fluxo de demo específicos da origem. Não são reutilizáveis no produto atual.
- `SocialAuthButtons`: usa o broker Lovable/Supabase e provedores Google/Apple. É incompatível com a autenticação local já implementada e não pode ser incorporado, mesmo como componente visual, sem uma nova decisão de autenticação e autorização explícita.

## Propriedades reutilizáveis como referência

- Tokens semânticos, em vez de cores diretamente nas telas: fundo, texto, superfície, borda, foco, ações e estados.
- Tema claro/escuro como alteração de tokens, não duplicação de componentes ou lógica de negócio.
- Primitivas acessíveis que preservam foco, teclado e atributos ARIA, desde que sejam integradas e testadas no fluxo final.
- Componentes de composição pequena: variantes de botão, campos, mensagens de erro, diálogos, tabelas, paginação e tooltips.
- Gráficos responsivos com legenda e tooltip temáticos, sempre subordinados aos dados já autorizados pelo servidor.

## Incompatibilidades e limites para este projeto

O front-end usa CSS próprio e tokens em `frontend/src/index.css` como fonte de verdade; Tailwind foi adicionado apenas como compilador da camada visual. O tema ativo continua selecionado por `data-theme="light"` ou `data-theme="dark"`. A configuração ativa mapeia esse seletor, em vez de adotar a classe `.dark` da referência.

O `frontend/package.json` declara somente Tailwind, PostCSS e Autoprefixer entre as ferramentas da referência. `tailwindcss-animate`, Radix, `class-variance-authority`, `clsx`, `tailwind-merge`, Recharts, Embla e react-day-picker não foram adotados. O `tailwind.config.ts` de origem foi arquivado e não é carregado pelo Vite; os aliases `@/` do material externo também não foram configurados.

O pacote de origem contém diversas dependências que não pertencem ao escopo deste sistema, incluindo Supabase/Lovable, IA, mídia, fluxos, drag-and-drop e outros recursos. Elas não devem ser copiadas em bloco. Caso uma migração seja autorizada, cada dependência deverá ter consumidor identificado, versão compatível com React 19, licença e vulnerabilidades verificadas.

As diretivas `"use client"` são próprias de ambientes que podem renderizar no servidor; não são necessárias na SPA Vite atual. As strings em inglês dos componentes de referência também não devem ser transportadas para a aplicação sem revisão de conteúdo em português.

## Limites obrigatórios do uso ativo e de qualquer expansão

- Manter `:root[data-theme="dark"]` ou migrá-lo de forma integral e testada; não alterar o comportamento atual de tema por cópia da classe `.dark`.
- Conservar labels, associação entre campo e erro, foco visível, navegação por teclado, contraste e testes axe. Primitivas Radix reduzem trabalho, mas não comprovam a acessibilidade da tela composta.
- Não depender de menu de contexto como única forma de realizar uma ação: ações precisam ter alternativa visível e utilizável em celular e teclado.
- Não adotar hover, autoplay, carrossel ou animações como requisito de navegação. Quando forem meramente decorativos, devem respeitar `prefers-reduced-motion`; quando forem interativos, precisam de controles equivalentes por toque e teclado.
- Usar `Calendar`, `Carousel`, `Menubar` e outros componentes somente se houver caso de uso aprovado; não introduzir biblioteca por catálogo disponível.
- Os indicadores continuam protegidos pela supressão de grupos com menos de cinco colaboradores. Gráficos, tooltip, legenda, tabela, filtro ou estado vazio não podem expor nem permitir inferir dados suprimidos.
- O adaptador de gráficos recebido cria uma tag `style` com `dangerouslySetInnerHTML`. Em eventual uso, sua configuração deve ser somente código controlado pela aplicação, nunca dados recebidos de API, usuário ou avaliação.

## Estado da referência

O material continua sendo fonte de inspiração registrada. Foram instaladas somente as ferramentas de compilação CSS autorizadas e criada uma camada visual limitada; não houve cópia de componente, mudança de contrato, modificação de autenticação ou liberação operacional.

Uma eventual migração para Tailwind utilities no JSX, shadcn/Radix ou componentes externos deverá ser proposta como tarefa própria, com inventário dos componentes necessários, plano de compatibilidade, revisão de dependências, testes de tema claro/escuro, acessibilidade e gate de qualidade completo.
