// Regressão de acabamento: navegação lateral hierárquica e superfícies não interativas.
const assert = require('node:assert/strict')
const fs = require('node:fs')

module.exports = async function checkSidebarCards({ send, frameId, css }) {
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result.value
  }

  const markup = `
    <div class="application-shell">
      <aside aria-label="Menu fictício" class="workspace-sidebar workspace-sidebar--open">
        <div class="workspace-sidebar__heading"><span>Menu</span><button aria-label="Fechar menu" class="icon-button" type="button">×</button></div>
        <section aria-label="Conta ativa" class="workspace-sidebar__account"><span class="user-chip__avatar">QA</span><div><span class="workspace-sidebar__account-label">Conta ativa</span><strong>Conta de teste</strong><span class="workspace-sidebar__account-profile">Administrador técnico</span></div></section>
        <div class="workspace-sidebar__navigation" data-scroll-down>
          <div aria-hidden="true" class="workspace-sidebar__navigation-fade workspace-sidebar__navigation-fade--top"></div>
          <nav aria-label="Módulos disponíveis" class="workspace-nav">
            <div class="workspace-nav__section"><p class="workspace-nav__label">Visão geral</p><button class="workspace-nav__item" id="nav-home" type="button"><svg aria-hidden="true" fill="none" height="17" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="17"><path d="M3 11 12 3l9 8v10H3z"/></svg>Início</button></div>
            <div class="workspace-nav__section"><p class="workspace-nav__label">Avaliações</p><button aria-current="page" class="workspace-nav__item" id="nav-assessments" type="button"><svg aria-hidden="true" fill="none" height="17" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="17"><path d="M7 3h10v18H7z"/></svg>Avaliações individuais</button></div>
            <div class="workspace-nav__section"><p class="workspace-nav__label">Gestão</p><div class="workspace-nav__administration"><div class="workspace-nav__administration-heading"><svg aria-hidden="true" fill="none" height="17" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="17"><path d="M12 3 4 7v5c0 5 3.5 8 8 9 4.5-1 8-4 8-9V7z"/></svg>Administração</div><div class="workspace-nav__administration-items"><button class="workspace-nav__item workspace-nav__item--nested" type="button">Contas e concessões</button><button aria-current="page" class="workspace-nav__item workspace-nav__item--nested" id="nav-relationships" type="button">Vínculos</button></div></div></div>
          </nav>
          <div aria-hidden="true" class="workspace-sidebar__navigation-fade workspace-sidebar__navigation-fade--bottom"></div>
          <button aria-label="Descer no menu" class="workspace-sidebar__navigation-control workspace-sidebar__navigation-control--down" type="button">⌄</button>
        </div>
        <div class="workspace-sidebar__footer"><button class="button workspace-sidebar__sign-out" type="button">Sair da conta</button></div>
      </aside>
      <main class="workspace sidebar-cards-check__workspace" style="padding: 1.5rem;">
        <div class="workspace__content" style="display:grid; gap:1.25rem; grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));">
          <section class="card" id="static-card"><div class="section-heading"><div><p class="eyebrow">Resumo</p><h2>Notificações</h2></div></div><p>Você possui itens que merecem atenção.</p></section>
          <section class="kpi-card" id="kpi-card"><span class="kpi-card__label">Avaliações em andamento</span><strong>12</strong></section>
          <button class="assessment-kind-card" id="interactive-card" type="button"><span>Nova avaliação</span><small>Escolha a jornada para iniciar.</small></button>
        </div>
      </main>
    </div>`

  const results = []
  for (const theme of ['light', 'dark']) {
    for (const width of [320, 375, 768, 1024, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 960,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await send('Emulation.setEmulatedMedia', { media: 'screen' })
      await send('Page.setDocumentContent', {
        frameId,
        html: `<!doctype html><html data-theme="${theme}"><head><style>${css}\n@media (min-width:48.0625rem){.sidebar-cards-check__workspace{margin-left:20rem;width:calc(100% - 20rem)}}</style></head><body><div id="root">${markup}</div></body></html>`,
      })
      await evaluate(
        'document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))',
      )
      const metrics = await evaluate(`(() => {
        const sidebar=document.querySelector('.workspace-sidebar');
        const guide=getComputedStyle(document.querySelector('.workspace-nav__administration-items'),'::before');
        const fades=[...document.querySelectorAll('.workspace-sidebar__navigation-fade')].map(element => { const style=getComputedStyle(element), rect=element.getBoundingClientRect(); return {filter:style.backdropFilter,height:rect.height,opacity:style.opacity}; });
        const navigationControl=document.querySelector('.workspace-sidebar__navigation-control').getBoundingClientRect();
        const cards=['static-card','kpi-card'].map(id => {
          const element=document.getElementById(id), style=getComputedStyle(element), rect=element.getBoundingClientRect();
          return {id, background:style.backgroundColor, image:style.backgroundImage, radius:style.borderRadius, shadow:style.boxShadow, cursor:style.cursor, width:rect.width, height:rect.height};
        });
        const current=document.getElementById('nav-assessments');
        const currentStyle=getComputedStyle(current), currentRect=current.getBoundingClientRect();
        return {sidebar:{width:sidebar.getBoundingClientRect().width,radius:getComputedStyle(sidebar).borderRadius}, guide:{width:guide.width,height:guide.height,background:guide.backgroundColor}, fades, navigationControl:{height:navigationControl.height}, cards, current:{height:currentRect.height,weight:currentStyle.fontWeight,color:currentStyle.color}, overflow:document.documentElement.scrollWidth>innerWidth+1};
      })()`)

      assert.equal(metrics.overflow, false, `Overflow horizontal em ${theme}/${width}px`)
      assert.ok(metrics.sidebar.width >= 200, `Sidebar estreita em ${theme}/${width}px`)
      assert.notEqual(
        metrics.sidebar.radius,
        '0px',
        `Sidebar sem acabamento em ${theme}/${width}px`,
      )
      assert.equal(metrics.guide.width, '1px', `Guia do subnível ausente em ${theme}/${width}px`)
      assert.ok(
        parseFloat(metrics.guide.height) > 30,
        `Guia do subnível curto em ${theme}/${width}px`,
      )
      assert.ok(metrics.current.height >= 40, `Item de navegação pequeno em ${theme}/${width}px`)
      assert.ok(
        Number(metrics.current.weight) >= 700,
        `Item atual sem hierarquia em ${theme}/${width}px`,
      )
      assert.equal(metrics.fades.length, 2)
      for (const fade of metrics.fades) {
        assert.equal(fade.filter, 'none', `Menu embaçado em ${theme}/${width}px`)
        assert.ok(fade.height <= 30, `Faixa de rolagem extensa em ${theme}/${width}px`)
      }
      assert.ok(
        metrics.navigationControl.height <= 30,
        `Controle de rolagem alto em ${theme}/${width}px`,
      )
      for (const card of metrics.cards) {
        assert.equal(card.image, 'none', `Cartão ${card.id} usa gradiente em ${theme}/${width}px`)
        assert.notEqual(card.radius, '0px', `Cartão ${card.id} sem raio em ${theme}/${width}px`)
        assert.notEqual(
          card.shadow,
          'none',
          `Cartão ${card.id} sem profundidade em ${theme}/${width}px`,
        )
        assert.equal(card.cursor, 'auto', `Cartão estático sugere interação em ${theme}/${width}px`)
      }

      results.push({
        theme,
        width,
        cards: metrics.cards.length,
        sidebarWidth: Math.round(metrics.sidebar.width),
      })
    }

    assert.equal(
      await evaluate("getComputedStyle(document.getElementById('interactive-card')).cursor"),
      'pointer',
    )
  }

  await evaluate("document.getElementById('nav-home').focus()")
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
  assert.equal(await evaluate('document.activeElement.id'), 'nav-assessments')
  assert.equal(await evaluate("document.activeElement.matches(':focus-visible')"), true)

  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 960,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await send('Page.setDocumentContent', {
    frameId,
    html: `<!doctype html><html data-theme="light"><head><style>${css}\n@media (min-width:48.0625rem){.sidebar-cards-check__workspace{margin-left:20rem;width:calc(100% - 20rem)}}</style></head><body><div id="root">${markup}</div></body></html>`,
  })
  await evaluate('window.scrollTo(0,0); document.fonts.ready')
  const screenshot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('dist/sidebar-cards-light.png', Buffer.from(screenshot.data, 'base64'))
  console.log(
    JSON.stringify({ case: 'Sidebar e cards: hierarquia, acabamento, foco e hover', results }),
  )
}
