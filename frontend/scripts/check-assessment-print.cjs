// Regressao real em Edge headless, com dados ficticios e sem conexao com a API.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
process.chdir(path.resolve(__dirname, '..'))
const Module = require('node:module')
const { spawn } = require('node:child_process')
const ts = require('typescript')
for (const ext of ['.ts', '.tsx'])
  Module._extensions[ext] = (m, file) =>
    m._compile(
      ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
      file,
    )
require.cache[require.resolve('../src/api/client.ts')] = {
  exports: { isAuthenticationError: () => false },
}
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><html><body><div id="mount"></div></body></html>', {
  url: 'http://localhost',
})
global.window = dom.window
global.document = dom.window.document
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true })
global.HTMLElement = dom.window.HTMLElement
global.requestAnimationFrame = (cb) => setTimeout(cb, 0)
global.IS_REACT_ACT_ENVIRONMENT = true
const React = require('react')
const { createRoot } = require('react-dom/client')
const { AssessmentEditor } = require('../src/features/assessments/AssessmentEditor.tsx')
const names = [
  ...fs
    .readFileSync('../docs/business/especificacao-macro-avaliacao-2024.md', 'utf8')
    .split('### Liderança')[1]
    .split('### Administrativo')[0]
    .matchAll(/^\d+\.\s+\*\*(.+?)\*\*/gm),
].map((m) => m[1])
const competencies = names.map((name, i) => ({
  id: 'c' + i,
  name,
  questions: [
    {
      id: 'q' + i,
      text: name,
      required: true,
      options: [{ id: 'o' + i, label: 'Dentro das expectativas', points: 100 }],
    },
  ],
}))
const detail = {
  id: 'audit-assessment',
  cycle: { id: 'cycle', name: 'Ciclo de avaliação de desempenho e competências 2026' },
  evaluated: { displayName: 'Pessoa fictícia de auditoria com identificação extensa' },
  type: 'GESTOR',
  status: 'RASCUNHO',
  feedbackStatus: 'NAO_APLICAVEL',
  questionnaire: { version: 'test', competencies },
  answers: competencies.map((c, i) => ({ questionId: 'q' + i, optionId: 'o' + i })),
}
const baseProps = {
  canEditManagerAssessment: true,
  canEditSelfAssessment: true,
  canSubmitSelfAssessment: true,
  canEditDirectorAssessment: false,
  canPublish: true,
  canReopen: true,
  canRecordFeedback: true,
  onBack: () => {},
  onChanged: () => {},
  onSessionExpired: () => {},
}
const root = createRoot(document.getElementById('mount'))
async function mount(d, key) {
  await React.act(async () => {
    root.render(
      React.createElement(AssessmentEditor, {
        ...baseProps,
        key,
        assessmentId: d.id,
        api: { getAssessment: async () => d },
      }),
    )
  })
}
;(async () => {
  await mount(detail, 'draft')
  assert.equal(document.querySelectorAll('input[type=radio]:not(:disabled)').length, 0)
  console.log(
    JSON.stringify({
      case: 'RH reads another authors draft (API detail has no owner/action flags)',
      radios: document.querySelectorAll('input[type=radio]').length,
      enabledRadios: document.querySelectorAll('input[type=radio]:not(:disabled)').length,
      saveEnabled: [...document.querySelectorAll('button')].some(
        (b) => b.textContent.includes('Salvar rascunho') && !b.disabled,
      ),
    }),
  )
  const published = {
    ...detail,
    status: 'PUBLICADA',
    feedbackStatus: 'PENDENTE',
    result: {
      finalScore: 100,
      classification: { label: 'Dentro das expectativas', guidance: 'Acelerar e desenvolver' },
    },
    competencyScores: names.map((name, i) => ({ id: 'c' + i, name, score: 80 + (i % 5) * 10 })),
  }
  await mount(published, 'published')
  console.log(
    JSON.stringify({
      case: 'RH reads another authors published assessment',
      feedbackFieldShown: !!document.querySelector('input[type=date]'),
      disabledRadios: document.querySelectorAll('input[type=radio]:disabled').length,
    }),
  )
  assert.equal(document.querySelector('input[type=date]'), null)
  const markup = document.getElementById('mount').innerHTML
  const cssFile = fs.readdirSync('dist/assets').find((f) => f.endsWith('.css'))
  const css = fs
    .readFileSync('dist/assets/' + cssFile, 'utf8')
    .replace(
      /url\(([^)]*\.woff2)\)/g,
      (_, url) =>
        'url(data:font/woff2;base64,' +
        fs
          .readFileSync('dist/assets/' + path.basename(url.replace(/["']/g, '')))
          .toString('base64') +
        ')',
    )
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'adc-print-regression-'))
  const edge = spawn(
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    [
      '--headless=new',
      '--no-first-run',
      '--disable-background-networking',
      '--disable-extensions',
      '--remote-debugging-port=0',
      '--user-data-dir=' + profile,
      'about:blank',
    ],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
  )
  let ws
  const timer = setTimeout(() => {
    edge.kill()
    console.error('browser timeout')
    process.exit(1)
  }, 45000)
  try {
    const browserUrl = await new Promise((resolve, reject) => {
      let out = ''
      edge.stderr.on('data', (b) => {
        out += b
        const m = out.match(/DevTools listening on (ws:\/\/[^\r\n]+)/)
        if (m) resolve(m[1])
      })
      edge.on('error', reject)
    })
    const origin = browserUrl.replace(/^ws:/, 'http:').split('/devtools/')[0]
    const targets = await (await fetch(origin + '/json/list')).json()
    ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', reject, { once: true })
    })
    let seq = 0
    const pending = new Map()
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) reject(new Error(JSON.stringify(msg.error)))
        else resolve(msg.result)
      }
    })
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++seq
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
      })
    await send('Page.enable')
    const { frameTree } = await send('Page.getFrameTree')
    await send('Page.setDocumentContent', {
      frameId: frameTree.frame.id,
      html:
        '<!doctype html><html data-theme="dark"><head><style>' +
        css +
        '</style></head><body><div id="root"><div class="application-shell"><main class="workspace"><div class="workspace__content">' +
        markup +
        '</div></main><footer class="application-footer">FOOTER_AUDIT</footer></div></div></body></html>',
    })
    await send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true })
    await send('Emulation.setDeviceMetricsOverride', {
      width: 741,
      height: 1107,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await send('Emulation.setEmulatedMedia', { media: 'print' })
    await send('Runtime.evaluate', {
      expression:
        'document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))',
      awaitPromise: true,
    })
    // A geracao do PDF sincroniza o layout paginado antes das medicoes fisicas.
    const pdf = await send('Page.printToPDF', {
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: false,
    })
    const metrics = await send('Runtime.evaluate', {
      returnByValue: true,
      expression:
        "JSON.stringify({labelCssSize:getComputedStyle(document.querySelector('.competency-radar__label')).fontSize,svgWidth:document.querySelector('svg.competency-radar__svg').getBoundingClientRect().width,svgViewbox:document.querySelector('svg.competency-radar__svg').viewBox.baseVal.width,scaledLabelMm:parseFloat(getComputedStyle(document.querySelector('.competency-radar__label')).fontSize)*document.querySelector('svg.competency-radar__svg').getBoundingClientRect().width/720*25.4/96,shellPadding:getComputedStyle(document.querySelector('.application-shell')).padding,sheetTop:document.querySelector('.assessment-editor__print-sheet').getBoundingClientRect().top,bodyHeight:document.body.getBoundingClientRect().height,sheetHeight:document.querySelector('.assessment-editor__print-sheet').getBoundingClientRect().height,printedItems:document.querySelectorAll('.individual-assessment-summary__print-score-list li').length})",
    })
    const pdfText = Buffer.from(pdf.data, 'base64').toString('latin1')
    assert.equal((pdfText.match(/\/Type\s*\/Page\b/g) || []).length, 1, 'A4 deve ter uma pagina')
    const physical = JSON.parse(metrics.result.value)
    assert.ok(physical.scaledLabelMm >= 2.6, 'Rotulos do radar pequenos demais')
    assert.equal(physical.sheetTop, 0, 'Espaco residual no topo da impressao')
    assert.equal(physical.printedItems, 21, 'Lista de notas incompleta')
    console.log(
      JSON.stringify({
        case: 'Edge print synthetic leadership (21 official competencies)',
        pages: (pdfText.match(/\/Type\s*\/Page\b/g) || []).length,
        metrics: JSON.parse(metrics.result.value),
      }),
    )

    await send('Emulation.setEmulatedMedia', { media: 'screen' })
    const pos = await send('Runtime.evaluate', {
      returnByValue: true,
      expression:
        "(()=>{const e=document.querySelector('.answer-option');const r=e.getBoundingClientRect(); return {x:r.x+100,y:r.y+20,bg:getComputedStyle(e).background,border:getComputedStyle(e).borderColor}})()",
    })
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: pos.result.value.x,
      y: pos.result.value.y,
    })
    const hover = await send('Runtime.evaluate', {
      returnByValue: true,
      expression:
        "(()=>{const e=document.querySelector('.answer-option');return {hover:e.matches(':hover'),bg:getComputedStyle(e).background,border:getComputedStyle(e).borderColor,pointerEvents:getComputedStyle(e).pointerEvents}})()",
    })
    assert.equal(hover.result.value.hover, false)
    assert.equal(hover.result.value.bg, pos.result.value.bg)
    assert.equal(hover.result.value.border, pos.result.value.border)
    console.log(
      JSON.stringify({
        case: 'Disabled radio real browser hover',
        before: pos.result.value,
        after: hover.result.value,
      }),
    )
    await require('./check-administrative-tables.cjs')({ send, frameId: frameTree.frame.id, css })
    await require('./check-curtain-theme-toggle.cjs')({ send, frameId: frameTree.frame.id, css })
    await require('./check-global-buttons.cjs')({ send, frameId: frameTree.frame.id, css })
    await send('Browser.close').catch(() => {})
  } finally {
    clearTimeout(timer)
    if (ws) ws.close()
    edge.kill()
    await React.act(async () => root.unmount())
    dom.window.close()
  }
})().catch((e) => {
  console.error(e.stack)
  process.exitCode = 1
})
