// Componente e HttpApiClient reais; HTTP loopback e planilhas sintéticas geradas pelo teste Java/SQL.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const zlib = require('node:zlib')
const { spawn } = require('node:child_process')
const { JSDOM } = require('jsdom')
const { safeBrowserArtifactDirectory, safeBrowserArtifactPath } = require('./browser-artifacts.cjs')

function rowsFromWorkbook(content) {
  let end = content.length - 22
  while (end >= 0 && content.readUInt32LE(end) !== 0x06054b50) end--
  assert.ok(end >= 0, 'OOXML deve ser um ZIP íntegro')
  let offset = content.readUInt32LE(end + 16)
  for (let i = 0; i < content.readUInt16LE(end + 10); i++) {
    assert.equal(content.readUInt32LE(offset), 0x02014b50)
    const nameLength = content.readUInt16LE(offset + 28)
    const name = content.toString('utf8', offset + 46, offset + 46 + nameLength)
    if (name === 'xl/worksheets/sheet1.xml') {
      const local = content.readUInt32LE(offset + 42)
      const start = local + 30 + content.readUInt16LE(local + 26) + content.readUInt16LE(local + 28)
      const compressed = content.subarray(start, start + content.readUInt32LE(offset + 20))
      assert.equal(content.readUInt16LE(offset + 10), 8)
      const dom = new JSDOM(zlib.inflateRawSync(compressed).toString('utf8'), {
        contentType: 'application/xml',
      })
      const rows = [...dom.window.document.querySelectorAll('row')].map((row) =>
        [...row.querySelectorAll('c')].map((cell) => cell.textContent),
      )
      assert.equal(dom.window.document.querySelectorAll('f').length, 0)
      dom.window.close()
      return rows
    }
    offset +=
      46 + nameLength + content.readUInt16LE(offset + 30) + content.readUInt16LE(offset + 32)
  }
  throw new Error('Aba de avaliações ausente')
}

