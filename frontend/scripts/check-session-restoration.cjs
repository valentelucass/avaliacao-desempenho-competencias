// SPA e cliente reais, HTTP fictício em loopback e perfil de navegador exclusivo.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

async function main() {
  const { build } = await import('vite')
  const { default: react } = await import('@vitejs/plugin-react')
  const root = path.resolve(__dirname, '..')
  process.chdir(root)
  const bundle = await build({
    configFile: false,
    root,
    plugins: [react()],
    resolve: { alias: { '@': path.join(root, 'src') } },
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api/v1') },
    logLevel: 'silent',
    build: { write: false },
  })
  const files = new Map(bundle.output.map((file) => [file.fileName, file.code ?? file.source]))
  let mode = 'anonymous'
  let calls = []
  const server = http.createServer((request, response) => {
    const route = request.url.split('?')[0]
    response.setHeader('Cache-Control', 'no-store')
    if (route.startsWith('/api/')) {
      calls.push({ route, method: request.method })
      response.setHeader('Content-Type', 'application/json')
      let status = 200
      let body
      if (route === '/api/v1/auth/csrf') body = { token: 'csrf-synthetic-browser' }
      else if (route === '/api/v1/auth/sessions/restore') {
        assert.equal(request.method, 'POST')
        assert.equal(request.headers['x-csrf-token'], 'csrf-synthetic-browser')
        status = mode === 'unavailable' ? 503 : 200
        body = { authenticated: mode === 'authenticated' }
      } else if (route === '/api/v1/auth/me' && mode === 'authenticated') {
        body = { id: 'synthetic-user', displayName: 'Sessão fictícia retomada', permissions: [] }
      } else if (route === '/api/v1/auth/sessions') {
        status = 401
        body = { code: 'AUTHENTICATION_FAILED' }
      } else {
        status = 401
        body = { code: 'AUTHENTICATION_REQUIRED' }
      }
      response.writeHead(status)
      response.end(JSON.stringify(body))
      return
    }
    const name = route === '/' ? 'index.html' : route.slice(1)
    const content = files.get(name)
    if (content !== undefined) {
      const types = {
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
      }
      response.setHeader('Content-Type', types[path.extname(name)] ?? 'application/octet-stream')
      response.end(content)
    } else response.writeHead(204).end()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'adc-restore-browser-'))
  const edge = spawn(
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    [
      '--headless=new',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-extensions',
      '--remote-debugging-port=0',
      '--user-data-dir=' + profile,
      'about:blank',
    ],
    { windowsHide: true, stdio: 'ignore' },
  )
  let ws
  const watchdog = setTimeout(() => {
    edge.kill()
    server.close()
    process.exit(1)
  }, 60000)
  try {
    const portFile = path.join(profile, 'DevToolsActivePort')
    while (!fs.existsSync(portFile)) await new Promise((resolve) => setTimeout(resolve, 100))
    const port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    ws = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', reject, { once: true })
    })
    let nextId = 0
    const pending = new Map()
    const errors = []
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++nextId
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
      })
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (pending.has(message.id)) {
        const operation = pending.get(message.id)
        pending.delete(message.id)
        if (message.error) operation.reject(new Error(message.error.message))
        else operation.resolve(message.result)
      }
      if (message.method === 'Runtime.exceptionThrown') errors.push('JavaScript exception')
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error')
        errors.push(message.params.entry.text)
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')
        errors.push('Console error')
    })
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })
      if (result.exceptionDetails)
        throw new Error(
          result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
        )
      return result.result.value
    }
    const ready = (condition) =>
      evaluate(
        `new Promise((resolve,reject)=>{const start=performance.now();function tick(){if(${condition})return resolve(true);if(performance.now()-start>8000)return reject(new Error('Session restoration timeout'));requestAnimationFrame(tick)}tick()})`,
      )
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Log.enable')
    await send('Network.enable')
    await send('Network.setBlockedURLs', { urls: ['https://*'] })
    for (const width of [375, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: false,
      })
      for (const scenario of ['anonymous', 'authenticated', 'unavailable']) {
        mode = scenario
        calls = []
        errors.length = 0
        await send('Page.navigate', { url: origin })
        const expected =
          scenario === 'authenticated' ? 'Sessão fictícia retomada' : 'Acesso à plataforma'
        await ready(`document.body.textContent.includes(${JSON.stringify(expected)})`)
        assert.deepEqual(
          calls.map((call) => call.route),
          scenario === 'authenticated'
            ? ['/api/v1/auth/csrf', '/api/v1/auth/sessions/restore', '/api/v1/auth/me']
            : ['/api/v1/auth/csrf', '/api/v1/auth/sessions/restore'],
        )
        if (scenario === 'unavailable') {
          await ready('document.querySelector("[role=alert]") !== null')
        } else {
          assert.deepEqual(errors, [], 'Abertura normal não deve gerar erros no console')
          assert.equal(await evaluate('document.querySelector("[role=alert]") !== null'), false)
        }
        if (scenario === 'authenticated') {
          await evaluate(
            'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',
          )
          await evaluate(`document.querySelector('[aria-label="Abrir menu"]').click()`)
          await ready(
            "document.querySelector('.workspace-sidebar').getAttribute('aria-hidden') === 'false'",
          )
          await evaluate(
            'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',
          )
          for (const theme of ['light', 'dark']) {
            await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`)
            const footer = await evaluate(`(()=>{
              const buttons=[...document.querySelectorAll('.workspace-sidebar__footer > button')];
              const [password,exit]=buttons.map(button=>button.getBoundingClientRect());
              const bounds=document.querySelector('.workspace-sidebar__footer').getBoundingClientRect();
              return {count:buttons.length,gap:exit.top-password.bottom,aligned:Math.abs(password.left-exit.left)<1&&Math.abs(password.width-exit.width)<1,
                colors:buttons.map(button=>getComputedStyle(button).backgroundColor),
                icons:buttons.every(button=>button.querySelector('svg')),
                clip:{x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height,scale:1}};
            })()`)
            assert.equal(footer.count, 2)
            assert.ok(footer.gap >= 10, 'Ações pessoais precisam de separação visível')
            assert.equal(footer.aligned, true, 'Botões pessoais devem ter a mesma largura')
            assert.equal(footer.icons, true)
            assert.deepEqual(footer.colors, ['rgb(37, 85, 164)', 'rgb(220, 48, 56)'])
            await evaluate("document.querySelector('.workspace-sidebar__password').focus()")
            console.log(
              await evaluate(
                `JSON.stringify({menu:document.querySelector('.workspace-sidebar').className,inert:document.querySelector('.workspace-sidebar').inert,visible:getComputedStyle(document.querySelector('.workspace-sidebar')).visibility,focused:document.activeElement.className})`,
              ),
            )
            await send('Input.dispatchKeyEvent', {
              type: 'keyDown',
              key: 'Tab',
              code: 'Tab',
              windowsVirtualKeyCode: 9,
            })
            assert.equal(
              await evaluate(
                "document.activeElement.classList.contains('workspace-sidebar__sign-out')",
              ),
              true,
            )
            if (width === 1440) {
              const screenshot = await send('Page.captureScreenshot', {
                format: 'png',
                clip: footer.clip,
              })
              fs.writeFileSync(
                `dist/ui062-menu-${theme}.png`,
                Buffer.from(screenshot.data, 'base64'),
              )
            }
          }
        }
        console.log(
          JSON.stringify({
            scenario,
            width,
            calls: calls.map((call) => call.route),
            consoleErrors: errors.length,
          }),
        )
      }
    }
    mode = 'anonymous'
    calls = []
    await send('Page.navigate', { url: origin })
    await ready('document.querySelector("input[type=password]") !== null')
    await evaluate(
      `(()=>{const set=(input,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))};set(document.querySelector('input[autocomplete=username]'),'synthetic');set(document.querySelector('input[type=password]'),'synthetic-invalid')})()`,
    )
    await evaluate(`document.querySelector('input[type=password]').form.requestSubmit()`)
    await ready("document.body.textContent.includes('Não foi possível autenticar')")
    assert.equal(calls.filter((call) => call.route === '/api/v1/auth/sessions').length, 1)
    console.log(JSON.stringify({ scenario: 'invalid-login', status: 401, feedbackVisible: true }))
  } finally {
    clearTimeout(watchdog)
    ws?.close()
    edge.kill()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
