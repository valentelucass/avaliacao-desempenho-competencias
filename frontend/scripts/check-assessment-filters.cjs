// Geometria do painel real com dados fictícios; as interações têm cobertura Vitest.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { browserArtifactPath } = require('./browser-artifacts.cjs')
const React = require('react')
const { createRoot } = require('react-dom/client')

module.exports = async function checkAssessmentFilters({ send, frameId, css }) {
  const { AssessmentsPanel } = require('../src/features/assessments/AssessmentsPanel.tsx')
  const mount = document.createElement('div')
  document.body.append(mount)
  const root = createRoot(mount)
  let markup
  try {
    await React.act(async () =>
      root.render(
        React.createElement(AssessmentsPanel, {
          api: {
            listAssessments: async ({ limit }) => ({
              items: [
                'Pessoa fictícia com identificação muito extensa para validar o título truncado',
                'Bruno Santos',
                'Carla Souza',
                'Daniela Lima',
                'Eduardo Rocha',
                'Fernanda Alves',
              ]
                .slice(0, limit)
                .map((name, index) => ({
                  id: `filter-person-${index}`,
                  evaluated: { displayName: name },
                  cycle: { id: 'cycle', name: 'Ciclo fictício' },
                  type: 'GESTOR',
                  status: ['RASCUNHO', 'ENVIADA', 'PUBLICADA'][index % 3],
                  feedbackStatus: index === 0 ? 'PENDENTE' : 'NAO_APLICAVEL',
                })),
              page: { limit, nextCursor: null },
            }),
            listAssessmentCreationCycleOptions: async () => [
              { id: 'cycle', name: 'Ciclo fictício' },
            ],
          },
          canCreateManagerAssessment: true,
          canCreateSelfAssessment: true,
          canCreateDirectorAssessment: false,
          canSubmitSelfAssessment: false,
          canPublishAssessments: false,
          canReopenAssessments: false,
          canRecordFeedback: false,
          isAdministrativeView: false,
          canUseAdministrativeFilters: false,
          onExitEditor() {},
          onSelectAssessment() {},
          onSessionExpired() {},
        }),
      ),
    )
    markup = mount.innerHTML
  } finally {
    await React.act(async () => root.unmount())
    mount.remove()
  }
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result.value
  }
  const cases = []
  for (const theme of ['light', 'dark'])
    for (const width of [320, 375, 768, 1024, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 1100,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await send('Emulation.setEmulatedMedia', { media: 'screen' })
      await send('Page.setDocumentContent', {
        frameId,
        html: `<!doctype html><html data-astryx-theme="neutral" data-theme="${theme}"><head><style>${css}</style></head><body><div id="root"><div class="application-shell ev-shell"><div class="ev-stage"><main class="workspace ev-workspace"><div class="workspace__content">${markup}</div></main></div></div></div></body></html>`,
      })
      await evaluate(
        'document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))',
      )
      const metrics = await evaluate(`(() => {
        const fields = document.querySelector('.ev-filter-fields');
        const table = document.querySelector('table[aria-label="Lista de avaliações"]');
        const measured = el => {
          const r = el.getBoundingClientRect();
          return {left:r.left, right:r.right, top:r.top, height:r.height};
        };
        const controls = [...fields.querySelectorAll('input[type=search], [role=combobox]')];
        return {
          fieldTops: [...fields.children].map(el => Math.round(el.getBoundingClientRect().top)),
          labels: controls.map(el => (el.getAttribute('aria-labelledby') || '').split(' ').map(id=>document.getElementById(id)?.textContent || '').join(' ').trim() || el.labels?.[0]?.textContent || el.getAttribute('aria-label')),
          controls: controls.map(el => measured(el.closest('.astryx-text-input, .astryx-selector') || el)),
          headers: [...table.querySelectorAll('thead th')].map(el => el.textContent.trim()),
          rows: [...table.tBodies[0].rows].map(row => ({
            cells: row.cells.length,
            name: row.querySelector('.ev-person strong').textContent,
            title: row.querySelector('.ev-person strong').title,
            badge: row.querySelector('.astryx-badge').textContent,
            action: measured(row.querySelector('button')),
            summary: document.getElementById(row.querySelector('button').getAttribute('aria-describedby'))?.textContent,
          })),
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
        };
      })()`)
      assert.equal(metrics.overflow, false, `Contêiner excedeu a largura em ${theme}/${width}`)
      assert.deepEqual(metrics.headers, [
        'Colaborador avaliado',
        'Status da avaliação',
        'Tipo',
        'Feedback',
        'Ações',
      ])
      assert.equal(metrics.fieldTops.length, 4)
      assert.equal(new Set(metrics.fieldTops).size, width > 1150 ? 1 : width > 740 ? 2 : 4)
      for (const [i, label] of [
        'Colaborador Avaliado',
        'Gestor Responsável',
        'Status da Avaliação',
        'Status do Feedback',
      ].entries())
        assert.ok(metrics.labels[i]?.includes(label), `Rótulo ausente: ${label}`)
      for (const rect of metrics.controls)
        assert.ok(
          rect.left >= 0 && rect.right <= width + 1 && rect.height >= 32,
          `Controle fora dos limites em ${theme}/${width}: ${JSON.stringify(rect)}`,
        )
      assert.equal(metrics.rows.length, 2)
      assert.equal(
        metrics.rows[0].name,
        'Pessoa fictícia com identificação muito extensa para validar o título truncado',
      )
      for (const row of metrics.rows) {
        assert.equal(row.title, row.name)
        assert.equal(row.cells, 5)
        assert.ok(row.summary?.includes(row.badge))
        assert.ok(row.action.left >= 0 && row.action.right <= width + 1 && row.action.height >= 32)
      }
      await evaluate("document.querySelector('.ev-filter-fields input').focus()")
      await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
      })
      await send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
      })
      assert.equal(
        await evaluate(
          "document.activeElement===document.querySelectorAll('.ev-filter-fields input')[1]",
        ),
        true,
      )
      assert.equal(await evaluate("document.activeElement.matches(':focus-visible')"), true)
      if (width === 375 || width === 1440) {
        await evaluate("document.querySelector('.ev-filter-form').scrollIntoView({block:'start'})")
        const screenshot = await send('Page.captureScreenshot', { format: 'png' })
        fs.writeFileSync(
          browserArtifactPath(`assessment-filters-${theme}-${width}.png`),
          Buffer.from(screenshot.data, 'base64'),
        )
      }
      if (width === 1440) {
        await evaluate("document.querySelector('.ev-table').scrollIntoView({block:'start'})")
        const screenshot = await send('Page.captureScreenshot', { format: 'png' })
        fs.writeFileSync(
          browserArtifactPath(`assessment-table-${theme}-${width}.png`),
          Buffer.from(screenshot.data, 'base64'),
        )
      }
      cases.push({ width, theme, fields: 4, keyboard: true })
    }
  console.log(JSON.stringify({ case: 'Quatro filtros: painel real responsivo e teclado', cases }))
}
