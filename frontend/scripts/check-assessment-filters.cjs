// Geometria do painel real com dados fictícios; as interações têm cobertura Vitest.
const assert = require('node:assert/strict')
const fs = require('node:fs')
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
                  status: ['RASCUNHO', 'ENVIADA', 'PUBLICADA'][index],
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
        html: `<!doctype html><html data-theme="${theme}"><head><style>${css}</style></head><body><div id="root"><main class="application-shell">${markup}</main></div></body></html>`,
      })
      await evaluate(
        'document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))',
      )
      const metrics = await evaluate(`(() => {
      const form=document.querySelector('.assessment-list-filters');
      const cards=[...document.querySelectorAll('.assessment-list__item')].map(card => {
        const header=card.querySelector('.assessment-list__details'), metadata=card.querySelector('.assessment-list__metadata'), footer=card.querySelector('.assessment-list__actions');
        const cardRect=card.getBoundingClientRect(), footerRect=footer.getBoundingClientRect(), button=footer.querySelector('button').getBoundingClientRect(), title=header.querySelector('h3'), titleStyle=getComputedStyle(title);
        return {hasHeader:!!header,hasMetadata:!!metadata,hasFooter:!!footer,footerTop:footerRect.top,cardBottom:cardRect.bottom,cardTop:cardRect.top,buttonLeft:button.left,buttonRight:button.right,buttonTop:button.top,buttonBottom:button.bottom,buttonHeight:button.height,title:{full:title.title,clientWidth:title.clientWidth,scrollWidth:title.scrollWidth,whiteSpace:titleStyle.whiteSpace,textOverflow:titleStyle.textOverflow}};
      });
      return {fields:[...form.querySelectorAll('.field')].map(e=>({top:e.getBoundingClientRect().top})),
        controls:[...form.querySelectorAll('input,select,button')].map(e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,height:e.getBoundingClientRect().height})),
        labels:[...form.querySelectorAll('label')].every(e=>!!document.getElementById(e.htmlFor)), cards, listAlignment:getComputedStyle(document.querySelector('.assessment-list')).alignItems, columns:getComputedStyle(document.querySelector('.assessment-list')).gridTemplateColumns.trim().split(/\\s+/).length,
        overflow:document.documentElement.scrollWidth>innerWidth+1};})()`)
      assert.equal(metrics.fields.length, 4)
      assert.equal(metrics.cards.length, 2)
      assert.equal(metrics.listAlignment, 'stretch')
      assert.equal(metrics.columns, width >= 1280 ? 3 : width >= 769 ? 2 : 1)
      assert.equal(metrics.labels, true)
      assert.equal(metrics.overflow, false)
      assert.equal(
        new Set(metrics.fields.map((e) => Math.round(e.top))).size,
        width > 1024 ? 1 : width > 640 ? 2 : 4,
      )
      for (const control of metrics.controls)
        assert.ok(control.left >= 0 && control.right <= width + 1 && control.height >= 36)
      for (const card of metrics.cards) {
        assert.equal(card.hasHeader, true)
        assert.equal(card.hasMetadata, true)
        assert.equal(card.hasFooter, true)
        assert.ok(card.footerTop < card.cardBottom)
        assert.ok(card.buttonLeft >= 0 && card.buttonRight <= width + 1 && card.buttonHeight >= 36)
        assert.equal(card.title.whiteSpace, 'nowrap')
        assert.equal(card.title.textOverflow, 'ellipsis')
      }
      assert.equal(
        metrics.cards[0].title.full,
        'Pessoa fictícia com identificação muito extensa para validar o título truncado',
      )
      if (width >= 769) {
        assert.equal(new Set(metrics.cards.map((card) => Math.round(card.cardBottom))).size, 1)
        assert.equal(new Set(metrics.cards.map((card) => Math.round(card.buttonBottom))).size, 1)
      }
      if (width >= 768) {
        const before = await evaluate(
          `(() => { const e=document.querySelector('.assessment-list__item'); const r=e.getBoundingClientRect(),s=getComputedStyle(e); return {x:r.x+r.width/2,y:r.y+r.height/2,background:s.backgroundColor,shadow:s.boxShadow,transform:s.transform}; })()`,
        )
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: before.x, y: before.y })
        await evaluate('new Promise(resolve=>setTimeout(resolve,180))')
        const after = await evaluate(
          `(() => { const e=document.querySelector('.assessment-list__item'),s=getComputedStyle(e); return {hover:e.matches(':hover'),background:s.backgroundColor,shadow:s.boxShadow,transform:s.transform,cursor:s.cursor}; })()`,
        )
        assert.equal(after.hover, true)
        assert.equal(after.cursor, 'auto')
        assert.deepEqual(
          { background: after.background, shadow: after.shadow, transform: after.transform },
          { background: before.background, shadow: before.shadow, transform: before.transform },
          `Cartão de avaliação estático reagiu ao mouse em ${theme}/${width}px`,
        )
      }
      await evaluate("document.querySelector('.assessment-list-filters input').focus()")
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
          "document.activeElement===document.querySelectorAll('.assessment-list-filters input')[1]",
        ),
        true,
      )
      assert.notEqual(
        await evaluate('getComputedStyle(document.activeElement).outlineStyle'),
        'none',
      )
      if (width === 375 || width === 1440) {
        await evaluate(
          "document.querySelector('.assessment-list-filters').scrollIntoView({block:'start'})",
        )
        const screenshot = await send('Page.captureScreenshot', { format: 'png' })
        fs.writeFileSync(
          `dist/assessment-filters-${theme}-${width}.png`,
          Buffer.from(screenshot.data, 'base64'),
        )
      }
      if (width === 1440) {
        await evaluate("document.querySelector('.assessment-list').scrollIntoView({block:'start'})")
        const screenshot = await send('Page.captureScreenshot', { format: 'png' })
        fs.writeFileSync(
          `dist/assessment-cards-${theme}-${width}.png`,
          Buffer.from(screenshot.data, 'base64'),
        )
      }
      cases.push({ width, theme, fields: 4, keyboard: true })
    }
  console.log(JSON.stringify({ case: 'Quatro filtros: painel real responsivo e teclado', cases }))
}
