const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

module.exports = async function checkMasterDataMaintenance({ send, frameId, css }) {
  const { build } = await import('vite')
  const { default: react } = await import('@vitejs/plugin-react')
  const previous = process.env.NODE_ENV
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
          entry: path.resolve(__dirname, 'fixtures/master-data-maintenance.tsx'),
          formats: ['iife'],
          name: 'Maintenance',
        },
      },
    })
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
  }
  const code = (Array.isArray(bundle) ? bundle : [bundle])
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
      'new Promise((resolve,reject)=>{const start=performance.now();function tick(){if(' +
        condition +
        ')return resolve(true);if(performance.now()-start>3000)return reject(new Error("Maintenance timeout"));requestAnimationFrame(tick)}tick()})',
    )
  const button = (label) =>
    '[...document.querySelectorAll("button")].find(b => b.getAttribute("aria-label")===' +
    JSON.stringify(label) +
    ' || b.textContent.trim()===' +
    JSON.stringify(label) +
    ')'
  const click = (label) => evaluate('(' + button(label) + ').click()')
  const cases = []
  for (const theme of ['light', 'dark']) {
    for (const width of [320, 375, 768, 1024, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await send('Page.setDocumentContent', {
        frameId,
        html:
          '<!doctype html><html data-theme="' +
          theme +
          '"><head><style>' +
          css +
          '</style></head><body><div id="root"></div></body></html>',
      })
      await evaluate(code)
      await ready('window.maintenanceCalls.length===6')
      assert.equal(
        await evaluate(
          '[...document.querySelectorAll("td[data-label=Ação]")].every(c=>{const box=c.getBoundingClientRect(),buttons=[...c.querySelectorAll("button")].map(b=>b.getBoundingClientRect());return buttons.every((r,i)=>r.left>=box.left&&r.right<=box.right+1&&r.height>=24&&buttons.slice(i+1).every(s=>s.left-r.right>=6||r.left-s.right>=6||s.top-r.bottom>=6||r.top-s.bottom>=6))})',
        ),
        true,
        'Ações de cadastros inativos devem ficar separadas e dentro da célula',
      )
      if (await evaluate('matchMedia("(min-width: 48.0625rem)").matches')) {
        assert.equal(
          await evaluate(
            '[...document.querySelectorAll("td[data-label=Ação]")].every(c=>{const buttons=[...c.querySelectorAll("button")];return buttons.length<2||buttons.every(b=>Math.abs(b.getBoundingClientRect().top-buttons[0].getBoundingClientRect().top)<1)})',
          ),
          true,
          'Ações de cadastros devem permanecer na mesma linha em telas largas',
        )
      }
      if (width === 375 || width === 1440) {
        await evaluate(
          'document.querySelector("#areas-title").scrollIntoView({block:"start",behavior:"instant"})',
        )
        fs.writeFileSync(
          'dist/master-data-maintenance-inactive-' + theme + '-' + width + '.png',
          Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
        )
      }
      await evaluate('document.querySelectorAll(".feedback__dismiss").forEach(b=>b.click())')
      for (const item of [
        {
          type: 'área',
          original: 'Área fictícia',
          corrected: 'Área corrigida',
          article: 'da área',
          method: 'updateArea',
          unused: 'Área descartável',
        },
        {
          type: 'colaborador',
          original: 'Pessoa fictícia',
          corrected: 'Pessoa corrigida',
          article: 'do colaborador',
          method: 'updateCollaborator',
          unused: 'Pessoa descartável',
        },
      ]) {
        const edit = 'Editar ' + item.type + ' ' + item.original
        await evaluate(
          '(()=>{const b=' +
            button(edit) +
            ';b.scrollIntoView({block:"center",behavior:"instant"});b.focus()})()',
        )
        await send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: 'Enter',
          code: 'Enter',
          text: '\r',
          windowsVirtualKeyCode: 13,
        })
        await send('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: 'Enter',
          code: 'Enter',
          windowsVirtualKeyCode: 13,
        })
        await ready('document.querySelector("[role=alertdialog] input")===document.activeElement')
        assert.equal(
          await evaluate('window.maintenanceCalls.includes(' + JSON.stringify(item.method) + ')'),
          false,
        )
        await evaluate(
          '(()=>{const i=document.querySelector("[role=alertdialog] input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(i,' +
            JSON.stringify(item.corrected) +
            ');i.dispatchEvent(new Event("input",{bubbles:true}))})()',
        )
        await click('Salvar nome ' + item.article)
        await ready('!document.querySelector("[role=alertdialog]")')
        assert.equal(
          await evaluate(
            'window.maintenanceCalls.filter(c=>c===' + JSON.stringify(item.method) + ').length',
          ),
          1,
        )
        await click('Reativar ' + item.type + ' ' + item.corrected)
        await click('Confirmar reativação ' + item.article)
        await ready('!document.querySelector("[role=alertdialog]")')
        assert.equal(
          await evaluate(
            'Boolean(' + button('Desativar ' + item.type + ' ' + item.corrected) + ')',
          ),
          true,
        )
        await click('Excluir ' + item.type + ' ' + item.unused)
        await click('Confirmar exclusão definitiva ' + item.article)
        await ready('!document.querySelector("[role=alertdialog]")')
        assert.equal(
          await evaluate('Boolean(' + button('Editar ' + item.type + ' ' + item.unused) + ')'),
          false,
        )
      }
      await evaluate('document.querySelectorAll(".feedback__dismiss").forEach(b=>b.click())')
      assert.equal(
        await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
        true,
        'Overflow na manutenção dos cadastros',
      )
      assert.equal(
        await evaluate(
          '[...document.querySelectorAll("td[data-label=Ação] button")].every(b=>{const r=b.getBoundingClientRect(),c=b.closest("td").getBoundingClientRect();return r.left>=c.left&&r.right<=c.right+1&&r.height>=24})',
        ),
        true,
        'Ações cortadas ou pequenas',
      )
      if (width === 375 || width === 1440) {
        await evaluate(
          'document.querySelector("#areas-title").scrollIntoView({block:"start",behavior:"instant"})',
        )
        fs.writeFileSync(
          'dist/master-data-maintenance-' + theme + '-' + width + '.png',
          Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
        )
      }
      cases.push({ theme, width, editReactivateDelete: true, keyboard: true, noOverflow: true })
    }
  }
  console.log(JSON.stringify({ case: 'Manutenção de áreas e colaboradores fictícios', cases }))
}
