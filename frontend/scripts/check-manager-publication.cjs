// SPA e cliente reais, HTTP fictício em loopback e perfil de navegador exclusivo.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

async function main() {
  const { build } = await import('vite')
  const root = path.resolve(__dirname, '..')
  process.chdir(root)
  const before = process.argv.includes('--before')
  const baseline = path.join(root, '..', 'artifacts', 'gestor-publicacao', 'App.before.tsx')
  let buildTimestamp
  const bundle = await build({
    configFile: path.join(root, 'vite.config.ts'),
    root,
    plugins: [
      {
        name: 'baseline-app',
        enforce: 'pre',
        configResolved(config) {
          buildTimestamp = JSON.parse(config.define['import.meta.env.VITE_BUILD_TIMESTAMP'])
        },
        load(id) {
          if (before && id === path.join(root, 'src', 'App.tsx').replaceAll('\\', '/'))
            return fs.readFileSync(baseline, 'utf8')
        },
      },
    ],
    resolve: { alias: { '@': path.join(root, 'src') } },
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api/v1') },
    logLevel: 'silent',
    build: { write: false },
  })
  const files = new Map(bundle.output.map((file) => [file.fileName, file.code ?? file.source]))
  files.set('logo.png', fs.readFileSync(path.join(root, 'public', 'logo.png')))
  files.set('favicon.svg', fs.readFileSync(path.join(root, 'public', 'favicon.svg')))
  const names = [
    'Aprendizagem',
    'Aprimoramento',
    'Comprometimento',
    'Comunicação',
    'Conduta pessoal',
    'Conhecimento técnico',
    'Criatividade na resolução de problemas',
    'Flexibilidade',
    'Gestão do tempo',
    'Pontualidade e assiduidade',
    'Relacionamento interpessoal',
  ]
  let detail = {
    id: 'assessment-fixture',
    cycle: { id: 'cycle-fixture', name: 'Ciclo demonstrativo 2026' },
    evaluated: { displayName: 'Colaborador fictício' },
    type: 'GESTOR',
    status: 'ENVIADA',
    feedbackStatus: 'NAO_APLICAVEL',
    revision: 'fixture-revision',
    questionnaire: { version: '2024.1', competencies: [] },
    answers: [],
    result: {
      finalScore: 100,
      classification: { label: 'Dentro das expectativas', guidance: 'Acelerar e desenvolver' },
    },
    competencyScores: names.map((name, i) => ({ id: 'c' + i, name, score: 100 })),
    allowedActions: {
      edit: false,
      submit: false,
      publish: !before,
      reopen: false,
      completeFeedback: false,
    },
  }
  let writes = 0
  const server = http.createServer((request, response) => {
    const route = request.url.split('?')[0]
    response.setHeader('Cache-Control', 'no-store')
    if (route.startsWith('/api/')) {
      response.setHeader('Content-Type', 'application/json')
      let status = 200
      let body
      if (route === '/api/v1/auth/csrf') body = { token: 'csrf-synthetic-browser' }
      else if (route === '/api/v1/auth/sessions/restore') body = { authenticated: true }
      else if (route === '/api/v1/auth/me')
        body = {
          id: 'manager-fixture',
          displayName: 'Gestor fictício',
          roles: ['GESTOR'],
          permissions: [
            'AVALIACOES.AVALIAR_VINCULADOS',
            'AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS',
          ],
        }
      else if (route === '/api/v1/assessments')
        body = { items: [detail], page: { limit: 20, nextCursor: null } }
      else if (route === '/api/v1/assessments/creation-cycle-options') body = { cycles: [] }
      else if (route === '/api/v1/assessments/assessment-fixture') body = detail
      else if (route === '/api/v1/assessments/assessment-fixture/publish') {
        assert.equal(request.method, 'POST')
        assert.equal(request.headers['x-csrf-token'], 'csrf-synthetic-browser')
        assert.ok(request.headers['idempotency-key'])
        assert.equal(before, false)
        writes++
        detail = {
          ...detail,
          status: 'PUBLICADA',
          allowedActions: { ...detail.allowedActions, publish: false },
        }
        body = detail
      } else {
        status = 404
        body = { code: 'FIXTURE_ROUTE_NOT_FOUND' }
      }
      response.writeHead(status)
      response.end(JSON.stringify(body))
      return
    }
    const name = route === '/' || route === '/avaliacoes' ? 'index.html' : route.slice(1)
    const content = files.get(name)
    if (content !== undefined) {
      const types = {
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
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
    const output = path.join(root, '..', 'artifacts', 'gestor-publicacao')
    fs.mkdirSync(output, { recursive: true })
    for (const width of [1800, 375]) {
      detail = {
        ...detail,
        status: 'ENVIADA',
        allowedActions: { ...detail.allowedActions, publish: !before },
      }
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      })
      await send('Page.navigate', { url: origin + '/avaliacoes?jornada=EQUIPE' })
      await ready(
        `[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Abrir avaliação')`,
      )
      await evaluate(
        `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Abrir avaliação').click()`,
      )
      await ready(`document.body.textContent.includes('Pontualidade e assiduidade')`)
      await evaluate(`document.documentElement.dataset.theme='dark';document.fonts.ready`)
      await evaluate(`window.scrollTo(0,document.body.scrollHeight)`)
      await evaluate(
        'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',
      )
      const button = `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Publicar avaliação')`
      assert.equal(await evaluate(`!!(${button})`), !before)
      assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'), true)
      if (!before) {
        assert.equal(
          await evaluate(`document.querySelector('.application-footer__build time')?.dateTime`),
          buildTimestamp,
        )
        assert.equal(
          await evaluate(`(() => {
            const stamp = document.querySelector('.application-footer__build');
            const rect = stamp.getBoundingClientRect();
            return stamp.textContent.includes('(Brasília)') && rect.left >= 0 && rect.right <= innerWidth;
          })()`),
          true,
        )
      }
      const screenshot = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(
        path.join(output, `${before ? 'antes' : 'depois'}-${width}.png`),
        Buffer.from(screenshot.data, 'base64'),
      )
      if (!before) {
        await evaluate(`(${button}).focus()`)
        assert.equal(await evaluate(`document.activeElement===(${button})`), true)
        await evaluate(`(${button}).click()`)
        await ready(`document.body.textContent.includes('Avaliação publicada com sucesso.')`)
        assert.equal(await evaluate(`!!(${button})`), false)
      }
      assert.deepEqual(errors, [])
      console.log(
        JSON.stringify({
          phase: before ? 'antes' : 'depois',
          width,
          publishVisible: !before,
          consoleErrors: errors.length,
        }),
      )
    }
    assert.equal(writes, before ? 0 : 2)
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
