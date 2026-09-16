import { createRoot } from 'react-dom/client'
import { HttpApiClient } from '../../src/api/client'
import { CycleAdministrationPanel } from '../../src/features/administration/CycleAdministrationPanel'

const versionId = '00000000-0000-0000-0000-000000000001'
const configId = '00000000-0000-0000-0000-000000000002'
const matrixId = '00000000-0000-0000-0000-000000000003'
const calls: { method: string; path: string; body?: string }[] = []
let firstRead = true
let failRead: () => void = () => {}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

// Transporte inteiramente fictício, instalado antes de montar o cliente real.
window.fetch = async (input, options = {}) => {
  const path = new URL(String(input), 'https://diagnosis.invalid').pathname
  const method = options.method ?? 'GET'
  calls.push({ method, path, body: options.body as string | undefined })
  if (path.endsWith('/auth/csrf')) return json({ token: 'fictional-browser-csrf' })
  if (path.endsWith('/questionnaire-versions/approved'))
    return json([
      {
        questionnaireVersionId: versionId,
        questionnaireCode: 'TESTE',
        questionnaireName: 'Questionário fictício',
        versionNumber: 1,
        title: 'Teste local',
        configurationOptions: [
          {
            calculationConfigurationVersionId: configId,
            calculationCode: 'MEDIA_SIMPLES_2024_1',
            calculationVersionNumber: 1,
            classificationMatrixVersionId: matrixId,
            classificationMatrixCode: 'GERAL',
            classificationMatrixVersionNumber: 1,
          },
        ],
      },
    ])
  if (method === 'GET' && path.endsWith('/evaluation-cycles')) {
    if (firstRead) {
      firstRead = false
      return new Promise<Response>((resolve) => {
        failRead = () =>
          resolve(json({ code: 'VALIDATION_FAILED', requestId: 'browser-read' }, 422))
      })
    }
    return json({ items: [], page: { limit: 100, nextCursor: null } })
  }
  if (method === 'POST' && path.endsWith('/evaluation-cycles'))
    return json(
      {
        cycleId: 'cycle-fictional',
        questionnaires: [
          { cycleQuestionnaireId: 'applied-fictional', questionnaireVersionId: versionId },
        ],
      },
      201,
    )
  throw new Error('Unexpected fixture request')
}

Object.assign(window, { cycleRecovery: { calls, failRead: () => failRead() } })
createRoot(document.getElementById('root')!).render(
  <div className="application-shell">
    <main className="workspace">
      <div className="workspace__content">
        <CycleAdministrationPanel
          api={new HttpApiClient()}
          permissions={['CICLOS.GERIR']}
          onSessionExpired={() => {
            throw new Error('Unexpected authentication')
          }}
        />
      </div>
    </main>
  </div>,
)
