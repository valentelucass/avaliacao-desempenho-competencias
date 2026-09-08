# Tabelas administrativas — integração Reshaped

## Estrutura e escopo

O front-end já usa React 19, TypeScript e Tailwind CSS 3.4, com Preflight desativado e estilos da aplicação em `frontend/src/index.css`, `App.css` e `visual-skin.css`. Não foi necessário instalar/reconfigurar essas tecnologias.

Os componentes compartilhados anteriores permanecem em `frontend/src/ui`. A pasta adicionada `frontend/src/components/ui` corresponde a `@/components/ui`, com resolução configurada no Vite/Vitest e nos tsconfig. Essa convenção facilita copiar exemplos do ecossistema shadcn e organizar componentes visuais reutilizáveis; não é requisito do React nem motivo para mover os componentes existentes.

- `reshaped-table.tsx`: reexporta `Table` e `TableProps` reais de `reshaped/bundle`, incluindo o CSS pré-compilado e o tema Slate solicitados.
- `reshaped-table-scope.tsx`: usa `Reshaped scoped`, sincronizado com o `data-theme` já controlado pela aplicação. O provider não foi colocado na raiz do aplicativo.
- `administrative-table.tsx`: adaptação semântica dos slots reais do pacote para os atributos HTML existentes. Mantém `<table>` e `<caption>` nativos, pois a raiz do `Table` da biblioteca encaminha atributos para uma `<div>` e não oferece uma propriedade própria para caption. Não se utiliza manipulação imperativa do DOM para nomear tabelas.
- `reshaped-table.css`: ajustes limitados às classes novas, reutilizando cores/fonte da aplicação; sem edição dos estilos globais ou regras de impressão.
- `demo.tsx`: exemplo solicitado de Card/Table com cabeçalho mesclado, usando provider local. É um exemplo importável, não uma nova rota ou tela publicada.

Aplicado, conforme escolha explícita do usuário, a todos os cinco painéis administrativos: contas, cadastros (filiais, áreas, colaboradores, lotações e atribuições), vínculos, versões de questionário e ciclos/questionários aplicados. Foram preservados captions, `scope`, `data-label`, classes específicas de celular, colSpan, placeholders, controles, filtros, ações e paginação. Linhas passivas não receberam clique ou tabulação.

Não foram modificados a tabela individual de notas, indicadores, gráfico, formulários de avaliação, autenticação, permissões, API, banco, launchers ou deploy.

## Instalação reproduzível

Na pasta `frontend`, `npm ci` instala a versão já fixada no lockfile. A dependência adicionada foi somente `reshaped@4.1.0`, compatível com React 18/19 segundo o manifesto do pacote. Não foi executado `npm audit fix`, atualização do React/Tailwind ou substituição do PostCSS.

O pacote pré-compilado dispensa a configuração PostCSS específica do Reshaped. Sua contrapartida é incluir o CSS de toda a biblioteca: no build medido, JS de aproximadamente 610 kB (170 kB gzip) e CSS de 511 kB (53 kB gzip), contra aproximadamente 404/119 kB antes da integração. O aviso de chunk acima de 500 kB foi mantido visível, não silenciado. Não foi feita uma refatoração de carregamento/rotas apenas para eliminar esse aviso.

### shadcn CLI opcional

A estrutura/alias permitem integrar componentes por cópia. O projeto não foi reinicializado pelo shadcn CLI e não declara um `components.json` ficticiamente completo: esta tabela usa Reshaped, não depende de `cn`, Radix ou componentes shadcn adicionais.

Caso seja necessário administrar novos componentes pelo CLI, iniciar em uma branch separada, dentro de `frontend`:

```cmd
npx shadcn@latest init
```

Selecionar Vite/TypeScript, configurar os aliases para `@/components` e `@/components/ui` e revisar o diff antes de aceitar mudanças em CSS/Tailwind/PostCSS. O arquivo atual de configuração do Tailwind é `tailwind.config.ts` e sua folha compiladora é `src/visual-skin.css`. Preservar `preflight: false` e o tema existente; não executar a inicialização em produção nem sobrescrever estilos automaticamente. Esta etapa não é necessária para usar o componente entregue. A configuração `components.json` é opcional no método de cópia, conforme a [documentação oficial do shadcn](https://ui.shadcn.com/docs/components-json).

## Validação

Testes de componente cobrem semântica, células mescladas, rótulos mobile, ações habilitadas/desabilitadas, isolamento/troca de tema, axe e demonstração. Os testes dos painéis continuam cobrindo seus próprios fluxos e contratos sem mockar a tabela real.

O gate chama `frontend/scripts/check-assessment-print.cjs`, que também executa `check-administrative-tables.cjs`: Edge real, componentes e CSS atuais, dez variações de tabela em 320/375/768/1024/1440 px e temas claro/escuro. Confere ausência de overflow/células cortadas, linhas passivas, tema não aplicado no HTML e estilos representativos fora das tabelas comparados com as folhas anteriores da SPA. Também mantém o ensaio A4/21 notas/hover desabilitado.

O teste jsdom usa um substituto mínimo para `matchMedia`, sem alegar validação de layout; as medidas responsivas vêm do Edge. O screenshot fictício do ensaio fica em `frontend/dist/administrative-tables-regression.png`, ignorado pelo Git. Nenhum teste novo usa API, credenciais ou dados reais.

## Limites e recuperação

Preservar a integração restrita às tabelas; outros componentes do pacote exigem revisão própria. O modo `scoped` limita tema/reset ao conteúdo, mas a biblioteca mantém listeners globais de teclado/direção e preferências de movimento: não é um sandbox ou Shadow DOM. Não alterar estilos do login ou formulários para acomodá-la.

Rollback de interface: desfazer somente a migração dos cinco painéis e os arquivos/configurações desta tarefa, restaurar package/lockfile juntos e executar `npm ci` e o gate. Não há migration, alteração de dado ou recuperação SQL necessária. Aceite humano com leitor de tela e dispositivos físicos continua separado.

Referências: [Table](https://www.reshaped.so/docs/components/table), [provider e modo scoped](https://www.reshaped.so/docs/utilities/reshaped), [instalação e bundle pré-compilado](https://www.reshaped.so/docs/getting-started/react/installation).
