// Navegador real, fixture React local e dados fictícios. Nenhuma API ou serviço.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

module.exports = async function checkCurtainThemeToggle({ send, frameId, css }) {
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
          entry: path.resolve(__dirname, 'fixtures/curtain-theme-toggle.tsx'),
          formats: ['iife'],
          name: 'CurtainRegression',
        },
      },
    })
  } finally {
    // Vite ajusta NODE_ENV durante o build. Não misturar React dev já carregado
    // pelo ensaio com um renderer server prod nos próximos testes.
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
  const outputs = Array.isArray(bundle) ? bundle : [bundle]
  const code = outputs
    .flatMap((output) => output.output)
    .find((file) => file.type === 'chunk' && file.isEntry).code
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (response.exceptionDetails)
      throw new Error(
        'Falha no ensaio da cortina: ' +
          (response.exceptionDetails.exception?.description || response.exceptionDetails.text),
      )
    return response.result.value
  }
  const ready = (condition) =>
    evaluate(`new Promise((resolve, reject) => {
    const start=performance.now(); function check(){if(${condition}) return resolve(true);
    if(performance.now()-start>3000) return reject(new Error('Tempo excedido no ensaio'));
    requestAnimationFrame(check)} check();})`)
  const load = async (width, reduced = false) => {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    })
    await send('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }],
    })
    await send('Page.setDocumentContent', {
      frameId,
      html:
        '<!doctype html><html data-theme="light"><head><style>' +
        css +
        '</style></head><body><div id="root"></div></body></html>',
    })
    await evaluate(code)
    await ready(
      "document.querySelector('.adc-curtain-toggle') && document.querySelector('[data-rs-theme]')",
    )
  }
  const sample = `(() => {
    const e=document.querySelector('.adc-theme-curtain'), b=document.querySelector('.adc-curtain-toggle');
    const r=e?.getBoundingClientRect(), s=e?getComputedStyle(e):null;
    return {theme:document.documentElement.dataset.theme, phase:e?.dataset.phase, height:r?.height,
      viewport:innerHeight, left:r?.left, width:r?.width, viewportWidth:document.documentElement.clientWidth, animation:s?.animationName,
      duration:s?.animationDuration, buttonWidth:b?.getBoundingClientRect().width, focus:document.activeElement===b,
      outline:b?getComputedStyle(b).outlineStyle:null, count:document.querySelector('output').textContent,
      tableTheme:document.querySelector('[data-rs-theme]').dataset.rsColorMode,
      input:document.querySelector('main input').value, overflow:document.documentElement.scrollWidth>innerWidth+1};})()`
  const summaries = []
  for (const width of [375, 1440]) {
    await load(width)
    await evaluate("document.querySelector('.adc-curtain-toggle').focus()")
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
    await ready("document.querySelector('.adc-theme-curtain')?.dataset.phase==='falling'")
    const falling = await evaluate(sample)
    assert.equal(falling.theme, 'light')
    assert.equal(falling.animation, 'adc-curtain-fall')
    assert.equal(falling.duration, '0.3s')
    assert.equal(falling.left, 0)
    assert.equal(falling.width, falling.viewportWidth)
    assert.equal(falling.focus, true)
    assert.notEqual(falling.outline, 'none')
    // Registrar quadros intermediários prova movimento real, não só presença do overlay.
    const frames = await evaluate(`new Promise(resolve => {
      const frames=[]; const start=performance.now(); function capture(){
        const e=document.querySelector('.adc-theme-curtain');
        if(!e||performance.now()-start>2000) return resolve(frames);
        frames.push({phase:e.dataset.phase,scale:new DOMMatrixReadOnly(getComputedStyle(e).transform).m22});
        requestAnimationFrame(capture)} capture();})`)
    assert.ok(frames.some((f) => f.phase === 'falling' && f.scale > 0.05 && f.scale < 0.95))
    assert.ok(frames.some((f) => f.phase === 'rising' && f.scale > 0.05 && f.scale < 0.95))
    const dark = await evaluate(sample)
    assert.equal(dark.theme, 'dark')
    assert.equal(dark.tableTheme, 'dark')
    assert.equal(dark.count, '1')
    assert.equal(dark.input, 'Texto fictício não enviado')
    assert.equal(dark.overflow, false)
    assert.equal(dark.focus, true)
    assert.equal(dark.buttonWidth, falling.buttonWidth)
    const screenshot = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(
      `dist/curtain-theme-toggle-${width}.png`,
      Buffer.from(screenshot.data, 'base64'),
    )

    await evaluate("document.querySelector('.adc-curtain-toggle').click()")
    await ready(
      "!document.querySelector('.adc-theme-curtain') && document.documentElement.dataset.theme==='light'",
    )
    assert.equal((await evaluate(sample)).count, '2')
    summaries.push({
      width,
      keyboard: true,
      animatedBothDirections: true,
      preservedInputAndTableTheme: true,
    })
  }

  await load(375, true)
  await evaluate("document.querySelector('.adc-curtain-toggle').click()")
  await ready("document.documentElement.dataset.theme==='dark'")
  assert.equal(await evaluate("document.querySelector('.adc-theme-curtain')===null"), true)
  assert.equal((await evaluate(sample)).count, '1')

  await load(1440)
  await evaluate("document.querySelector('.adc-curtain-toggle').click()")
  await ready("document.querySelector('.adc-theme-curtain')?.dataset.phase==='falling'")
  await send('Emulation.setEmulatedMedia', { media: 'print' })
  // A troca de mídia pode encerrar a animação antes da próxima chamada CDP.
  // Tanto ausência quanto display:none impedem que a cortina apareça no papel.
  assert.equal(
    await evaluate(
      "(() => { const curtain = document.querySelector('.adc-theme-curtain'); return !curtain || getComputedStyle(curtain).display === 'none' })()",
    ),
    true,
  )
  await evaluate("window.dispatchEvent(new Event('beforeprint'))")
  await ready("document.querySelector('.adc-theme-curtain')===null")
  assert.equal((await evaluate(sample)).count, '1')

  await load(1440)
  await evaluate(
    "document.querySelector('.adc-curtain-toggle').click(); document.getElementById('unmount-toggle').click()",
  )
  await ready("document.querySelector('.adc-curtain-toggle')===null")
  await evaluate('new Promise(resolve => setTimeout(resolve, 900))')
  assert.equal((await evaluate(sample)).count, '0')
  assert.equal(await evaluate("document.querySelector('.adc-theme-curtain')===null"), true)
  await require('./check-relationship-table.cjs')({ send, evaluate, ready, load })
  console.log(
    JSON.stringify({
      case: 'Cortina real: teclado, animação, tema, movimento reduzido, impressão e desmontagem',
      summaries,
    }),
  )
}
