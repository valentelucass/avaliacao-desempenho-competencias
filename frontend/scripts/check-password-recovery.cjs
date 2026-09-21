// Interface real com API fictícia; nenhum acesso à aplicação em execução.
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')

module.exports = async function checkPasswordRecovery({ send, frameId, css }) {
  const { build } = await import('vite')
  const { default: react } = await import('@vitejs/plugin-react')
  const previous = process.env.NODE_ENV
  let result
  try {
    result = await build({
      configFile: false,
      root: path.resolve(__dirname, '..'),
      plugins: [react()],
      resolve: { alias: { '@': path.resolve(__dirname, '../src') } },
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      logLevel: 'silent',
      build: {
        write: false,
        lib: {
          entry: path.resolve(__dirname, 'fixtures/password-recovery.tsx'),
          formats: ['iife'],
          name: 'Recovery',
        },
      },
    })
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
  }
  const code = (Array.isArray(result) ? result : [result])
    .flatMap((item) => item.output)
    .find((item) => item.type === 'chunk' && item.isEntry).code
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
      `new Promise((resolve,reject)=>{const start=performance.now();function tick(){if(${condition})return resolve(true);if(performance.now()-start>4000)return reject(new Error('Recovery timeout'));requestAnimationFrame(tick)}tick()})`,
    )
  const button = (label) =>
    `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)})`
  const click = (label) => evaluate(`(${button(label)}).click()`)
  const fill = (selector, value) =>
    evaluate(
      `(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    )
  const assertDialog = async () => {
    const metrics = await evaluate(
      `(()=>{const d=document.querySelector('[role=dialog]'),r=d.getBoundingClientRect();return {inside:r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&d.contains(document.activeElement),left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight,focus:d.contains(document.activeElement)}})()`,
    )
    assert.equal(
      metrics.inside,
      true,
      `Popup deve ficar dentro da tela com foco: ${JSON.stringify(metrics)}`,
    )
  }
  for (const theme of ['light', 'dark'])
    for (const width of [320, 768, 1440]) {
      const height = width === 1440 ? 768 : 1000
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await send('Page.setDocumentContent', {
        frameId,
        html: `<!doctype html><html data-theme="${theme}"><head><style>${css}</style></head><body><div id="root"></div></body></html>`,
      })
      await evaluate(code)
      await ready("document.querySelectorAll('table').length>=3")
      assert.equal(
        await evaluate('document.documentElement.scrollWidth > innerWidth+1'),
        false,
        `Overflow ${width}/${theme}`,
      )
      assert.equal(
        await evaluate(
          `Array.from(document.querySelectorAll('.table-query-filter input,.table-query-filter select')).every(e=>e.getBoundingClientRect().width>=60&&e.getBoundingClientRect().height>=24)`,
        ),
        true,
        'Filtros devem continuar visíveis no celular',
      )
      await fill('input[aria-label="Filtrar Login"]', 'pessoa0@')
      await ready("document.querySelector('tbody').textContent.includes('Pessoa fictícia 0')")
      await click('Editar e redefinir senha')
      await ready("document.querySelector('[role=dialog]')")
      await assertDialog()
      await click('Gerar senha temporária e redefinir')
      await ready("document.querySelector('[role=dialog] input[readonly]')")
      await click('Fechar')
      assert.equal(await evaluate("!!document.querySelector('input[readonly]')"), false)
      assert.equal(await evaluate("window.recoveryFixture.calls.filter(c=>c==='reset').length"), 1)
      await evaluate(
        `document.querySelector('button[aria-label="Ações para Pessoa fictícia 0"]').click()`,
      )
      await ready(
        "document.querySelector('[role=dialog] h3')?.textContent.includes('Pessoa fictícia 0')",
      )
      await evaluate(
        'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',
      )
      await assertDialog()
      assert.equal(
        await evaluate(
          `(()=>{const dialog=document.querySelector('[role=dialog]'),overview=dialog.querySelector('.account-dialog__overview'),security=dialog.querySelector('.account-dialog__security'),button=[...dialog.querySelectorAll('button')].find(b=>b.textContent.includes('Gerar senha temporária'));const or=overview.getBoundingClientRect(),sr=security.getBoundingClientRect();return !!overview&&!!security&&!!button&&sr.top>=or.bottom-1})()`,
        ),
        true,
        'Detalhes devem separar dados, acessos e redefinição de senha',
      )
      if (width === 1440) {
        const passwordLayout = await evaluate(
          `(()=>{const dialog=document.querySelector('[role=dialog]'),security=dialog.querySelector('.account-dialog__security'),reset=security.querySelector('.account-password-reset'),delegation=security.querySelector('.account-dialog__password-delegation'),r=reset.getBoundingClientRect(),d=delegation.getBoundingClientRect(),bounds=dialog.getBoundingClientRect();return {fits:dialog.scrollHeight<=dialog.clientHeight+1,sideBySide:Math.abs(r.top-d.top)<1,overflow:getComputedStyle(dialog).overflowY,dialog:{top:bounds.top,bottom:bounds.bottom,height:bounds.height,client:dialog.clientHeight,scroll:dialog.scrollHeight},reset:{top:r.top,height:r.height},delegation:{top:d.top,height:d.height},viewport:innerHeight}})()`,
        )
        assert.equal(
          passwordLayout.fits && passwordLayout.sideBySide && passwordLayout.overflow !== 'auto',
          true,
          `O diálogo amplo deve usar a largura disponível, manter ações de senha lado a lado e não criar rolagem interna: ${JSON.stringify(passwordLayout)}`,
        )
        const screenshot = await send('Page.captureScreenshot', { format: 'png' })
        fs.writeFileSync(
          `dist/cor024-account-popup-${theme}.png`,
          Buffer.from(screenshot.data, 'base64'),
        )
      }
      await evaluate(`document.querySelector('[aria-label="Fechar detalhes da conta"]').click()`)
      await ready("!document.querySelector('[role=dialog]')")
      await click('Encerrar')
      await ready("document.querySelector('[role=dialog]')")
      await assertDialog()
      assert.equal(await evaluate("document.activeElement.type==='date'"), true)
      if (width === 1440) {
        const screenshot = await send('Page.captureScreenshot', { format: 'png' })
        fs.writeFileSync(`dist/cor024-popup-${theme}.png`, Buffer.from(screenshot.data, 'base64'))
      }
      await click('Cancelar')
      await ready("!document.querySelector('[role=dialog]')")
      await evaluate('window.recoveryFixture.show(true)')
      await ready(`!!(${button('Solicitar redefinição de senha')})`)
      assert.equal(
        await evaluate(
          `(()=>{const title=document.querySelector('.auth-page__product-name');return title?.textContent.trim()==='Avaliação de desempenho'&&getComputedStyle(title).borderLeftWidth==='1px'})()`,
        ),
        true,
        'Cabeçalho deve identificar o produto com divisor vertical',
      )
      await click('Solicitar redefinição de senha')
      await ready(`!!(${button('Voltar ao acesso')})`)
      assert.equal(
        await evaluate("!document.querySelector('input[name=password]')"),
        true,
        'Recuperação deve substituir os campos de login',
      )
      await click('Voltar ao acesso')
      await ready("!!document.querySelector('input[name=password]')")
      await click('Solicitar redefinição de senha')
      await fill('form[aria-busy] input', 'pessoa@example.invalid')
      await click('Enviar solicitação')
      await ready(
        "document.body.textContent.includes('Se a conta estiver disponível para recuperação')",
      )
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth+1'), false)
    }
  console.log(
    JSON.stringify({
      case: 'Recuperação, filtros globais, detalhes de conta e popup de vínculos',
      themes: 2,
      viewports: [320, 768, 1440],
      network: false,
    }),
  )
}
