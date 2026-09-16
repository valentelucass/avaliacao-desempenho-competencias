const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

module.exports = async function checkCycleRecovery({ send, frameId, css }) {
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
      define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
        'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api/v1'),
      },
      logLevel: 'silent',
      build: {
        write: false,
        lib: {
          entry: path.resolve(__dirname, 'fixtures/cycle-recovery.tsx'),
          formats: ['iife'],
          name: 'CycleRecovery',
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
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description || result.exceptionDetails.text,
      )
    return result.result.value
  }
  const ready = (condition) =>
    evaluate(
      `new Promise((resolve,reject)=>{const start=performance.now();function tick(){if(${condition})return resolve(true);if(performance.now()-start>3000)return reject(new Error('Cycle recovery timeout'));requestAnimationFrame(tick)}tick()})`,
    )
  const click = async (text) => {
    const coordinates = await evaluate(
      `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});b.scrollIntoView({block:'center',behavior:'instant'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    )
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      clickCount: 1,
      ...coordinates,
    })
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      clickCount: 1,
      ...coordinates,
    })
  }
  const fill = (label, value) =>
    evaluate(
      `(()=>{const l=[...document.querySelectorAll('label')].find(l=>l.textContent===${JSON.stringify(label)});const input=document.getElementById(l.htmlFor);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    )
  const results = []
  for (const width of [375, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await send('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    })
    await send('Page.setDocumentContent', {
      frameId,
      html: `<!doctype html><html data-theme="dark"><head><style>${css}</style></head><body><div id="root"></div></body></html>`,
    })
    await evaluate(code)
    await ready('window.cycleRecovery.calls.length===2')
    await click('Novo ciclo')
    await ready("document.activeElement?.matches('form')")
    assert.equal(await evaluate('window.cycleRecovery.calls.length'), 2)
    const formTop = await evaluate("document.querySelector('form').getBoundingClientRect().top")
    assert.ok(formTop >= -1 && formTop < 300, 'Formulário não foi revelado')
    await evaluate('window.cycleRecovery.failRead()')
    await ready(
      "document.querySelector('[role=alert]')?.textContent.includes('Não foi possível carregar os ciclos')",
    )
    assert.equal(
      await evaluate(
        "document.body.textContent.includes('Revise os campos informados') || document.body.textContent.includes('Nenhum ciclo disponível') || document.body.textContent.includes('Nenhuma versão aprovada')",
      ),
      false,
    )
    await click('Novo ciclo')
    assert.equal(
      await evaluate("document.querySelector('[role=alert]').textContent.includes('browser-read')"),
      true,
    )
    await click('Atualizar')
    await ready(
      "!document.querySelector('[role=alert]') && document.body.textContent.includes('Nenhum ciclo disponível')",
    )
    await fill('Código do ciclo', 'CICLO-TESTE')
    await fill('Nome do ciclo', 'Ciclo fictício de verificação')
    await fill('Abertura', '2026-09-02T00:00')
    await fill('Encerramento', '2026-09-16T00:00')
    await evaluate("document.querySelector('fieldset input[type=checkbox]').click()")
    await click('Criar ciclo')
    await ready("document.querySelector('[role=alert]')?.textContent.includes('01/09')")
    assert.equal(
      await evaluate("window.cycleRecovery.calls.filter(c=>c.method==='POST').length"),
      0,
    )
    await fill('Abertura', '2026-09-01T00:00')
    await click('Criar ciclo')
    await ready("document.body.textContent.includes('Ciclo criado como rascunho')")
    assert.equal(
      await evaluate("window.cycleRecovery.calls.filter(c=>c.method==='POST').length"),
      1,
    )
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth + 1'), false)
    await evaluate(
      "document.querySelector('h2').scrollIntoView({block:'start',behavior:'instant'})",
    )
    fs.writeFileSync(
      `dist/cycle-recovery-${width}.png`,
      Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
    )
    results.push({
      width,
      newCycleWrites: 0,
      lateReadErrorPreserved: true,
      retryRecovered: true,
      invalidDateWrites: 0,
      validCycleWrites: 1,
    })
  }
  console.log(
    JSON.stringify({
      case: 'Ciclos: falha tardia, recuperação e criação fictícia em navegador real',
      results,
    }),
  )
}
