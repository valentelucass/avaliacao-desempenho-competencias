const assert = require('node:assert/strict')
const path = require('node:path')

module.exports = async function checkAssessmentCreationOptions({ send, frameId, css }) {
  const { build } = await import('vite')
  const { default: react } = await import('@vitejs/plugin-react')
  const previousNodeEnv = process.env.NODE_ENV
  let bundle
  try {
    bundle = await build({
      configFile: false,
      root: path.resolve(__dirname, '..'),
      plugins: [react()],
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      logLevel: 'silent',
      build: {
        write: false,
        lib: {
          entry: path.resolve(__dirname, 'fixtures/assessment-creation-options.tsx'),
          formats: ['iife'],
          name: 'AssessmentCreationOptions',
        },
      },
    })
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
  const code = (Array.isArray(bundle) ? bundle : [bundle])
    .flatMap((result) => result.output)
    .find((file) => file.type === 'chunk' && file.isEntry).code
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
  const ready = (condition) =>
    evaluate(`new Promise((resolve,reject)=>{
    const start=performance.now();function tick(){if(${condition})return resolve(true);
    if(performance.now()-start>3000)return reject(new Error('Creation options timeout'));
    requestAnimationFrame(tick)}tick()})`)
  const select = async (label, value) => {
    await evaluate(`(()=>{const l=[...document.querySelectorAll('label')].find(l=>l.textContent===${JSON.stringify(label)});
      const s=document.getElementById(l.htmlFor);s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`)
  }
  const click = async (label) => {
    const coordinates =
      await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});
      b.scrollIntoView({block:'center',behavior:'instant'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', {
        type,
        button: 'left',
        clickCount: 1,
        ...coordinates,
      })
    }
  }
  const results = []
  for (const width of [375, 1440])
    for (const theme of ['light', 'dark']) {
      for (const [profile, type, administrative] of [
        ['Gestor', 'GESTOR', false],
        ['RH', 'GESTOR', true],
        ['Diretoria', 'DIRETORIA_GERENCIA', true],
        ['Gestor', 'AUTOAVALIACAO', false],
        ['RH', 'AUTOAVALIACAO', true],
        ['Diretoria', 'AUTOAVALIACAO', true],
      ]) {
        await send('Emulation.setDeviceMetricsOverride', {
          width,
          height: 1000,
          deviceScaleFactor: 1,
          mobile: false,
        })
        await send('Emulation.setEmulatedMedia', {
          media: 'screen',
          features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
        })
        await send('Page.setDocumentContent', {
          frameId,
          html: `<!doctype html><html data-theme="${theme}"><head><style>${css}</style></head><body><div id="root"></div></body></html>`,
        })
        await evaluate(code)
        await evaluate(`window.assessmentCreation.mount(${JSON.stringify(type)},${administrative})`)
        await ready(
          "document.querySelector('option[value=\"cycle-1\"]') && !document.querySelector('select').disabled",
        )
        const self = type === 'AUTOAVALIACAO'
        const suffix = type === 'GESTOR' ? 'gestor' : 'Diretoria'
        const cycleLabel = self ? 'Ciclo para autoavaliação' : `Ciclo para avaliação de ${suffix}`
        await select(cycleLabel, 'cycle-1')
        if (!self) {
          await ready(
            'document.querySelector(\'option[value="person-1"]\') && !document.querySelector(\'option[value="person-1"]\').parentElement.disabled',
          )
          await select(
            type === 'GESTOR' ? 'Colaborador autorizado' : 'Gerência autorizada',
            'person-1',
          )
        }
        await click(self ? 'Criar autoavaliação' : `Criar avaliação de ${suffix}`)
        await ready(
          "[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Voltar para a lista')",
        )
        await click('Voltar para a lista')
        await ready(
          "document.querySelector('option[value=\"cycle-2\"]') && !document.querySelector('select').disabled",
        )
        if (!self)
          await ready(
            'document.querySelector(\'option[value="person-2"]\') && !document.querySelector(\'option[value="person-2"]\').parentElement.disabled',
          )
        assert.equal(
          await evaluate(
            `!!document.querySelector('option[value="${self ? 'cycle-1' : 'person-1'}"]')`,
          ),
          false,
        )
        assert.equal(await evaluate('window.assessmentCreation.writes()'), 1)
        assert.equal(
          await evaluate(
            "[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Abrir avaliação')",
          ),
          true,
        )
        assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth + 1'), false)
        assert.equal(
          await evaluate(
            "[...document.querySelectorAll('label')].every(l=>!!document.getElementById(l.htmlFor))",
          ),
          true,
        )
        results.push({
          profile,
          type,
          width,
          theme,
          removed: true,
          existingAssessmentAccessible: true,
        })
      }
    }
  console.log(
    JSON.stringify({ case: 'Assessment creation options after returning from editor', results }),
  )
}
