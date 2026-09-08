// Chamado pelo ensaio Edge existente. Componentes reais, sem API ou dados reais.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const React = require('react')
const { createRoot } = require('react-dom/client')
const postcss = require('postcss')
const tailwind = require('tailwindcss')

const variants = [
  [
    'Contas locais',
    'administration-users local-users-table',
    '',
    ['Nome', 'Login', 'Situação', 'Ação'],
  ],
  ['Filiais', 'administration-users', '', ['Nome', 'Situação', 'Ação']],
  ['Áreas', 'administration-users', '', ['Nome', 'Situação', 'Ação']],
  ['Colaboradores', 'administration-users', '', ['Nome', 'Situação', 'Ação']],
  [
    'Lotações',
    'administration-users allocations-table',
    '',
    ['Colaborador', 'Filial', 'Área', 'Gestor', 'Início', 'Ação'],
  ],
  [
    'Atribuições',
    'administration-users questionnaire-assignments-table',
    '',
    ['Colaborador', 'Ciclo e questionário', 'Ação'],
  ],
  ['Vínculos', 'administration-users', '', ['Conta avaliadora', 'Colaborador', 'Início', 'Ação']],
  ['Ciclos', 'administration-users', '', ['Ciclo', 'Situação', 'Ação']],
  [
    'Versões',
    'administration-users',
    'questionnaire-versions__table',
    ['Questionário', 'Versão', 'Título', 'Configuração aprovada'],
  ],
  [
    'Questionários do ciclo',
    'cycle-questionnaire-table',
    '',
    ['Questionário', 'Versão', 'Configuração', 'Autoavaliação'],
  ],
]

