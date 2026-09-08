// Regressão visual dos seletores realmente usados na SPA, sem API ou dados reais.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { Trash2, Save, Plus, ArrowUp, Ellipsis, Sun, ChevronRight } = require('lucide-react')

const variants = [
  ['neutral', 'button', 'Voltar', ChevronRight],
  ['primary', 'button button--primary', 'Nova avaliação', Plus],
  ['success', 'button button--success', 'Salvar alterações', Save],
  ['danger', 'button button--danger', 'Excluir', Trash2],
  ['quiet', 'button button--quiet', 'Mover para cima', ArrowUp],
  ['danger-quiet', 'button button--danger button--quiet', 'Remover vínculo', Trash2],
  ['disabled', 'button button--success', 'Salvando…', Save, true],
  ['disabled-danger', 'button button--danger button--quiet', 'Excluir indisponível', Trash2, true],
  ['icon', 'icon-button theme-toggle', null, Sun],
  ['account', 'account-actions__trigger', null, Ellipsis],
  ['icon-disabled', 'icon-button', null, ChevronRight, true],
  ['aria-disabled', 'icon-button theme-toggle', null, Sun, 'aria'],
]

const luminance = (value) => {
  const c = value
    .match(/[\d.]+/g)
    .slice(0, 3)
    .map(Number)
    .map((x) => x / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722
}
const contrast = (a, b) => {
  const l = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l[0] + 0.05) / (l[1] + 0.05)
}

