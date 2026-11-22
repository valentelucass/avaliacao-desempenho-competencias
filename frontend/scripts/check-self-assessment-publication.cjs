// SPA/cliente reais em modo development, transporte fictício e navegador exclusivo em loopback.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { safeBrowserArtifactDirectory, safeBrowserArtifactPath } = require('./browser-artifacts.cjs')

async function main() {
  const { build } = await import('vite')
  const root = path.resolve(__dirname, '..')
  process.chdir(root)
  const before = process.argv.includes('--before')
  const baseline = path.join(root, '..', 'artifacts', 'auto-publicacao-fix-20261021', 'baseline')
  const output = safeBrowserArtifactDirectory(
    process.env.ADC_BROWSER_ARTIFACT_DIRECTORY ||
      path.join(root, '..', 'artifacts', 'auto-publicacao-fix-20261021'),
  )
  fs.mkdirSync(output, { recursive: true })
  const baselineFiles = new Map([
    [path.join(root, 'src', 'App.tsx').replaceAll('\\', '/'), 'App.tsx'],
    [path.join(root, 'src', 'App.css').replaceAll('\\', '/'), 'App.css'],
    [
      path
        .join(root, 'src', 'features', 'assessments', 'AssessmentEditor.tsx')
        .replaceAll('\\', '/'),
      'AssessmentEditor.tsx',
    ],
  ])
  if (before) {
    for (const file of baselineFiles.values())
      assert.ok(fs.existsSync(path.join(baseline, file)), 'Baseline anterior obrigatório: ' + file)
  }
  let buildTimestamp
  let buildMode
  const bundle = await build({
    configFile: path.join(root, 'vite.config.ts'),
    root,
    mode: 'development',
    plugins: [
      {
        name: 'self-assessment-baseline',
        enforce: 'pre',
        configResolved(config) {
          buildTimestamp = JSON.parse(config.define['import.meta.env.VITE_BUILD_TIMESTAMP'])
          buildMode = config.mode
        },
        load(id) {
          if (before && baselineFiles.has(id))
            return fs.readFileSync(path.join(baseline, baselineFiles.get(id)), 'utf8')
        },
      },
    ],
    resolve: { alias: { '@': path.join(root, 'src') } },
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api/v1'),
      'import.meta.env.DEV': 'true',
      'import.meta.env.PROD': 'false',
    },
    logLevel: 'silent',
    build: { write: false },
  })
  assert.equal(buildMode, 'development')
  const files = new Map(bundle.output.map((file) => [file.fileName, file.code ?? file.source]))
  files.set('logo.png', fs.readFileSync(path.join(root, 'public', 'logo.png')))
  files.set(
    'rodogarcia-marca.png',
    fs.readFileSync(path.join(root, 'public', 'rodogarcia-marca.png')),
  )
  files.set('favicon.svg', fs.readFileSync(path.join(root, 'public', 'favicon.svg')))
  const names = [
    'Aprendizagem',
    'Aprimoramento',
    'Comunicação',
    'Criatividade na resolução de problemas',
    'Cumprimento de normas e regras',
    'Delegação de tarefas',
    'Desenvolvimento de equipe',
    'Faturamento da filial/setor',
    'Feedback',
    'Flexibilidade',
    'Gestão do tempo',
  ]
  const submitted = {
    id: 'self-assessment-fixture',
    cycle: { id: 'cycle-fixture', name: 'Ciclo demonstrativo DEV 2026' },
    evaluated: { displayName: 'Pessoa fictícia em autoavaliação' },
    type: 'AUTOAVALIACAO',
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
  let detail = structuredClone(submitted)
  let writes = 0
  let serverFailure
  const idempotencyKeys = []
  const server = http.createServer((request, response) => {
    const route = request.url.split('?')[0]
    response.setHeader('Cache-Control', 'no-store')
    if (route.startsWith('/api/')) {
      response.setHeader('Content-Type', 'application/json')
      let status = 200
      let body
      try {
        if (route === '/api/v1/auth/csrf') body = { token: 'csrf-synthetic-self-assessment' }
        else if (route === '/api/v1/auth/sessions/restore') body = { authenticated: true }
        else if (route === '/api/v1/auth/me')
          body = {
            id: 'self-author-fixture',
            displayName: 'Gestor fictício',
            roles: ['GESTOR'],
            permissions: [
              'AVALIACOES.AVALIAR_VINCULADOS',
              'AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS',
              'AUTOAVALIACOES.PREENCHER_PROPRIA',
              'AUTOAVALIACOES.ENVIAR_PROPRIA',
              'AUTOAVALIACOES.VISUALIZAR_PROPRIA',
            ],
          }
        else if (route === '/api/v1/assessments')
          body = { items: [detail], page: { limit: 20, nextCursor: null } }
        else if (route === '/api/v1/assessments/creation-cycle-options') body = { cycles: [] }
        else if (route === '/api/v1/assessments/self-assessment-fixture') body = detail
        else if (route === '/api/v1/assessments/self-assessment-fixture/publish') {
          assert.equal(request.method, 'POST')
          assert.equal(request.headers['x-csrf-token'], 'csrf-synthetic-self-assessment')
          assert.match(
            request.headers['idempotency-key'] ?? '',
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          )
          assert.equal(before, false)
          assert.equal(detail.status, 'ENVIADA')
          idempotencyKeys.push(request.headers['idempotency-key'])
          writes++
          detail = {
            ...detail,
            status: 'PUBLICADA',
            allowedActions: { ...detail.allowedActions, publish: false },
          }
          body = detail
        } else {
          assert.equal(request.method, 'GET', 'Escrita inesperada: ' + route)
          status = 404
          body = { code: 'FIXTURE_ROUTE_NOT_FOUND' }
        }
      } catch (error) {
        serverFailure = error
        status = 500
        body = { code: 'FIXTURE_ASSERTION_FAILED' }
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'adc-self-publication-dev-'))
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
  let send
  let captureFailure
  let activeWidth
  let activeStep = 'browser-startup'
  let browserCleanup
  const closeOwnedBrowser = () => {
    browserCleanup ??= (async () => {
      let closeTimer
      try {
        if (send && ws?.readyState === WebSocket.OPEN) {
          await Promise.race([
            send('Browser.close'),
            new Promise((resolve) => {
              closeTimer = setTimeout(resolve, 1500)
            }),
          ])
        }
      } catch {
        // CDP pode encerrar antes da resposta; o fallback abrange apenas este processo.
      } finally {
        clearTimeout(closeTimer)
        try {
          ws?.close()
        } catch {}
        try {
          edge.kill()
        } catch {}
      }
    })()
    return browserCleanup
  }
  const watchdog = setTimeout(() => {
    void closeOwnedBrowser().finally(() => {
      server.close()
      process.exit(1)
    })
  }, 90000)
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
    const blockedExternalRequests = []
    send = (method, params = {}) =>
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
      if (message.method === 'Fetch.requestPaused') {
        const requestUrl = new URL(message.params.request.url)
        const allowed =
          requestUrl.origin === origin || ['data:', 'blob:'].includes(requestUrl.protocol)
        if (!allowed) blockedExternalRequests.push(requestUrl.origin)
        void send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', {
          requestId: message.params.requestId,
          ...(allowed ? {} : { errorReason: 'BlockedByClient' }),
        })
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
        `new Promise((resolve,reject)=>{const start=performance.now();function tick(){if(${condition})return resolve(true);if(performance.now()-start>10000)return reject(new Error('Self-assessment DEV timeout'));requestAnimationFrame(tick)}tick()})`,
      )
    const settle = () =>
      evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    const capture = async (filename) => {
      await settle()
      const screenshot = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(
        safeBrowserArtifactPath(output, filename),
        Buffer.from(screenshot.data, 'base64'),
      )
    }
    captureFailure = async (failure) => {
      const diagnostic = {
        phase: before ? 'antes' : 'depois',
        width: activeWidth,
        step: activeStep,
        failure: failure.message,
        writes,
        fixtureStatus: detail.status,
        serverFailure: serverFailure?.message,
        errors,
        blockedExternalRequests,
        dom: await evaluate(`({
          title: document.querySelector('#assessment-title')?.textContent,
          buttons: [...document.querySelectorAll('button')].map(button => ({ text: button.textContent.trim(), disabled: button.disabled })),
          messages: [...document.querySelectorAll('[role="status"], [role="alert"]')].map(message => message.textContent.trim()),
          activeElement: { tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.trim().slice(0, 100) },
          publicationEvents: window.__adcPublicationEvents ?? []
        })`),
      }
      await capture(`falha-${activeWidth ?? 'startup'}.png`)
      fs.writeFileSync(
        safeBrowserArtifactPath(output, `falha-${activeWidth ?? 'startup'}-diagnostico.json`),
        JSON.stringify(diagnostic, null, 2) + '\n',
      )
    }
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Log.enable')
    await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
    const scenarios = []
    for (const width of [1800, 390, 320]) {
      activeWidth = width
      activeStep = 'open-assessment'
      detail = structuredClone(submitted)
      const writesBefore = writes
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      })
      await send('Page.navigate', { url: origin + '/avaliacoes' })
      await ready(
        `[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Abrir avaliação')`,
      )
      await evaluate(
        `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Abrir avaliação').click()`,
      )
      await ready(`document.querySelector('.individual-assessment-summary')!==null`)
      await evaluate(`document.documentElement.dataset.theme='dark';document.fonts.ready`)
      await evaluate('window.scrollTo(0,0)')
      await capture(`${before ? 'antes' : 'depois'}-topo-${width}.png`)
      await evaluate('window.scrollTo(0,document.body.scrollHeight)')
      const button = `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Publicar avaliação')`
      assert.equal(await evaluate(`!!(${button})`), !before)
      assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'), true)
      const scoreLayout = await evaluate(`(() => {
        const cells = [...document.querySelectorAll('.individual-assessment-summary__table .table-query-screen-body td[data-label="Pontuação"]')];
        return cells.map(cell => {
          const range = document.createRange();
          range.selectNodeContents(cell);
          const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
          return { text: cell.textContent.trim(), width: cell.getBoundingClientRect().width, textLines: new Set(rects.map(rect => Math.round(rect.top))).size };
        });
      })()`)
      assert.equal(scoreLayout.length, 10)
      if (!before && width <= 390) {
        activeStep = 'mobile-score-legibility'
        for (const cell of scoreLayout) {
          assert.equal(cell.text, '100,0')
          assert.ok(cell.width >= 70, 'Score cell must provide at least 70px')
          assert.equal(cell.textLines, 1, 'Score must remain on a single text line')
        }
      }
      assert.equal(
        await evaluate(
          `document.body.textContent.includes('Esta avaliação está disponível somente para consulta com as permissões atuais.')`,
        ),
        before,
      )
      assert.equal(
        await evaluate(`document.querySelector('.application-footer__build time')?.dateTime`),
        buildTimestamp,
      )
      await capture(`${before ? 'antes' : 'depois'}-${width}.png`)
      if (!before) {
        activeStep = 'publish-via-keyboard'
        await evaluate(`(() => {
          window.__adcPublicationEvents = [];
          for (const type of ['keydown', 'keyup', 'click']) {
            document.addEventListener(type, event => {
              const target = event.target instanceof Element ? event.target.closest('button') : null;
              window.__adcPublicationEvents.push({ type: event.type, key: event.key, code: event.code, keyCode: event.keyCode, trusted: event.isTrusted, button: target?.textContent.trim() });
            }, true);
          }
        })()`)
        await evaluate(`(${button}).focus()`)
        assert.equal(await evaluate(`document.activeElement===(${button})`), true)
        await send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: 'Enter',
          code: 'Enter',
          windowsVirtualKeyCode: 13,
          nativeVirtualKeyCode: 13,
          text: '\r',
          unmodifiedText: '\r',
        })
        await send('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: 'Enter',
          code: 'Enter',
          windowsVirtualKeyCode: 13,
          nativeVirtualKeyCode: 13,
        })
        activeStep = 'await-published-success'
        await ready(`document.body.textContent.includes('Avaliação publicada com sucesso.')`)
        const events = await evaluate('window.__adcPublicationEvents')
        assert.ok(
          events.some((event) => event.type === 'keydown' && event.keyCode === 13 && event.trusted),
        )
        assert.ok(
          events.some(
            (event) =>
              event.type === 'click' && event.button === 'Publicar avaliação' && event.trusted,
          ),
        )
        assert.equal(detail.status, 'PUBLICADA')
        assert.equal(await evaluate(`!!(${button})`), false)
        assert.equal(
          await evaluate(`document.querySelector('#assessment-feedback-date')===null`),
          true,
        )
        assert.equal(
          await evaluate(`document.body.textContent.includes('Não se aplica a autoavaliações.')`),
          true,
        )
        await evaluate('window.scrollTo(0,0)')
        await capture(`publicada-${width}.png`)
        await evaluate('window.scrollTo(0,document.body.scrollHeight)')
        await capture(`publicada-rodape-${width}.png`)
      }
      if (serverFailure) throw serverFailure
      assert.equal(writes - writesBefore, before ? 0 : 1)
      assert.deepEqual(errors, [])
      assert.deepEqual(blockedExternalRequests, [])
      const scenario = {
        phase: before ? 'antes' : 'depois',
        width,
        mode: buildMode,
        role: 'GESTOR',
        publishVisible: !before,
        published: !before,
        writes: writes - writesBefore,
        consoleErrors: errors.length,
        horizontalOverflow: false,
        scoreLayout,
      }
      scenarios.push(scenario)
      console.log(JSON.stringify(scenario))
    }
    assert.equal(writes, before ? 0 : 3)
    assert.equal(new Set(idempotencyKeys).size, writes)
    fs.writeFileSync(
      safeBrowserArtifactPath(output, `${before ? 'antes' : 'depois'}-verificacao.json`),
      JSON.stringify(
        {
          mode: buildMode,
          sources: before ? 'baseline anterior preservado' : 'fontes DEV corrigidas',
          transport: 'fictício em loopback, sem API/banco reais',
          buildWrite: false,
          csrfVerified: !before,
          idempotencyHeaderVerified: !before,
          writes,
          scenarios,
        },
        null,
        2,
      ) + '\n',
    )
  } catch (error) {
    try {
      await captureFailure?.(error)
    } catch (diagnosticError) {
      console.error('Failure diagnostics unavailable:', diagnosticError.message)
    }
    throw error
  } finally {
    clearTimeout(watchdog)
    await closeOwnedBrowser()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
