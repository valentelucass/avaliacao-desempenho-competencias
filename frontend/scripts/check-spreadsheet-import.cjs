// Painel real com leituras fictícias; nenhum arquivo pessoal ou API real.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const luminance = (color) => {
  const channels = color
    .match(/[\d.]+/g)
    .slice(0, 3)
    .map(Number)
    .map((value) => value / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

module.exports = async function checkSpreadsheetImport({ send, frameId, css }) {
  const { build } = await import('vite')
  const { default: react } = await import('@vitejs/plugin-react')
  const previousNodeEnv = process.env.NODE_ENV
  let bundle
  try {
    bundle = await build({
      configFile: false,
      root: path.resolve(__dirname, '..'),
      plugins: [react()],
      resolve: { alias: { '@': path.resolve(__dirname, '../src') } },
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      logLevel: 'silent',
      build: {
        write: false,
        lib: {
          entry: path.resolve(__dirname, 'fixtures/spreadsheet-import.tsx'),
          formats: ['iife'],
          name: 'SpreadsheetImport',
        },
      },
    })
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
  const code = (Array.isArray(bundle) ? bundle : [bundle])
    .flatMap((result) => result.output)
    .find((file) => file.type === 'chunk' && file.isEntry).code
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (response.exceptionDetails)
      throw new Error(
        response.exceptionDetails.exception?.description || response.exceptionDetails.text,
      )
    return response.result.value
  }
  const ready = (condition) =>
    evaluate(
      `new Promise((resolve,reject)=>{const start=performance.now();function tick(){if(${condition})return resolve(true);if(performance.now()-start>3000)return reject(new Error('Import preparation timeout'));requestAnimationFrame(tick)}tick()})`,
    )
  const enter = async () => {
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      text: '\r',
      unmodifiedText: '\r',
      windowsVirtualKeyCode: 13,
    })
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    })
  }
  const cases = []
  for (const theme of ['light', 'dark']) {
    for (const width of [320, 375, 768, 1024, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 1100,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await send('Page.setDocumentContent', {
        frameId,
        html: `<!doctype html><html data-theme="${theme}"><head><style>${css}</style></head><body><div id="root"></div></body></html>`,
      })
      await evaluate(code)
      await ready(
        "window.spreadsheetImportCalls.length===6 && document.querySelectorAll('.spreadsheet-import__toggle').length===3",
      )
      // Fechar os avisos da base vazia antes de inspecionar a área de preparação.
      await evaluate(
        "document.querySelectorAll('.feedback__dismiss').forEach(button=>button.click())",
      )
      await ready("!document.querySelector('.feedback--floating')")
      await evaluate(
        `(()=>{const l=[...document.querySelectorAll('label')].find(e=>e.textContent==='Nome de exibição do colaborador');const i=document.getElementById(l.htmlFor);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'Pessoa fictícia em edição');i.dispatchEvent(new Event('input',{bubbles:true}));})()`,
      )
      for (let index = 0; index < 3; index++) {
        await evaluate(
          `(()=>{const b=document.querySelectorAll('.spreadsheet-import__toggle')[${index}];b.scrollIntoView({block:'center',behavior:'instant'});b.focus()})()`,
        )
        await enter()
        await ready(
          `document.querySelectorAll('.spreadsheet-import__toggle')[${index}].getAttribute('aria-expanded')==='true'`,
        )
        const metrics = await evaluate(
          `(()=>{const scope=document.querySelectorAll('.spreadsheet-import')[${index}],p=scope.querySelector('[role=region]'),b=scope.querySelector('button'),r=p.getBoundingClientRect();return {visible:!p.hidden,labelled:!!document.getElementById(p.getAttribute('aria-labelledby')),fileDisabled:p.querySelector('input').disabled,reviewDisabled:p.querySelector('button').disabled,focus:document.activeElement===b,outline:getComputedStyle(b).outlineStyle,left:r.left,right:r.right,overflow:document.documentElement.scrollWidth>innerWidth+1,controlsFit:[...p.querySelectorAll('input,button')].every(e=>{const c=e.getBoundingClientRect();return c.left>=r.left&&c.right<=r.right+1})}})()`,
        )
        assert.equal(
          metrics.visible &&
            metrics.labelled &&
            !metrics.fileDisabled &&
            metrics.reviewDisabled &&
            metrics.focus &&
            metrics.controlsFit,
          true,
        )
        assert.notEqual(metrics.outline, 'none')
        const colors = await evaluate(
          `(()=>{const p=document.querySelectorAll('.spreadsheet-import__panel')[${index}];return {background:getComputedStyle(p).backgroundColor,text:getComputedStyle(p.querySelector('.muted')).color}})()`,
        )
        const levels = [luminance(colors.background), luminance(colors.text)].sort((a, b) => b - a)
        assert.ok(
          (levels[0] + 0.05) / (levels[1] + 0.05) >= 4.5,
          'Contraste do texto da preparação abaixo de 4,5:1',
        )
        assert.equal(metrics.overflow, false)
        assert.ok(metrics.left >= 0 && metrics.right <= width)
        if (index === 2 && width !== 320) {
          await evaluate(
            `document.querySelectorAll('.spreadsheet-import')[${index}].scrollIntoView({block:'start',behavior:'instant'})`,
          )
          fs.writeFileSync(
            `dist/import-preparation-${theme}-${width}.png`,
            Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
          )
        }
        await enter()
        await ready(`document.querySelectorAll('.spreadsheet-import__panel')[${index}].hidden`)
      }
      assert.deepEqual(await evaluate('window.spreadsheetImportCalls'), [
        'listBranches',
        'listAreas',
        'listCollaborators',
        'listActiveAllocations',
        'listActiveQuestionnaireAssignments',
        'listQuestionnaireAssignmentOptions',
      ])
      assert.equal(
        await evaluate(
          `(()=>{const l=[...document.querySelectorAll('label')].find(e=>e.textContent==='Nome de exibição do colaborador');return document.getElementById(l.htmlFor).value})()`,
        ),
        'Pessoa fictícia em edição',
      )
      for (const index of [0, 1, 2]) {
        await evaluate(`document.querySelectorAll('.spreadsheet-import__toggle')[${index}].click()`)
        await ready(`!document.querySelectorAll('.spreadsheet-import__panel')[${index}].hidden`)
        await evaluate(
          `(()=>{const p=document.querySelectorAll('.spreadsheet-import__panel')[${index}];const cycle=p.querySelector('select');if(cycle){Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(cycle,'cycle-fixture');cycle.dispatchEvent(new Event('change',{bubbles:true}))}const file=p.querySelector('input[type=file]');const transfer=new DataTransfer();transfer.items.add(new File(['synthetic fixture'],'exemplo.xlsx'));file.files=transfer.files;file.dispatchEvent(new Event('change',{bubbles:true}))})()`,
        )
        await ready(
          `!document.querySelectorAll('.spreadsheet-import__panel')[${index}].querySelector('.spreadsheet-import__file-row button').disabled`,
        )
        const before = await evaluate(
          'window.spreadsheetImportCalls.filter(c=>c==="confirmSpreadsheet").length',
        )
        await evaluate(
          `document.querySelectorAll('.spreadsheet-import__panel')[${index}].querySelector('.spreadsheet-import__file-row button').click()`,
        )
        await ready(
          `document.querySelectorAll('.spreadsheet-import__panel')[${index}].querySelector('table')`,
        )
        assert.equal(
          await evaluate(
            'window.spreadsheetImportCalls.filter(c=>c==="confirmSpreadsheet").length',
          ),
          before,
        )
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), true)
        assert.equal(
          await evaluate(
            `(()=>{const p=document.querySelectorAll('.spreadsheet-import__panel')[${index}];const r=p.getBoundingClientRect();return p.scrollWidth<=p.clientWidth+1&&[...p.querySelectorAll('input,select,button,table')].every(e=>{const c=e.getBoundingClientRect();return c.left>=r.left&&c.right<=r.right+1})})()`,
          ),
          true,
          'Conferência ou controles cortados dentro do painel',
        )
        if (index === 1) {
          assert.equal(
            await evaluate(
              `getComputedStyle(document.querySelectorAll('.spreadsheet-import__panel')[1].querySelector('.spreadsheet-import__date')).whiteSpace`,
            ),
            'nowrap',
            'A data da lotação deve permanecer em uma linha',
          )
          assert.equal(
            await evaluate(
              `(()=>{const p=document.querySelectorAll('.spreadsheet-import__panel')[1];return p.querySelectorAll('td[data-label="Filial"]').length===2&&p.querySelector('td[data-label="Início da Lotação"]').textContent==='15/09/2026'})()`,
            ),
            true,
          )
        }
        if (index === 2) {
          assert.equal(
            await evaluate(
              `(()=>{const p=document.querySelectorAll('.spreadsheet-import__panel')[2];const e=p.querySelector('.spreadsheet-import__references strong');const r=document.createRange();r.selectNodeContents(e);const bounds=p.getBoundingClientRect();return [...r.getClientRects()].every(rect=>rect.left>=bounds.left&&rect.right<=bounds.right)})()`,
            ),
            true,
            'O título dos questionários deve ficar inteiramente visível',
          )
          assert.equal(
            await evaluate(
              `document.querySelectorAll('.spreadsheet-import__panel')[2].querySelector('.spreadsheet-import__references li').textContent`,
            ),
            'Questionário fictício',
          )
        }
        if ((index === 1 || index === 2) && width !== 320) {
          await evaluate(
            `document.querySelectorAll('.spreadsheet-import__panel')[${index}].scrollIntoView({block:'start',behavior:'instant'})`,
          )
          fs.writeFileSync(
            `dist/import-functional-${index === 1 ? 'allocations-' : ''}${theme}-${width}.png`,
            Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
          )
        }
        await evaluate(
          `document.querySelectorAll('.spreadsheet-import__panel')[${index}].querySelector('.spreadsheet-import__actions button:last-child').click()`,
        )
        await ready(
          `document.querySelectorAll('.spreadsheet-import__panel')[${index}].textContent.includes('Lote concluído')`,
        )
        assert.equal(
          await evaluate(
            'window.spreadsheetImportCalls.filter(c=>c==="confirmSpreadsheet").length',
          ),
          before + 1,
        )
        assert.equal(
          await evaluate(
            `document.querySelectorAll('.spreadsheet-import__panel')[${index}].querySelector('.spreadsheet-import__actions button:last-child').disabled`,
          ),
          true,
        )
        await evaluate(
          "document.querySelectorAll('.feedback__dismiss').forEach(button=>button.click())",
        )
      }
      cases.push({
        theme,
        width,
        sections: 3,
        keyboard: true,
        allThreeImportsEnabled: true,
        previewAndExplicitConfirmation: true,
        noCallsOnExpand: true,
        manualInputPreserved: true,
      })
    }
  }
  console.log(
    JSON.stringify({
      case: 'Importação Excel: conferência, confirmação explícita, teclado e responsividade',
      cases,
    }),
  )
}
