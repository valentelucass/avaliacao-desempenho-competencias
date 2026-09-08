const assert = require('node:assert/strict')
const fs = require('node:fs')

module.exports = async function checkRelationshipTable({ send, evaluate, ready, load }) {
  const root = '[data-relationship-regression]'
  const metrics = `(() => [...document.querySelectorAll('${root} tbody .button')].map(b => {
    const range=document.createRange(); const text=[...b.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());
    range.selectNodeContents(text); const r=b.getBoundingClientRect(),td=b.closest('td').getBoundingClientRect();
    return {height:r.height,width:r.width,lines:range.getClientRects().length,icon:b.querySelector('svg').getBoundingClientRect().width,
      cellRight:td.right,right:r.right,tableRight:b.closest('table').getBoundingClientRect().right,rowHeight:b.closest('tr').getBoundingClientRect().height};}))()`
  const cases = []
  const viewports = [
    [320, 1],
    [375, 1],
    [768, 1],
    [1024, 1],
    [1440, 1],
    [1280, 1.5],
    [960, 2],
  ]
  for (const { width, scale, theme } of ['light', 'dark'].flatMap((theme) =>
    viewports.map(([width, scale]) => ({ width, scale, theme })),
  )) {
    await load(width, true)
    if (theme === 'dark') {
      await evaluate("document.querySelector('.adc-curtain-toggle').click()")
      await ready("document.documentElement.dataset.theme==='dark'")
    }
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 1200,
      deviceScaleFactor: scale,
      mobile: false,
    })
    await ready(`document.querySelectorAll('${root} tbody .button').length===5`)
    await evaluate(`document.querySelector('${root} table').scrollIntoView({block:'start'})`)
    await evaluate(
      'document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))',
    )
    const buttons = await evaluate(metrics)
    for (const button of buttons) {
      assert.equal(
        button.lines,
        1,
        `Encerrar quebrou em letras/linhas (${width}px, DPR ${scale}, ${theme})`,
      )
      assert.ok(button.height >= 36 && button.height <= 40, `Botão vertical/alto (${width}px)`)
      assert.equal(button.icon, 18)
      assert.ok(
        button.right <= button.cellRight + 1 && button.tableRight <= width + 1,
        'Botão/tabela fora da célula ou viewport',
      )
      if (width > 768) assert.ok(button.rowHeight < 100, 'Linha inflada pelo botão')
    }
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth + 1'), false)
    cases.push({
      width,
      deviceScaleFactor: scale,
      theme,
      buttons: buttons.length,
      lines: 1,
      height: buttons[0].height,
    })

    if (width === 1440) {
      // Teste de sensibilidade: a folha regressiva deve reproduzir a captura do usuário.
      await evaluate(`(() => {
        const styles=document.createElement('style');styles.id='reproduce-broken-button';
        styles.textContent=':root .button{overflow-wrap:anywhere;word-break:normal} :root .administration-users .table-actions .button{flex-shrink:1;min-width:0;max-width:100%;white-space:normal}';
        document.head.append(styles);
      })()`)
      const broken = await evaluate(metrics)
      assert.ok(
        broken.some((button) => button.lines > 1 && button.height > 40),
        'A fixture precisa detectar a regressão original',
      )
      await evaluate("document.getElementById('reproduce-broken-button').remove()")
      // A ação continua apenas abrindo a confirmação; nenhuma escrita é chamada.
      await evaluate(`document.querySelector('${root} tbody .button').click()`)
      await ready("document.getElementById('close-relationship-title')")
      assert.equal(
        await evaluate("document.getElementById('close-relationship-title').textContent"),
        'Confirmar encerramento de vínculo',
      )
      await evaluate(
        `([...document.querySelectorAll('${root} button')].find(b=>b.textContent==='Cancelar')).click()`,
      )
      await ready("!document.getElementById('close-relationship-title')")
      const next = `${root} button[aria-label='Próxima página']`
      await evaluate(`document.querySelector("${next}").click()`)
      await ready(`document.querySelectorAll('${root} tbody .button').length===2`)
      assert.ok(
        (await evaluate(metrics)).every((button) => button.lines === 1 && button.height <= 40),
      )
    }
    if (scale === 1.5) {
      const screenshot = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(
        `dist/relationships-buttons-fixed-${theme}-150.png`,
        Buffer.from(screenshot.data, 'base64'),
      )
    }
  }
  console.log(
    JSON.stringify({
      case: 'Painel real Diretoria–Gerência: Encerrar horizontal, confirmação e paginação',
      cases,
    }),
  )
}