async function main() {
  const frontend = path.resolve(__dirname, '..')
  const before = process.argv.includes('--capture-before')
  if (before) assert.ok(process.env.ADC_EXPORT_BASELINE_DIRECTORY, 'Baseline privado obrigatório')
  const { build } = await import('vite')
  const { default: react } = await import('@vitejs/plugin-react')
  const previous = process.env.NODE_ENV
  let bundle
  try {
    bundle = await build({
      root: frontend,
      configFile: false,
      plugins: [
        react(),
        {
          name: 'approved-private-baseline',
          enforce: 'pre',
          load(id) {
            if (!before) return null
            const relative = path.relative(path.resolve(frontend, '..'), id)
            if (
              ![
                'frontend/src/features/assessments/AssessmentsPanel.tsx',
                'frontend/src/features/assessments/AssessmentListFilters.tsx',
                'frontend/src/features/assessments/assessment-list-filters.css',
              ].includes(relative.replaceAll('\\', '/'))
            )
              return null
            return fs.readFileSync(
              path.join(process.env.ADC_EXPORT_BASELINE_DIRECTORY, relative),
              'utf8',
            )
          },
        },
      ],
      logLevel: 'silent',
      define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
        'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api/v1'),
      },
      build: {
        write: false,
        lib: {
          entry: path.join(__dirname, 'fixtures/assessment-export.tsx'),
          formats: ['iife'],
          name: 'AssessmentExport',
        },
      },
    })
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
  }
  const builtFiles = (Array.isArray(bundle) ? bundle : [bundle]).flatMap((item) => item.output)
  const files = new Map(builtFiles.map((file) => [file.fileName, file.code ?? file.source]))
  const entry = builtFiles.find((file) => file.type === 'chunk' && file.isEntry).fileName
  const css = builtFiles
    .filter((file) => file.fileName.endsWith('.css'))
    .map((file) => `<link rel="stylesheet" href="/${file.fileName}">`)
    .join('')
  files.set(
    'index.html',
    `<!doctype html><html lang="pt-BR" data-theme="dark" ${before ? '' : 'data-astryx-theme="neutral"'}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${css}<link rel="icon" href="data:,"></head><body><div id="root"></div><script src="/${entry}"></script></body></html>`,
  )
  files.set('logo.png', fs.readFileSync(path.join(frontend, 'public/logo.png')))
  const example = fs.readFileSync(path.join(__dirname, 'fixtures/assessment-export.xlsx'))
  const filteredExample = fs.readFileSync(
    path.join(__dirname, 'fixtures/assessment-export-filtered.xlsx'),
  )
  const workbookRows = rowsFromWorkbook(example)
  assert.deepEqual(workbookRows[0], [
    'Gestor',
    'Colaborador avaliado',
    'Status da Avaliação',
    'Status do Feedback',
  ])
  assert.equal(workbookRows.length, 8)
  assert.equal(rowsFromWorkbook(filteredExample).length, 4)
  const status = { Publicada: 'PUBLICADA', Enviada: 'ENVIADA', Rascunho: 'RASCUNHO' }
  const feedback = {
    Pendente: 'PENDENTE',
    Concluído: 'CONCLUIDO',
    'Não aplicável': 'NAO_APLICAVEL',
  }
  const summaries = workbookRows.slice(1).map((row, index) => ({
    id: `synthetic-${index}`,
    cycle: { id: 'synthetic-cycle', name: 'Ciclo demonstrativo' },
    evaluated: { displayName: row[1] },
    type: row[0] === 'Não se aplica' ? 'AUTOAVALIACAO' : 'GESTOR',
    status: status[row[2]],
    feedbackStatus: feedback[row[3]],
    revision: 'fixture',
    manager: row[0],
  }))
  const calls = []
  const received = []
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    received.push({ method: req.method, path: req.url })
    res.setHeader('Cache-Control', 'no-store')
    if (url.pathname.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json')
      if (url.pathname === '/api/v1/auth/csrf') {
        res.end(JSON.stringify({ token: 'csrf-export-browser-test' }))
        return
      }
      if (url.pathname === '/api/v1/assessments/creation-cycle-options') {
        res.end('{"cycles":[]}')
        return
      }
      if (url.pathname === '/api/v1/assessments' && req.method === 'GET') {
        const filtered = url.searchParams.has('managerName')
        const rows = filtered
          ? summaries.filter(
              (row) =>
                row.manager === 'João Gestor' &&
                row.status === 'PUBLICADA' &&
                row.feedbackStatus === 'PENDENTE',
            )
          : summaries
        const limit = Number(url.searchParams.get('limit') || 6)
        const offset = url.searchParams.has('cursor') ? limit : 0
        res.end(
          JSON.stringify({
            items: rows.slice(offset, offset + limit),
            page: {
              limit,
              nextCursor: rows.length > offset + limit ? 'fixture-next-page' : null,
              totalPages: Math.ceil(rows.length / limit),
            },
            totals: {
              total: rows.length,
              drafts: rows.filter((row) => row.status === 'RASCUNHO').length,
              submitted: rows.filter((row) => row.status === 'ENVIADA').length,
              published: rows.filter((row) => row.status === 'PUBLICADA').length,
            },
          }),
        )
        return
      }
      if (url.pathname === '/api/v1/assessments/exports' && req.method === 'POST') {
        let body = ''
        req.on('data', (part) => {
          body += part
        })
        req.on('end', () => {
          try {
            assert.equal(req.headers['x-csrf-token'], 'csrf-export-browser-test')
            const filter = JSON.parse(body)
            calls.push(filter)
            const filtered = Object.keys(filter).length > 0
            if (filtered)
              assert.deepEqual(filter, {
                managerName: 'João',
                status: 'PUBLICADA',
                feedbackStatus: 'PENDENTE',
              })
            res.setHeader(
              'Content-Type',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            )
            res.setHeader(
              'Content-Disposition',
              'attachment; filename="avaliacoes-desempenho.xlsx"',
            )
            res.end(filtered ? filteredExample : example)
          } catch {
            res.writeHead(500)
            res.end(JSON.stringify({ code: 'FIXTURE_FAILED' }))
          }
        })
        return
      }
      res.writeHead(404)
      res.end(JSON.stringify({ code: 'FIXTURE_ROUTE_NOT_ALLOWED' }))
      return
    }
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
    if (!files.has(file)) {
      res.writeHead(404)
      res.end()
      return
    }
    res.setHeader(
      'Content-Type',
      {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.woff2': 'font/woff2',
      }[path.extname(file)] || 'application/octet-stream',
    )
    res.end(files.get(file))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const output = safeBrowserArtifactDirectory(
    process.env.ADC_BROWSER_ARTIFACT_DIRECTORY ||
      path.join(frontend, '../artifacts/assessment-export'),
  )
  fs.mkdirSync(output, { recursive: true })
  const downloads = fs.mkdtempSync(path.join(output, 'downloads-'))
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'adc-export-'))
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
  let ws, send
  const errors = []
  const watchdog = setTimeout(() => {
    edge.kill()
    server.close()
    process.exit(1)
  }, 60000)
  try {
    const portFile = path.join(profile, 'DevToolsActivePort'),
      deadline = Date.now() + 15000
    while (!fs.existsSync(portFile)) {
      if (Date.now() > deadline) throw new Error('Browser start timeout')
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
      if (message.method === 'Runtime.exceptionThrown')
        errors.push(
          message.params.exceptionDetails.exception?.description ||
            message.params.exceptionDetails.text,
        )
    })
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
        `new Promise((resolve,reject)=>{const start=performance.now();function tick(){if(${condition})return resolve(true);if(performance.now()-start>8000)return reject(new Error('Export browser timeout'));requestAnimationFrame(tick)}tick()})`,
      )
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Network.enable')
    await send('Network.setBlockedURLs', { urls: ['https://*'] })
    await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads })
    const cases = []
    for (const width of [1440, 390]) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      })
      await send('Page.navigate', { url: origin + '/' })
      await ready(
        before
          ? "document.querySelector('.assessment-list__item')"
          : "document.querySelector('.ev-export:not(:disabled)') && document.querySelector('.ev-table tbody tr')",
      )
      await evaluate(
        'document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))',
      )
      if (width === 390)
        await evaluate(
          `window.scrollTo(0,document.querySelector('${before ? '.assessment-list-filters' : '.ev-filter-form'}').getBoundingClientRect().top+scrollY-100)`,
        )
      if (before) {
        assert.equal(
          await evaluate("document.querySelector('.assessment-export-button') === null"),
          true,
        )
        const picture = await send('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: false,
        })
        fs.writeFileSync(
          safeBrowserArtifactPath(
            output,
            width === 1440 ? 'excel-antes-desktop.png' : 'excel-antes-celular.png',
          ),
          Buffer.from(picture.data, 'base64'),
        )
        cases.push({ width, actualBeforeSource: true })
        continue
      }
      const metrics = await evaluate(
        "(()=>{const b=document.querySelector('.ev-export'),r=b.getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth+1,button:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height},label:b.textContent.trim()}})()",
      )
      assert.equal(metrics.overflow, false)
      assert.ok(
        metrics.button.left >= 0 &&
          metrics.button.right <= width + 1 &&
          metrics.button.top >= 0 &&
          metrics.button.bottom <= 1000 &&
          metrics.button.height >= 36,
      )
      const screenshot = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      })
      const name = width === 1440 ? 'excel-depois-desktop.png' : 'excel-depois-celular.png'
      fs.writeFileSync(
        safeBrowserArtifactPath(output, name),
        Buffer.from(screenshot.data, 'base64'),
      )
      for (const filtered of [false, true]) {
        if (filtered) {
          await evaluate(`(() => {
            const field = [...document.querySelectorAll('.ev-filter-fields input[type="search"]')][1];
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, 'João');
            field.dispatchEvent(new Event('input', {bubbles:true}));
          })()`)
          for (const [index, label] of ['Publicada', 'Pendente'].entries()) {
            await evaluate(
              `document.querySelectorAll('.ev-filter-fields [role=combobox]')[${index}].click()`,
            )
            const option = `[...document.querySelectorAll('[role=option]')].find(o=>o.textContent.trim()===${JSON.stringify(label)})`
            await ready(option)
            await evaluate(option + '.click()')
          }
          await evaluate(
            "[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Aplicar filtros').click()",
          )
          await ready(
            "document.querySelector('.ev-export:not(:disabled)') && document.querySelectorAll('.ev-table tbody tr').length === " +
              (width === 1440 ? 3 : 2),
          )
        }
        await evaluate("document.querySelector('.ev-export').click()")
        const file = path.join(downloads, 'avaliacoes-desempenho.xlsx'),
          end = Date.now() + 8000
        while (!fs.existsSync(file)) {
          if (Date.now() > end) throw new Error('Download did not complete')
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
        const content = fs.readFileSync(file)
        assert.deepEqual(content, filtered ? filteredExample : example)
        assert.equal(rowsFromWorkbook(content).length, filtered ? 4 : 8)
        fs.renameSync(file, path.join(downloads, `${width}-${filtered ? 'filtered' : 'all'}.xlsx`))
      }
      cases.push({ width, metrics, download_all_rows: 7, download_filtered_rows: 3 })
    }
    assert.equal(calls.length, before ? 0 : 4)
    assert.deepEqual(errors, [])
    fs.writeFileSync(
      safeBrowserArtifactPath(
        output,
        before ? 'assessment-export-before.json' : 'assessment-export-browser.json',
      ),
      JSON.stringify(
        {
          cases,
          calls,
          errors,
          actualPageAndClient: true,
          transport: 'loopback synthetic',
          productionContacted: false,
        },
        null,
        2,
      ),
    )
    console.log(
      before
        ? 'Capturas do fonte anterior: 2 tamanhos, zero exportações.'
        : 'Excel de avaliações: 2 tamanhos, 4 downloads íntegros, filtros/CSRF e todas as páginas aprovados.',
    )
  } catch (error) {
    try {
      console.error(JSON.stringify({ received, errors }))
      console.error(
        JSON.stringify(
          await send('Runtime.evaluate', {
            expression: 'document.body.innerText',
            returnByValue: true,
          }),
        ),
      )
      const capture = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(
        safeBrowserArtifactPath(output, 'excel-browser-failure.png'),
        Buffer.from(capture.data, 'base64'),
      )
    } catch {}
    throw error
  } finally {
    clearTimeout(watchdog)
    if (send && ws?.readyState === WebSocket.OPEN) {
      try {
        await Promise.race([
          send('Browser.close'),
          new Promise((resolve) => setTimeout(resolve, 1200)),
        ])
      } catch {}
    }
    try {
      ws?.close()
    } catch {}
    edge.kill()
    await new Promise((resolve) => server.close(resolve))
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
module.exports = { rowsFromWorkbook }
