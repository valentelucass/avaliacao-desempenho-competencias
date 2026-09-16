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
        if (scenario === 'anonymous') {
          await evaluate(
            `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Retomar sessão existente'));b.click()})()`,
          )
          await ready("document.body.textContent.includes('Não há uma sessão ativa para retomar')")
          assert.equal(calls.filter((call) => call.route.endsWith('/restore')).length, 2)
          assert.deepEqual(errors, [])
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
