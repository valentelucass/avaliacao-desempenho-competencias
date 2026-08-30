# ADR-0019 — Tailwind como compilador visual sem migração de interface

- **Status:** Aceita para o refinamento visual da SPA.
- **Data:** 2026-08-30
- **Origem:** Autorização explícita do usuário para melhorar apenas a aparência, preservando a estrutura e o comportamento existentes.

## Contexto

A SPA React já possui navegação lateral, paginação, diálogos, formulários, temas claro/escuro e regras de responsividade cobertos por testes. Foram recebidas referências de outro projeto baseado em Tailwind, shadcn e Radix, mas esse material também contém layouts, autenticação Lovable/Supabase, rotas e componentes incompatíveis com a arquitetura atual.

O objetivo autorizado é usar a disciplina de tokens e acabamento visual do material de referência sem reposicionar elementos, alterar a sidebar lateral, trocar componentes, mudar a quantidade de itens por página, modificar rotas, APIs, permissões ou comportamento. Os temas claro e escuro existentes, inclusive a preferência já persistida ou oriunda do sistema, permanecem disponíveis e inalterados em comportamento.

## Decisão

- Adotar `tailwindcss` 3.4.17, PostCSS 8.5.26 e Autoprefixer 10.4.21 apenas como dependências de desenvolvimento para compilar CSS.
- Manter a configuração ativa em `frontend/tailwind.config.ts` e o processamento em `frontend/postcss.config.mjs`.
- Desativar o Preflight e não usar `@tailwind base`, pois o reset global poderia alterar controles, tabelas, impressão e elementos acessíveis já existentes.
- Não emitir utilitários Tailwind globais: a camada usa `@apply` como compilação pontual, sem diretivas `@tailwind` de saída, e a configuração não varre arquivos CSS. Assim, classes estruturais como `flex`, `grid` ou `fixed` não entram no bundle por detecção do CSS legado.
- Aplicar a camada `frontend/src/visual-skin.css` após `App.css`, sem modificar marcação, componentes ou lógica. Essa camada pode alterar somente cores, superfícies, bordas, raios, sombras, foco e estados visuais.
- Mapear utilitários Tailwind para os tokens CSS Rodogarcia existentes. O seletor de tema permanece `data-theme="light|dark"`; a classe `.dark` da referência externa não é adotada.
- Não instalar ou importar shadcn, Radix, Supabase/Lovable, layouts externos, componentes de navegação, sidebar, carousel ou bibliotecas do catálogo de referência.
- Arquivar as fontes externas em `docs/references/design-system-externo/`; elas não são configuração ativa nem convenções obrigatórias do repositório.

## Consequências

- A organização do CSS passa a ter uma camada visual final e auditável, enquanto `App.css` continua autoridade para geometria, layout, paginação, responsividade e impressão.
- Alterações futuras nessa camada não podem introduzir `display`, posicionamento, tamanho, grid/flex, margem, padding, gap, overflow, breakpoint, ordem, conteúdo ou tipografia que provoque reflow de interface sem uma autorização específica.
- A camada precisa produzir uma diferença perceptível em superfícies e estados, sem remapear apenas os mesmos tokens já definidos por `App.css`; seletor e especificidade devem ser conferidos contra as classes reais da SPA.
- Os testes funcionais e de acessibilidade existentes continuam obrigatórios. Qualquer expansão para componentes ou utilities no JSX exige uma nova decisão, escopo explícito e revisão de regressão.
- A adição de dependências exige auditoria de vulnerabilidades. A versão inicial de PostCSS recebida na referência estava vulnerável; foi usada a versão corrigida 8.5.26, validada sem vulnerabilidades conhecidas pelo `npm audit`.
