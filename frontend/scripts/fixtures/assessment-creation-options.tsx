import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { ApiClient } from '../../src/api/client'
import type { AssessmentCreationType, AssessmentDetail } from '../../src/api/contracts'
import { AssessmentsPanel } from '../../src/features/assessments/AssessmentsPanel'

const cycles = [
  { id: 'cycle-1', name: 'Ciclo atual fictício' },
  { id: 'cycle-2', name: 'Outro ciclo fictício' },
]
const people = [
  { id: 'person-1', displayName: 'Pessoa fictícia A' },
  { id: 'person-2', displayName: 'Pessoa fictícia B' },
]
let started: AssessmentDetail | undefined
let writes = 0
const api = {
  listAssessments: async ({ limit }: { limit: number }) => ({
    items: started ? [started] : [],
    page: { limit, nextCursor: null },
  }),
  listAssessmentCreationCycleOptions: async (type: AssessmentCreationType) =>
    started?.type === type && type === 'AUTOAVALIACAO' ? [cycles[1]] : cycles,
  listManagerAssessmentCreationOptions: async () => (started ? [people[1]] : people),
  listDirectorAssessmentCreationOptions: async () => (started ? [people[1]] : people),
  createAssessment: async ({ type }: { type: AssessmentCreationType }) => {
    writes += 1
    started = {
      id: 'assessment-1',
      cycle: cycles[0],
      evaluated: { displayName: people[0].displayName },
      type,
      status: 'RASCUNHO',
      feedbackStatus: 'NAO_APLICAVEL',
      questionnaire: { version: '2024.1', competencies: [] },
      answers: [],
    } as AssessmentDetail
    return started
  },
  getAssessment: async () => started,
} as unknown as ApiClient

export function Fixture({
  type,
  administrative,
}: {
  type: AssessmentCreationType
  administrative: boolean
}) {
  const [assessmentId, setAssessmentId] = useState<string>()
  return (
    <main className="application-shell">
      <AssessmentsPanel
        api={api}
        canCreateManagerAssessment={type === 'GESTOR'}
        canCreateDirectorAssessment={type === 'DIRETORIA_GERENCIA'}
        canCreateSelfAssessment={type === 'AUTOAVALIACAO'}
        canSubmitSelfAssessment={type === 'AUTOAVALIACAO'}
        canPublishAssessments={administrative}
        canReopenAssessments={administrative}
        canRecordFeedback={false}
        isAdministrativeView={administrative}
        canUseAdministrativeFilters={false}
        assessmentId={assessmentId}
        onExitEditor={() => setAssessmentId(undefined)}
        onSelectAssessment={setAssessmentId}
        onSessionExpired={() => {
          throw new Error('Sessão fictícia inesperadamente expirada')
        }}
      />
    </main>
  )
}

const root = createRoot(document.getElementById('root')!)
Object.assign(window, {
  assessmentCreation: {
    mount(type: AssessmentCreationType, administrative: boolean) {
      started = undefined
      writes = 0
      root.render(
        <Fixture key={`${type}-${administrative}`} type={type} administrative={administrative} />,
      )
    },
    writes: () => writes,
  },
})
