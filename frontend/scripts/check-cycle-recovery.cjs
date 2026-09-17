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
  const ready = (condition, timeout = 3000) =>
    evaluate(
      `new Promise((resolve,reject)=>{const start=performance.now();function tick(){if(${condition})return resolve(true);if(performance.now()-start>${timeout})return reject(new Error('Cycle recovery timeout'));requestAnimationFrame(tick)}tick()})`,
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
    const formBounds = await evaluate(
      "(()=>{const bounds=document.querySelector('form').getBoundingClientRect();return {bottom:bounds.bottom,top:bounds.top,viewport:window.innerHeight}})()",
    )
    assert.ok(
      formBounds.top >= -1 && formBounds.top < formBounds.viewport && formBounds.bottom > 0,
      `Formulário não está visível: top=${formBounds.top}, bottom=${formBounds.bottom}, viewport=${formBounds.viewport}`,
    )
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
    await fill('Código do ciclo', '2026')
    await fill('Nome do ciclo', 'Avaliação de Desempenho 2026')
    await fill('Abertura', '2026-10-17T14:00')
    await fill('Encerramento', '2026-10-16T23:59')
    await evaluate("document.querySelector('fieldset input[type=checkbox]').click()")
    await evaluate(
      "[...document.querySelectorAll('label')].find(l=>l.textContent.includes('Permitir autoavaliação')).querySelector('input').click()",
    )
    await click('Criar ciclo')
    await ready(
      "document.querySelector('[role=alert]')?.textContent.includes('encerramento deve ocorrer depois da abertura')",
    )
    assert.equal(
      await evaluate("window.cycleRecovery.calls.filter(c=>c.method==='POST').length"),
      0,
    )
    await fill('Abertura', '2026-09-16T14:00')
    await click('Criar ciclo')
    await ready("document.body.textContent.includes('Ciclo criado como rascunho')")
    assert.equal(
      await evaluate("window.cycleRecovery.calls.filter(c=>c.method==='POST').length"),
      1,
    )
    const submitted = await evaluate(
      "JSON.parse(window.cycleRecovery.calls.find(c=>c.method==='POST').body)",
    )
    assert.equal(submitted.code, '2026')
    assert.equal(submitted.configuration.name, 'Avaliação de Desempenho 2026')
    assert.equal(submitted.configuration.openingAtLocal, '2026-09-16T14:00')
    assert.equal(submitted.configuration.closingAtLocal, '2026-10-16T23:59')
    assert.equal(submitted.configuration.timeZone, 'America/Sao_Paulo')
    assert.equal(submitted.configuration.selfAssessmentEnabled, true)
    const successBounds = await evaluate(
      "(()=>{const el=document.querySelector('.feedback--floating'); const r=el.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,right:r.right,fixed:getComputedStyle(el.parentElement).position,insideContent:!!el.closest('.workspace')}})()",
    )
    assert.equal(successBounds.fixed, 'fixed')
    assert.equal(successBounds.insideContent, false)
    assert.ok(successBounds.top >= 0 && successBounds.top <= 24)
    assert.ok(successBounds.right <= width)
    fs.writeFileSync(
      `dist/cycle-success-${width}.png`,
      Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
    )
    if (width === 375)
      await ready("!document.querySelector('.feedback--floating[role=status]')", 6500)
    await evaluate('window.confirm = () => true')
    await click('Abrir ciclo')
    await ready(
      "document.querySelector('[role=alert]')?.textContent.includes('ainda não chegou à data e ao horário de abertura salvos')",
    )
    assert.equal(
      await evaluate("window.cycleRecovery.calls.filter(c=>c.path.endsWith('/open')).length"),
      1,
    )
    assert.equal(
      await evaluate(
        "document.querySelector('[role=alert]').textContent.includes('browser-cycle-opening')",
      ),
      true,
    )
    assert.equal(
      await evaluate("document.querySelector('[role=alert]').textContent.includes('outra sessão')"),
      false,
    )
    assert.equal(await evaluate("window.cycleRecovery.calls.filter(c=>c.method==='PUT').length"), 0)
    const errorBounds = await evaluate(
      "(()=>{const r=document.querySelector('[role=alert]').getBoundingClientRect();return {top:r.top,bottom:r.bottom,right:r.right}})()",
    )
    assert.ok(errorBounds.top >= 0 && errorBounds.top <= 24)
    assert.ok(errorBounds.bottom < 1000 && errorBounds.right <= width)
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth + 1'), false)
    await evaluate(
      "document.querySelector('h2').scrollIntoView({block:'start',behavior:'instant'})",
    )
    fs.writeFileSync(
      `dist/cycle-recovery-${width}.png`,
      Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
    )
    // Reproduz a estrutura dos diálogos para conferir o aviso também durante a rolagem modal.
    for (const modalKind of ['account', 'confirmation']) {
      const modalBounds = await evaluate(`(()=>{
      const kind=${JSON.stringify(modalKind)};
      const backdrop=document.createElement('div');backdrop.className=kind+'-dialog-backdrop';
      const dialog=document.createElement('section');dialog.className=kind+'-dialog card';
      dialog.setAttribute('role',kind==='account'?'dialog':'alertdialog');dialog.setAttribute('aria-modal','true');
      dialog.style.minHeight='2000px';
      const viewport=document.createElement('div');viewport.className='feedback-viewport';
      viewport.appendChild(document.querySelector('[role=alert]').cloneNode(true));
      dialog.appendChild(viewport);backdrop.appendChild(dialog);document.body.appendChild(backdrop);
      backdrop.scrollTop=600;
      const r=viewport.getBoundingClientRect();const result={top:r.top,right:r.right,scroll:backdrop.scrollTop};
      backdrop.remove();return result;
    })()`)
      assert.ok(modalBounds.scroll >= 500)
      assert.ok(
        modalBounds.top >= 0 && modalBounds.top <= 24,
        `Aviso saiu do topo ao rolar ${modalKind}`,
      )
      assert.ok(modalBounds.right <= width)
    }
    await click('Novo ciclo')
    await fill('Código do ciclo', '2026')
    await fill('Nome do ciclo', 'Avaliação de Desempenho 2026')
    await fill('Abertura', '2026-09-16T14:00')
    await fill('Encerramento', '2026-10-16T23:59')
    await evaluate("document.querySelector('fieldset input[type=checkbox]').click()")
    await click('Criar ciclo')
    await ready(
      "document.querySelector('[role=alert]')?.textContent.includes('Já existe um ciclo com esse código')",
    )
    assert.equal(
      await evaluate(
        "document.querySelector('[role=alert]').textContent.includes('browser-cycle-duplicate')",
      ),
      true,
    )
    assert.equal(
      await evaluate(
        "window.cycleRecovery.calls.filter(c=>c.method==='POST' && c.path.endsWith('/evaluation-cycles')).length",
      ),
      2,
    )
    fs.writeFileSync(
      `dist/cycle-duplicate-${width}.png`,
      Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
    )
    if (width === 375) {
      await ready("!document.querySelector('[role=alert]')", 11500)
      assert.equal(await evaluate("document.querySelector('input').value"), '2026')
      await click('Criar ciclo')
      await ready(
        "document.querySelector('[role=alert]')?.textContent.includes('Já existe um ciclo com esse código')",
      )
      assert.equal(
        await evaluate(
          "window.cycleRecovery.calls.filter(c=>c.method==='POST' && c.path.endsWith('/evaluation-cycles')).length",
        ),
        3,
      )
    }
    assert.equal(await evaluate("window.cycleRecovery.calls.filter(c=>c.method==='PUT').length"), 0)
    results.push({
      width,
      newCycleWrites: 0,
      lateReadErrorPreserved: true,
      retryRecovered: true,
      invalidDateWrites: 0,
      validCycleWrites: 1,
      configuredPeriodPreserved: true,
      futureOpeningExplained: true,
      successAndErrorAtViewportTop: true,
      modalScrollKeepsNotificationAtTop: true,
      duplicateCodeExplained: true,
      automaticDismissAndRepeatedErrorVerified: width === 375,
    })
  }
  console.log(
    JSON.stringify({
      case: 'Ciclos: falha tardia, recuperação e criação fictícia em navegador real',
      results,
    }),
  )
}
