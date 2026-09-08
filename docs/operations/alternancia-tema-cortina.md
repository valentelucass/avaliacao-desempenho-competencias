# Alternância de tema com cortina — ADC-UI-049

## Integração localizada

O componente enviado pelo usuário foi adaptado em `frontend/src/components/ui/curtain-theme-toggle.tsx`, com CSS próprio em `curtain-theme-toggle.css`. A variante `icon` substitui somente os dois pontos de renderização do botão atual: cabeçalho autenticado em `App.tsx` e `AuthPageFrame.tsx` (login, recuperação de sessão e troca obrigatória de senha). Preserva as classes, dimensões, ícones e rótulos em português dos controles existentes.

O aplicativo continua responsável por `theme`, pelo atributo `data-theme` e pela preferência visual `adc-theme`. O componente controlado apenas chama `onThemeChange(next)`; não escreve em storage nem cria uma classe global `dark`. Não há qualquer mudança em cookies, credenciais, API, permissões ou dados de avaliação. Os CSS globais e as tabelas da tarefa anterior não foram modificados nesta integração.

A cortina usa as cores-base atuais da plataforma (`#edf3f8`/`#0b1220`) e animação de escala vertical. A troca acontece ao fim da descida, com `animationend`, antes da subida. Um timeout de segurança evita prender a interface se o navegador não entregar o evento. Duração padrão de 550 ms por fase; `duration={0}` desativa a animação. A trava síncrona impede repetições durante o movimento.

Uma sobreposição temporária via portal no body evita recorte pelo cabeçalho. Ela é decorativa (`aria-hidden`) e intercepta o ponteiro enquanto cobre a página; não move foco nem interfere no conteúdo dos campos. O botão mantém foco por teclado e sinaliza indisponibilidade transitória com `aria-disabled`. Os timers/listeners são removidos ao desmontar; sair da tela antes da troca não dispara um callback atrasado.

Com `prefers-reduced-motion: reduce`, a troca é imediata e sem cortina. Ativar essa preferência durante a animação encerra o efeito. `beforeprint` finaliza uma animação ativa e o CSS de impressão oculta o overlay e o controle, sem mudar o layout A4 da avaliação.

## Estrutura, uso e demonstração

React, TypeScript, Tailwind e o alias `@/` já estavam disponíveis. `frontend/src/components/ui` corresponde ao caminho `@/components/ui` solicitado e permite reutilizar exemplos do ecossistema shadcn sem mover a pasta anterior `src/ui`. Os estilos globais continuam em `src/index.css`, `src/App.css` e `src/visual-skin.css`; o efeito possui somente classes locais `adc-curtain-*`/`adc-theme-curtain`.

Nenhuma nova dependência é necessária: React, React DOM e lucide-react já constavam do projeto. Não se executou inicialização shadcn ou reconfiguração de Tailwind. Para uso futuro do CLI, a orientação opcional e os cuidados com os estilos existentes estão em [tabelas-administrativas-reshaped.md](tabelas-administrativas-reshaped.md#shadcn-cli-opcional).

```tsx
import { ThemeToggle } from '@/components/ui/curtain-theme-toggle'

<ThemeToggle
  variant="icon"
  theme={theme}
  onThemeChange={setTheme}
  className="icon-button theme-toggle"
/>
```

`curtain-theme-toggle-demo.tsx` contém a demonstração importável do botão, sem sobrescrever `demo.tsx` da tabela e sem criar uma rota pública. As variantes `default` e `appbar` permanecem disponíveis para exemplos, mas não substituem os cabeçalhos da plataforma. No uso independente, `defaultTheme` é respeitado quando não há `data-theme` válido, e a alteração atualiza somente `data-theme`, sem persistência própria.

## Verificação e limites

Testes unitários cobrem estado inicial/controlado, fases, repetição, foco preservado, callback único, preferência de movimento reduzido, impressão, desmontagem, fallback sem evento, pesquisa da variante appbar e axe. O teste existente de `App` aguarda a troca animada e ainda exige persistência em `adc-theme`; outra regressão confirma que o campo de login permanece preenchido e a preferência é restaurada ao remontar. Resultado final: 126 testes front-end em 14 arquivos aprovados, além do gate completo registrado no `STATES.md`.

O ensaio `check-curtain-theme-toggle.cjs`, chamado pelo gate existente de impressão, compila em memória uma fixture React separada da SPA, sem API/storage/dados reais. Mede quadros intermediários da animação em Edge com 375/1440 px, acionamento por Enter, foco visível, troca nos dois sentidos, sincronização das tabelas Reshaped, preservação de campo, movimento reduzido, ocultação na impressão e desmontagem. Screenshots fictícios ficam em `frontend/dist/curtain-theme-toggle-375.png` e `curtain-theme-toggle-1440.png` (ignorados pelo Git).

O aumento de bundle desta tarefa é pequeno e não acrescenta dependências; o aviso anterior de chunk maior que 500 kB devido à integração Reshaped permanece visível. Validação automatizada não substitui aceite humano com leitor de tela, dispositivos físicos e impressão real. Nenhum serviço foi iniciado/encerrado ou deploy realizado.

Rollback: restaurar somente os dois botões anteriores, remover os arquivos/ensaio da cortina e sua chamada no gate, preservando o trabalho das tabelas e o gerenciamento de tema em `App`. Não há banco ou contrato a reverter.

Referências técnicas: [portais do React](https://react.dev/reference/react-dom/createPortal) e [preferência de movimento reduzido](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion).