module.exports = async function checkGlobalButtons({ send, frameId, css }) {
  const e = React.createElement
  const buttons = variants.map(([id, className, text, Icon, disabled]) =>
    e(
      'button',
      {
        key: id,
        id,
        className,
        type: 'button',
        disabled: disabled === true,
        'aria-label': text || 'Controle fictício ' + id,
        'aria-disabled': disabled === 'aria' ? true : undefined,
      },
      e(Icon, { 'aria-hidden': true, size: 18 }),
      text,
    ),
  )
  const markup = renderToStaticMarkup(
    e(
      'main',
      { className: 'card', style: { maxWidth: 900, margin: '0 auto' } },
      e('h1', null, 'Botões da plataforma'),
      e('p', null, 'Ensaio visual com dados fictícios'),
      e(
        'div',
        { style: { display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' } },
        buttons,
      ),
      e(
        'div',
        {
          className: 'questionnaire-competency__actions',
          style: { marginTop: 24, justifyContent: 'flex-start' },
        },
        e(
          'button',
          { id: 'compact', className: 'button button--quiet', type: 'button' },
          e(ArrowUp, { 'aria-hidden': true }),
          'Mover competência para cima',
        ),
        e(
          'button',
          { id: 'compact-danger', className: 'button button--danger', type: 'button' },
          e(Trash2, { 'aria-hidden': true }),
          'Excluir item',
        ),
      ),
      e(
        'div',
        { className: 'action-row' },
        e(
          'button',
          { id: 'long-label', className: 'button button--success', type: 'button' },
          e(Save, { 'aria-hidden': true }),
          'Salvar configuração de questionário e continuar',
        ),
      ),
      e(
        'div',
        { className: 'pagination' },
        e(
          'div',
          { className: 'pagination__controls' },
          e('span', { className: 'pagination__page', 'aria-current': 'page' }, '2'),
          e(
            'button',
            {
              id: 'pagination-next',
              className: 'icon-button',
              type: 'button',
              'aria-label': 'Próxima página',
            },
            e(ChevronRight, { 'aria-hidden': true }),
          ),
        ),
      ),
    ),
  )
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (r.exceptionDetails)
      throw new Error('Falha na medição dos botões: ' + r.exceptionDetails.text)
    return r.result.value
  }
  const measure = `(() => [...document.querySelectorAll('button')].map(b => {
    const s=getComputedStyle(b),r=b.getBoundingClientRect(),svg=b.querySelector('svg').getBoundingClientRect();
    return {id:b.id,bg:s.backgroundColor,image:s.backgroundImage,color:s.color,radius:s.borderRadius,
      font:parseFloat(s.fontSize),weight:s.fontWeight,shadow:s.boxShadow,height:r.height,left:r.left,right:r.right,
      svgWidth:svg.width,gap:parseFloat(s.columnGap),scroll:b.scrollWidth,client:b.clientWidth,
      disabled:b.disabled||b.getAttribute('aria-disabled')==='true',pointer:s.pointerEvents,transform:s.transform};}))()`
  const summaries = []
  await send('Emulation.setEmulatedMedia', {
    media: 'screen',
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  })
  for (const theme of ['light', 'dark']) {
    for (const width of [320, 375, 768, 1024, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 1200,
        deviceScaleFactor: 1,
        mobile: false,
      })
      // Não herdar a posição do mouse do ensaio/viewport anterior sobre um botão.
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 })
      await send('Page.setDocumentContent', {
        frameId,
        html:
          '<!doctype html><html data-theme="' +
          theme +
          '"><head><style>' +
          css +
          '</style></head><body><div id="root"><div style="padding:16px">' +
          markup +
          '</div></div></body></html>',
      })
      await evaluate(
        'document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))',
      )
      const metrics = await evaluate(measure)
      assert.equal(metrics.length, 16)
      for (const button of metrics) {
        const label = `${button.id}, ${theme}, ${width}px`
        assert.ok(button.height >= 36, 'Alvo pequeno: ' + label)
        if (button.id !== 'long-label' && width >= 768)
          assert.ok(button.height <= 40, 'Botão ampliado indevidamente: ' + label)
        assert.equal(button.radius, '10px', 'Cantos divergentes: ' + label)
        assert.ok(button.font >= 13, 'Texto pequeno/oculto: ' + label)
        assert.equal(button.image, 'none', 'Gradiente inesperado: ' + label)
        assert.equal(button.shadow, 'none', 'Sombra decorativa inesperada: ' + label)
        assert.equal(button.svgWidth, 18, 'Ícone comprimido: ' + label)
        assert.equal(button.gap, 8, 'Espaçamento de ícone divergente: ' + label)
        assert.ok(
          button.left >= 0 && button.right <= width + 1 && button.scroll <= button.client + 1,
          'Conteúdo cortado: ' + label,
        )
        if (button.disabled) assert.equal(button.pointer, 'none', 'Ponteiro habilitado: ' + label)
        else assert.ok(contrast(button.color, button.bg) >= 4.5, 'Contraste insuficiente: ' + label)
      }
      for (const id of ['danger', 'danger-quiet', 'compact-danger']) {
        assert.equal(metrics.find((b) => b.id === id).bg, 'rgb(220, 48, 56)')
        assert.equal(metrics.find((b) => b.id === id).color, 'rgb(255, 255, 255)')
      }
      assert.equal(
        await evaluate("getComputedStyle(document.querySelector('.pagination__page')).cursor"),
        'default',
      )
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth + 1'), false)
      summaries.push({
        theme,
        width,
        buttons: metrics.length,
        minimumContrast: Math.min(
          ...metrics.filter((b) => !b.disabled).map((b) => contrast(b.color, b.bg)),
        ).toFixed(2),
      })

      if (width === 1440) {
        const screenshot = await send('Page.captureScreenshot', { format: 'png' })
        fs.writeFileSync(`dist/global-buttons-${theme}.png`, Buffer.from(screenshot.data, 'base64'))
      }
    }

    for (const id of ['disabled', 'disabled-danger', 'icon-disabled', 'aria-disabled']) {
      const before = (await evaluate(measure)).find((b) => b.id === id)
      const point = await evaluate(
        `(() => {const e=document.getElementById('${id}');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,
      )
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
      const after = (await evaluate(measure)).find((b) => b.id === id)
      for (const key of ['bg', 'color', 'shadow', 'transform'])
        assert.equal(after[key], before[key], 'Hover inativo alterou ' + id)
      assert.equal(await evaluate(`document.getElementById('${id}').matches(':hover')`), false)
    }

    const normal = (await evaluate(measure)).find((b) => b.id === 'danger')
    const point = await evaluate(
      "(() => {const e=document.getElementById('danger');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()",
    )
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
    await evaluate('new Promise(resolve=>setTimeout(resolve,180))')
    const hover = (await evaluate(measure)).find((b) => b.id === 'danger')
    assert.notEqual(hover.bg, normal.bg)
    assert.ok(contrast(hover.color, hover.bg) >= 4.5)
  }

  await evaluate("document.getElementById('primary').focus()")
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
  assert.equal(await evaluate('document.activeElement.id'), 'success')
  assert.equal(await evaluate("document.activeElement.matches(':focus-visible')"), true)
  assert.notEqual(await evaluate('getComputedStyle(document.activeElement).outlineStyle'), 'none')
  await send('Emulation.setEmulatedMedia', {
    media: 'screen',
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  })
  // Resets acessíveis podem manter duração residual de 1 ms; nenhuma propriedade
  // pode ser animada com movimento reduzido, independentemente dessa duração.
  assert.equal(
    await evaluate("getComputedStyle(document.getElementById('primary')).transitionProperty"),
    'none',
  )
  console.log(
    JSON.stringify({
      case: 'Botões globais: referência, contraste, geometria, hover inativo e teclado',
      summaries,
    }),
  )
}
