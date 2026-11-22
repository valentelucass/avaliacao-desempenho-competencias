// Componente/cliente reais, HTTP fictício em loopback e perfil Edge exclusivo.
// Somente a prorrogação fictícia exata admite POST; as demais escritas são recusadas.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { safeBrowserArtifactDirectory, safeBrowserArtifactPath } = require('./browser-artifacts.cjs')

async function main() {
  const root = path.resolve(__dirname, '..')
  process.chdir(root)
  const output = safeBrowserArtifactDirectory(
    path.resolve(
      process.env.ADC_CYCLE_SCREENSHOT_DIRECTORY ||
        process.env.ADC_BROWSER_ARTIFACT_DIRECTORY ||
        path.join(root, '../backend/target/cycle-extension-browser'),
    ),
  )
  fs.mkdirSync(output, { recursive: true })
  const report = {
    case: 'Consulta e prorrogação de ciclo fictício aberto com prazo encerrado',
    transport: 'synthetic-loopback-http',
    buildWritesDist: false,
    results: [],
    passed: false,
  }
  const { build } = await import('vite')
  const { default: react } = await import('@vitejs/plugin-react')
  const bundle = await build({
    configFile: false,
    root,
    plugins: [react()],
    resolve: { alias: { '@': path.join(root, 'src') } },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api/v1'),
    },
    logLevel: 'silent',
    build: {
      write: false,
      lib: {
        entry: path.join(__dirname, 'fixtures/cycle-configuration.tsx'),
        name: 'CycleConfiguration',
        formats: ['iife'],
      },
    },
  })
  const files = new Map(
    (Array.isArray(bundle) ? bundle : [bundle])
      .flatMap((result) => result.output)
      .map((file) => [file.fileName, file.code ?? file.source]),
  )
  const entry = [...files.keys()].find((name) => name.endsWith('.js'))
  assert.ok(entry, 'A fixture deve gerar um script em memória')
  const styles = [...files.keys()]
    .filter((name) => name.endsWith('.css'))
    .map((name) => `<link rel="stylesheet" href="/${name}">`)
    .join('')
  files.set(
    'index.html',
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<title>Consulta fictícia de ciclo</title></head><body><div id="root"></div><script src="/${entry}"></script></body></html>`,
  )
  const id = (number) => `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`
  const cycleId = id(1)
  const appliedId = id(2)
  const versionId = id(3)
  const calculationId = id(4)
  const matrixId = id(5)
  const cycle = {
    id: cycleId,
    name: 'Ciclo demonstrativo 2026',
    status: 'ABERTO',
    openingAt: '2026-09-16T17:00:00Z',
    closingAt: '2026-10-17T02:59:00Z',
    windowStatus: 'PRAZO_ENCERRADO',
  }
  const option = {
    calculationConfigurationVersionId: calculationId,
    calculationCode: 'MEDIA_SIMPLES_2024_1',
    calculationVersionNumber: 1,
    classificationMatrixVersionId: matrixId,
    classificationMatrixCode: 'GERAL',
    classificationMatrixVersionNumber: 1,
  }
  const versions = [
    {
      questionnaireVersionId: versionId,
      questionnaireCode: 'QUESTIONARIO-DEMONSTRATIVO',
      questionnaireName: 'Questionário demonstrativo aplicado',
      versionNumber: 1,
      title: 'Competências fictícias',
      configurationOptions: [option],
    },
    {
      questionnaireVersionId: id(6),
      questionnaireCode: 'QUESTIONARIO-ALTERNATIVO',
      questionnaireName: 'Questionário alternativo não aplicado',
      versionNumber: 2,
      title: 'Alternativa fictícia',
      configurationOptions: [option],
    },
  ]
  const configuration = {
    cycleId,
    code: 'DEMO-2026',
    name: cycle.name,
    status: cycle.status,
    windowStatus: cycle.windowStatus,
    openingAtLocal: '2026-09-16T14:00',
    closingAtLocal: '2026-10-16T23:59',
    closingAt: cycle.closingAt,
    timeZone: 'America/Sao_Paulo',
    selfAssessmentEnabled: true,
    questionnaires: [
      {
        cycleQuestionnaireId: appliedId,
        questionnaireVersionId: versionId,
        calculationConfigurationVersionId: calculationId,
        classificationMatrixVersionId: matrixId,
      },
    ],
  }
  const originalCycle = structuredClone(cycle)
  const originalConfiguration = structuredClone(configuration)
  const futureClosingAtLocal = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 16)
  const newClosingAt = new Date(futureClosingAtLocal + '-03:00').toISOString()
  const extensionPayload = {
    closingAtLocal: futureClosingAtLocal,
    expectedClosingAt: originalConfiguration.closingAt,
    reason: 'Prorrogação fictícia para validar a interface.',
  }
  let extensionAttempts = 0
  const calls = []
  const rejectedRequests = []
  const server = http.createServer(async (request, response) => {
    const route = new URL(request.url, 'http://127.0.0.1').pathname
    const method = request.method
    calls.push({ method, route })
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'",
    )
    if (method === 'POST' && route === `/api/v1/evaluation-cycles/${cycleId}/extend-closing`) {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      let payload
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        assert.deepEqual(payload, extensionPayload)
        assert.equal(request.headers['x-csrf-token'], 'synthetic-cycle-extension-csrf')
      } catch {
        rejectedRequests.push({ method, route })
        response
          .writeHead(422, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ code: 'FIXTURE_PAYLOAD_REJECTED' }))
        return
      }
      extensionAttempts++
      if (extensionAttempts === 1) {
        response.writeHead(409, { 'Content-Type': 'application/problem+json' }).end(
          JSON.stringify({
            status: 409,
            code: 'CONFLICT',
            reasonCode: 'CYCLE_EXTENSION_CONFLICT',
            requestId: 'synthetic-extension-conflict',
          }),
        )
        return
      }
      if (extensionAttempts !== 2) {
        rejectedRequests.push({ method, route })
        response.writeHead(409).end()
        return
      }
      Object.assign(configuration, {
        closingAtLocal: payload.closingAtLocal,
        closingAt: newClosingAt,
        windowStatus: 'VIGENTE',
      })
      Object.assign(cycle, { closingAt: newClosingAt, windowStatus: 'VIGENTE' })
      response.writeHead(204).end()
      return
    }
    if (method !== 'GET') {
      rejectedRequests.push({ method, route })
      response.writeHead(405).end()
      return
    }
    if (route.startsWith('/api/')) {
      response.setHeader('Content-Type', 'application/json')
      let body
      if (route === '/api/v1/auth/csrf') body = { token: 'synthetic-cycle-extension-csrf' }
      else if (route === '/api/v1/evaluation-cycles')
        body = { items: [cycle], page: { limit: 100, nextCursor: null } }
      else if (route === '/api/v1/questionnaire-versions/approved') body = versions
      else if (route === `/api/v1/evaluation-cycles/${cycleId}/administration-configuration`)
        body = configuration
      else if (route === `/api/v1/evaluation-cycles/${cycleId}/questionnaires/${appliedId}`)
        body = {
          cycleQuestionnaireId: appliedId,
          questionnaireVersionId: versionId,
          questionnaireCode: 'QUESTIONARIO-DEMONSTRATIVO',
          questionnaireVersionNumber: 1,
          title: 'Conteúdo demonstrativo preservado',
          competencies: [
            { id: id(7), name: 'Competência fictícia somente para consulta', questions: [] },
          ],
        }
      else {
        rejectedRequests.push({ method, route })
        response.writeHead(404).end(JSON.stringify({ code: 'FIXTURE_ROUTE_NOT_FOUND' }))
        return
      }
      response.end(JSON.stringify(body))
      return
    }
    const name = route === '/' ? 'index.html' : route.slice(1)
    const content = files.get(name)
    if (content === undefined) {
      if (route !== '/favicon.ico') rejectedRequests.push({ method, route })
      response.writeHead(route === '/favicon.ico' ? 204 : 404).end()
      return
    }
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.woff2': 'font/woff2',
    }
    response.setHeader('Content-Type', types[path.extname(name)] || 'application/octet-stream')
    response.end(content)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'adc-cycle-configuration-'))
  const edge = spawn(
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    [
      '--headless=new',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-extensions',
      '--no-first-run',
      '--remote-debugging-port=0',
      '--user-data-dir=' + profile,
      'about:blank',
    ],
    { windowsHide: true, stdio: 'ignore' },
  )
  let ws
  let send
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
        // O navegador pode encerrar o CDP antes da resposta; manter o fallback local.
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
    report.failure = 'Tempo máximo do navegador excedido'
    fs.writeFileSync(
      safeBrowserArtifactPath(output, 'cycle-configuration-report.json'),
      JSON.stringify(report, null, 2),
    )
    void closeOwnedBrowser().finally(() => {
      server.close()
      process.exit(1)
    })
  }, 60000)
  try {
    const portFile = path.join(profile, 'DevToolsActivePort')
    const start = Date.now()
    while (!fs.existsSync(portFile)) {
      assert.ok(Date.now() - start < 15000, 'Edge não disponibilizou depuração em 15 segundos')
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
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
    const externalRequests = []
    send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const messageId = ++nextId
        pending.set(messageId, { resolve, reject })
        ws.send(JSON.stringify({ id: messageId, method, params }))
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
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
        const entry = message.params.entry
        const expectedConflict =
          entry.source === 'network' &&
          entry.url === `${origin}/api/v1/evaluation-cycles/${cycleId}/extend-closing` &&
          /\b409\b/.test(entry.text) &&
          extensionAttempts === 1
        if (!expectedConflict) errors.push('Browser log error')
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')
        errors.push('Console error')
      if (message.method === 'Fetch.requestPaused') {
        const allowed = new URL(message.params.request.url).origin === origin
        if (!allowed) externalRequests.push('Blocked external request')
        void send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', {
          requestId: message.params.requestId,
          ...(allowed ? {} : { errorReason: 'BlockedByClient' }),
        }).catch(() => errors.push('Network interception error'))
      }
    })
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })
      if (result.exceptionDetails)
        throw new Error(
          result.exceptionDetails.exception?.description || result.exceptionDetails.text,
        )
      return result.result.value
    }
    const ready = async (condition) => {
      try {
        return await evaluate(
          `new Promise((resolve,reject)=>{const start=performance.now();function tick(){if(${condition})return resolve(true);if(performance.now()-start>8000)return reject(new Error('Consulta fictícia de ciclo não ficou pronta'));requestAnimationFrame(tick)}tick()})`,
        )
      } catch (error) {
        report.timeout = {
          condition,
          recentSyntheticRequests: calls.slice(-12),
          dom: await evaluate(
            `({headings:[...document.querySelectorAll('h2,h3')].map(node=>node.textContent),buttons:[...document.querySelectorAll('button')].map(node=>({text:node.textContent.trim(),disabled:node.disabled,top:node.getBoundingClientRect().top})),inputs:[...document.querySelectorAll('form input')].map(node=>({type:node.type,value:node.value,disabled:node.disabled})),alert:document.querySelector('[role=alert]')?.textContent??null,scrollY})`,
          ),
        }
        const capture = await send('Page.captureScreenshot', { format: 'png' })
        fs.writeFileSync(
          safeBrowserArtifactPath(output, 'cycle-timeout.png'),
          Buffer.from(capture.data, 'base64'),
        )
        throw error
      }
    }
    const click = async (label) => {
      let point
      try {
        point = await evaluate(
          `(async()=>{const button=[...document.querySelectorAll('button')].find(item=>item.textContent.trim()===${JSON.stringify(label)});if(!button)throw new Error('Botão esperado ausente');button.scrollIntoView({block:'center',behavior:'instant'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const r=button.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;if(button.disabled||document.elementFromPoint(x,y)?.closest('button')!==button)throw new Error('Botão esperado não recebe clique na posição visível');return {x,y}})()`,
        )
      } catch (error) {
        report.clickFailure = { label, recentSyntheticRequests: calls.slice(-12) }
        const capture = await send('Page.captureScreenshot', { format: 'png' })
        fs.writeFileSync(
          safeBrowserArtifactPath(output, 'cycle-click-failure.png'),
          Buffer.from(capture.data, 'base64'),
        )
        throw error
      }
      await send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        button: 'left',
        clickCount: 1,
        ...point,
      })
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        button: 'left',
        clickCount: 1,
        ...point,
      })
    }
    const fill = (label, value) =>
      evaluate(
        `(()=>{const label=[...document.querySelectorAll('label')].find(item=>item.textContent.trim()===${JSON.stringify(label)});const input=document.getElementById(label.htmlFor);const type=input.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement;Object.getOwnPropertyDescriptor(type.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`,
      )
    const fieldsExpression = `(()=>{const read=(label)=>{const node=[...document.querySelectorAll('label')].find(item=>item.textContent.trim()===label);const input=document.getElementById(node.htmlFor);return {value:input.value,disabled:input.disabled}};return {code:read('Código do ciclo'),name:read('Nome do ciclo'),zone:read('Fuso horário'),opening:read('Abertura'),closing:read('Encerramento'),self:(()=>{const input=[...document.querySelectorAll('label')].find(item=>item.textContent.trim()==='Permitir autoavaliação neste ciclo').querySelector('input');return {checked:input.checked,disabled:input.disabled}})()}})()`
    const screenshotAt = async (selector, name) => {
      await evaluate(
        `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start',behavior:'instant'});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`,
      )
      const capture = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(safeBrowserArtifactPath(output, name), Buffer.from(capture.data, 'base64'))
    }
    await send('Page.enable')
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: "history.scrollRestoration = 'manual'",
    })
    await send('Runtime.enable')
    await send('Log.enable')
    await send('Network.enable')
    await send('Network.setBlockedURLs', { urls: ['https://*'] })
    await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
    await send('Emulation.setTimezoneOverride', { timezoneId: 'UTC' })
    for (const width of [1440, 375]) {
      for (const theme of ['light', 'dark']) {
        Object.assign(cycle, structuredClone(originalCycle))
        Object.assign(configuration, structuredClone(originalConfiguration))
        extensionAttempts = 0
        const callStart = calls.length
        await send('Emulation.setDeviceMetricsOverride', {
          width,
          height: 1000,
          deviceScaleFactor: 1,
          mobile: false,
        })
        await send('Emulation.setEmulatedMedia', {
          features: [
            { name: 'prefers-reduced-motion', value: 'reduce' },
            { name: 'prefers-color-scheme', value: theme },
          ],
        })
        await send('Page.navigate', { url: origin + '/' })
        await ready(`document.body.textContent.includes('Aberto — prazo encerrado')`)
        await evaluate(
          `document.documentElement.dataset.theme=${JSON.stringify(theme)};document.fonts.ready`,
        )
        const listText = await evaluate(
          `document.querySelector('[aria-labelledby="cycle-list-title"]').textContent`,
        )
        assert.ok(
          listText.includes('16/09/2026, 14:00'),
          'Abertura da lista deve usar Brasília mesmo com navegador UTC',
        )
        assert.ok(
          listText.includes('16/10/2026, 23:59 (Brasília)'),
          'Encerramento da lista deve usar Brasília',
        )
        await click('Consultar')
        await ready(`document.querySelector('form input')?.value==='DEMO-2026'`)
        const fields = await evaluate(fieldsExpression)
        assert.deepEqual(fields, {
          code: { value: configuration.code, disabled: true },
          name: { value: configuration.name, disabled: true },
          zone: { value: configuration.timeZone, disabled: true },
          opening: { value: configuration.openingAtLocal, disabled: true },
          closing: { value: configuration.closingAtLocal, disabled: true },
          self: { checked: true, disabled: true },
        })
        const selections = await evaluate(
          `[...document.querySelectorAll('form fieldset tbody tr')].filter(row=>row.querySelector('input[type=checkbox]')).map(row=>({applied:row.textContent.includes('Questionário demonstrativo aplicado'),checked:row.querySelector('input[type=checkbox]').checked,disabled:row.querySelector('input[type=checkbox]').disabled}))`,
        )
        assert.deepEqual(selections, [
          { applied: false, checked: false, disabled: true },
          { applied: true, checked: true, disabled: true },
        ])
        const formText = await evaluate(`document.querySelector('form').textContent`)
        assert.ok(
          formText.includes('Prazo encerrado para criar avaliações.'),
          'Detalhe deve explicar prazo vencido',
        )
        assert.ok(
          formText.includes('16/09/2026, 14:00') &&
            formText.includes('16/10/2026, 23:59 (Brasília)'),
          'Datas do detalhe devem corresponder à configuração',
        )
        assert.equal(
          await evaluate(
            `!!document.querySelector('form[aria-labelledby="cycle-configuration-title"] button[type=submit]')`,
          ),
          false,
          'Ciclo aberto não pode oferecer salvar',
        )
        const fitsViewport = await evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        if (!fitsViewport) {
          report.layoutFailure = await evaluate(
            `({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].map(element=>({tag:element.tagName,className:typeof element.className==='string'?element.className:'',left:element.getBoundingClientRect().left,right:element.getBoundingClientRect().right,width:element.getBoundingClientRect().width})).filter(item=>item.right>innerWidth+1&&item.width>0).slice(0,25)})`,
          )
          report.layoutFailure.theme = theme
          const failedScreenshot = await send('Page.captureScreenshot', { format: 'png' })
          fs.writeFileSync(
            safeBrowserArtifactPath(output, `cycle-layout-failure-${width}-${theme}.png`),
            Buffer.from(failedScreenshot.data, 'base64'),
          )
        }
        assert.equal(fitsViewport, true, 'Não pode haver overflow horizontal')
        await evaluate(
          `window.scrollTo(0,0);new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`,
        )
        const overview = await send('Page.captureScreenshot', { format: 'png' })
        fs.writeFileSync(
          safeBrowserArtifactPath(output, `cycle-overview-${width}-${theme}.png`),
          Buffer.from(overview.data, 'base64'),
        )
        await evaluate(
          `document.querySelector('form').scrollIntoView({block:'start',behavior:'instant'});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`,
        )
        const screenshot = await send('Page.captureScreenshot', { format: 'png' })
        fs.writeFileSync(
          safeBrowserArtifactPath(output, `cycle-configuration-${width}-${theme}.png`),
          Buffer.from(screenshot.data, 'base64'),
        )
        await click('Visualizar questionário aplicado 1')
        await ready(
          `document.body.textContent.includes('Competência fictícia somente para consulta')`,
        )
        assert.ok(
          await evaluate(
            `document.getElementById('applied-questionnaire-content-title').textContent.includes('Conteúdo demonstrativo preservado')`,
          ),
          'Prévia deve mostrar o questionário aplicado correto',
        )
        await ready(`!!document.querySelector('form[aria-labelledby="cycle-extension-title"]')`)
        await fill('Novo encerramento (Brasília)', extensionPayload.closingAtLocal)
        await fill('Motivo da prorrogação', extensionPayload.reason)
        await screenshotAt(
          'form[aria-labelledby="cycle-extension-title"]',
          `cycle-extension-before-${width}-${theme}.png`,
        )
        await fill('Novo encerramento (Brasília)', originalConfiguration.closingAtLocal)
        await fill('Motivo da prorrogação', extensionPayload.reason)
        await click('Prorrogar encerramento')
        await ready(
          `document.querySelector('[role=alert]')?.textContent.includes('posterior ao prazo atual')`,
        )
        assert.equal(extensionAttempts, 0, 'Data igual ao prazo atual não pode enviar POST')
        await fill('Novo encerramento (Brasília)', extensionPayload.closingAtLocal)
        await fill('Motivo da prorrogação', 'curto')
        await click('Prorrogar encerramento')
        await ready(
          `document.querySelector('[role=alert]')?.textContent.includes('10 e 500 caracteres')`,
        )
        assert.equal(extensionAttempts, 0, 'Motivo curto não pode enviar POST')
        await fill('Motivo da prorrogação', '  ' + extensionPayload.reason + '  ')
        await click('Prorrogar encerramento')
        await ready(
          `document.querySelector('[role=alert]')?.textContent.includes('synthetic-extension-conflict')`,
        )
        assert.equal(
          extensionAttempts,
          1,
          'O conflito fictício deve corresponder a uma tentativa única',
        )
        assert.deepEqual(
          configuration,
          originalConfiguration,
          'Conflito não pode alterar a configuração',
        )
        assert.deepEqual(
          await evaluate(fieldsExpression),
          fields,
          'Conflito deve preservar os campos consultados',
        )
        await screenshotAt(
          'form[aria-labelledby="cycle-extension-title"]',
          `cycle-extension-error-${width}-${theme}.png`,
        )
        await click('Consultar')
        await ready(
          `!document.querySelector('[role=alert]') && document.querySelector('form input')?.value==='DEMO-2026'`,
        )
        await fill('Novo encerramento (Brasília)', extensionPayload.closingAtLocal)
        await fill('Motivo da prorrogação', extensionPayload.reason)
        await click('Prorrogar encerramento')
        await ready(
          `document.body.textContent.includes('Encerramento prorrogado. A vigência e a configuração foram atualizadas.')`,
        )
        assert.equal(
          extensionAttempts,
          2,
          'A segunda tentativa fictícia deve concluir a prorrogação',
        )
        assert.deepEqual(
          await evaluate(fieldsExpression),
          {
            ...fields,
            closing: { value: futureClosingAtLocal, disabled: true },
          },
          'Prorrogação deve atualizar somente o encerramento e manter campos bloqueados',
        )
        assert.ok(
          await evaluate(
            `document.querySelector('form').textContent.includes('Dentro do período configurado')`,
          ),
          'Vigência após sucesso deve vir da nova consulta',
        )
        assert.equal(
          await evaluate(`document.body.textContent.includes('Aberto — prazo encerrado')`),
          false,
          'Listagem deve refletir a nova vigência retornada pelo servidor',
        )
        assert.deepEqual(configuration.questionnaires, originalConfiguration.questionnaires)
        assert.deepEqual(
          await evaluate(
            `[...document.querySelectorAll('form fieldset tbody tr')].filter(row=>row.querySelector('input[type=checkbox]')).map(row=>({applied:row.textContent.includes('Questionário demonstrativo aplicado'),checked:row.querySelector('input[type=checkbox]').checked,disabled:row.querySelector('input[type=checkbox]').disabled}))`,
          ),
          selections,
          'Questionários aplicados devem continuar selecionados e bloqueados após a prorrogação',
        )
        assert.equal(configuration.openingAtLocal, originalConfiguration.openingAtLocal)
        assert.equal(configuration.selfAssessmentEnabled, true)
        assert.equal(configuration.status, 'ABERTO')
        assert.equal(
          await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
          true,
          'Prorrogação não pode gerar overflow horizontal',
        )
        await screenshotAt(
          'form[aria-labelledby="cycle-configuration-title"]',
          `cycle-extension-after-configuration-${width}-${theme}.png`,
        )
        await screenshotAt(
          'form[aria-labelledby="cycle-extension-title"]',
          `cycle-extension-after-${width}-${theme}.png`,
        )
        const scenarioCalls = calls
          .slice(callStart)
          .filter((call) => call.route.startsWith('/api/'))
        assert.equal(
          scenarioCalls.filter((call) => call.route.endsWith('/administration-configuration'))
            .length,
          3,
        )
        assert.equal(
          scenarioCalls.filter((call) => call.route.endsWith('/administration-draft')).length,
          0,
        )
        assert.equal(
          scenarioCalls.filter((call) => call.route === '/api/v1/evaluation-cycles').length,
          2,
          'Sucesso deve reconsultar também a listagem',
        )
        assert.equal(scenarioCalls.filter((call) => call.method === 'POST').length, 2)
        assert.ok(
          scenarioCalls.every(
            (call) =>
              call.method === 'GET' ||
              (call.method === 'POST' &&
                call.route === `/api/v1/evaluation-cycles/${cycleId}/extend-closing`),
          ),
        )
        assert.deepEqual(rejectedRequests, [])
        assert.deepEqual(externalRequests, [])
        assert.deepEqual(errors, [])
        cycle.status = 'ENCERRADO'
        configuration.status = 'ENCERRADO'
        await send('Page.navigate', { url: origin + '/' })
        await ready(
          `document.querySelector('[aria-labelledby="cycle-list-title"] .astryx-badge')?.textContent.trim()==='Encerrado'`,
        )
        await click('Consultar')
        await ready(`document.querySelector('form input')?.value==='DEMO-2026'`)
        assert.equal(
          await evaluate(
            `!!document.querySelector('form[aria-labelledby="cycle-extension-title"]')`,
          ),
          false,
          'Ciclo encerrado não pode oferecer prorrogação',
        )
        assert.ok((await evaluate(fieldsExpression)).closing.disabled)
        assert.equal(
          extensionAttempts,
          2,
          'Consulta do ciclo encerrado não pode emitir escrita adicional',
        )
        assert.deepEqual(rejectedRequests, [])
        assert.deepEqual(externalRequests, [])
        assert.deepEqual(errors, [])
        report.results.push({
          width,
          theme,
          populatedReadOnlyFields: true,
          selfAssessmentChecked: true,
          appliedQuestionnairePreserved: true,
          brasiliaDatesWithBrowserUTC: true,
          expiredWindowExplained: true,
          horizontalOverflow: false,
          syntheticExtensionAttempts: 2,
          syntheticExtensionsSucceeded: 1,
          invalidInputsSendNoRequest: true,
          conflictPreservesOriginal: true,
          configurationAndListReloaded: true,
          onlyClosingChanges: true,
          closedCycleHasNoExtension: true,
          otherBusinessWrites: 0,
          consoleErrors: 0,
          externalRequests: 0,
        })
      }
    }
    report.passed = true
    console.log(JSON.stringify(report))
  } catch (error) {
    report.failure = error.message
    throw error
  } finally {
    clearTimeout(watchdog)
    await closeOwnedBrowser()
    fs.writeFileSync(
      safeBrowserArtifactPath(output, 'cycle-configuration-report.json'),
      JSON.stringify(report, null, 2) + '\n',
    )
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