module.exports = async function checkAdministrativeTables({ send, frameId, css }) {
  Module._extensions['.css'] = () => {}
  global.MutationObserver = window.MutationObserver
  window.matchMedia = (media) => ({
    matches: false,
    media,
    addEventListener() {},
    removeEventListener() {},
  })
  const { AdministrativeTable: Table } = require('../src/components/ui/administrative-table.tsx')
  const mount = document.createElement('div')
  document.body.append(mount)
  const root = createRoot(mount)
  const e = React.createElement
  let markup
  try {
    await React.act(async () =>
      root.render(
        e(
          React.Fragment,
          null,
          variants.map(([name, wrapper, className, columns]) =>
            e(
              'section',
              { key: name, className: 'card' },
              e('h2', null, name),
              e(
                'div',
                { className: wrapper },
                e(
                  Table,
                  { className },
                  e('caption', { className: 'visually-hidden' }, name),
                  e(
                    Table.Head,
                    null,
                    e(
                      Table.Row,
                      null,
                      columns.map((label) => e(Table.Heading, { key: label, scope: 'col' }, label)),
                    ),
                  ),
                  e(
                    Table.Body,
                    null,
                    [0, 1].map((row) =>
                      e(
                        Table.Row,
                        { key: row },
                        columns.map((label) =>
                          e(
                            Table.Cell,
                            { key: label, 'data-label': label },
                            label === 'Ação'
                              ? e(
                                  'button',
                                  { className: 'button', type: 'button', disabled: row === 1 },
                                  'Consultar',
                                )
                              : label === 'Autoavaliação'
                                ? e('input', {
                                    type: 'checkbox',
                                    'aria-label': 'Habilitar autoavaliação fictícia',
                                    defaultChecked: true,
                                  })
                                : label === 'Início'
                                  ? '08/09/2026'
                                  : label === 'Situação'
                                    ? 'Ativa'
                                    : label === 'Versão'
                                      ? 'v1'
                                      : label === 'Login'
                                        ? 'conta.ficticia.com.identificacao.extensa@avaliacao.test'
                                        : 'Registro fictício com descrição extensa para verificar quebra de texto e leitura no celular',
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    )
    markup = mount.innerHTML
  } finally {
    await React.act(async () => root.unmount())
    mount.remove()
  }

  // Comparar controles fora das tabelas contra as mesmas folhas da SPA sem o pacote.
  const legacySource = ['index.css', 'App.css', 'visual-skin.css']
    .map((name) => fs.readFileSync('src/' + name, 'utf8'))
    .join('\n')
  const legacy = await postcss([tailwind(require('../tailwind.config.ts').default)]).process(
    legacySource,
    { from: undefined },
  )
  const probes =
    '<div id="outside"><h2>Controle existente</h2><button class="button">Ação existente</button><input aria-label="Campo existente" value="Teste"><label class="answer-option"><input type="radio" disabled>Resposta existente</label></div>'
  const load = async (styles, content, theme) => {
    await send('Page.setDocumentContent', {
      frameId,
      html:
        '<!doctype html><html data-theme="' +
        theme +
        '"><head><style>' +
        styles +
        '</style></head><body><div id="root"><div class="application-shell">' +
        content +
        '</div></div></body></html>',
    })
    await send('Runtime.evaluate', {
      expression:
        'document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))',
      awaitPromise: true,
    })
  }
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true })
    if (response.exceptionDetails) throw new Error('Falha na medição do navegador.')
    return response.result.value
  }
  const outsideStyles = `(() => [...document.querySelectorAll('#outside, #outside *')].map(e => { const s=getComputedStyle(e); return ['color','backgroundColor','fontSize','fontFamily','padding','borderRadius','cursor','display'].map(p=>s[p]) }))()`
  const cases = []
  await send('Emulation.setEmulatedMedia', { media: 'screen' })
  for (const theme of ['light', 'dark']) {
    for (const width of [320, 375, 768, 1024, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await load(legacy.css, probes, theme)
      const before = await evaluate(outsideStyles)
      await load(
        css,
        probes +
          markup.replaceAll('data-rs-color-mode="light"', 'data-rs-color-mode="' + theme + '"'),
        theme,
      )
      const after = await evaluate(outsideStyles)
      assert.deepEqual(after, before, `Estilos externos alterados (${theme}, ${width}px)`)
      const metrics = await evaluate(`(() => {
        const tables=[...document.querySelectorAll('.adc-administrative-table')];
        const overflow=tables.filter(t=>{const r=t.getBoundingClientRect();return r.right>innerWidth+1||r.left<0});
        const outsideCells=[...document.querySelectorAll('.adc-administrative-table td')].filter(td=>{const r=td.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left<0)});
        return {tables:tables.length,overflow:overflow.map(t=>t.caption.textContent),outsideCells:outsideCells.length,
        passiveRows:tables.every(t=>!t.querySelector('tr[tabindex]')),pageOverflow:document.documentElement.scrollWidth>innerWidth+1,
        globalTheme:document.documentElement.hasAttribute('data-rs-theme')};})()`)
      assert.equal(metrics.tables, variants.length)
      assert.deepEqual(metrics.overflow, [], `Tabela excedeu viewport (${theme}, ${width}px)`)
      assert.equal(metrics.outsideCells, 0, `Célula cortada (${theme}, ${width}px)`)
      assert.equal(
        metrics.pageOverflow,
        false,
        `Rolagem horizontal na página (${theme}, ${width}px)`,
      )
      assert.equal(metrics.passiveRows, true)
      assert.equal(metrics.globalTheme, false)
      cases.push({ theme, width, tables: metrics.tables })
    }
  }

  const row = await evaluate(
    `(() => { const e=document.querySelector('.adc-administrative-table tbody tr'); e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+8,y:r.y+8,background:getComputedStyle(e).backgroundColor}; })()`,
  )
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: row.x, y: row.y })
  assert.equal(
    await evaluate(
      "getComputedStyle(document.querySelector('.adc-administrative-table tbody tr')).backgroundColor",
    ),
    row.background,
    'Linha passiva mudou com hover',
  )
  // Artefato fictício local, dentro de dist (ignorado), para inspeção visual.
  const screenshot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(
    'dist/administrative-tables-regression.png',
    Buffer.from(screenshot.data, 'base64'),
  )
  console.log(
    JSON.stringify({ case: 'Tabelas administrativas: responsividade e isolamento', cases }),
  )
}
