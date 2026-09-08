import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../api/client'
import type { AssessmentDetail } from '../../api/contracts'
import { AssessmentEditor } from './AssessmentEditor'

const deniedActions = {
  edit: false,
  submit: false,
  publish: false,
  reopen: false,
  completeFeedback: false,
}
const sample: AssessmentDetail = {
  id: 'foreign-assessment',
  cycle: { id: 'cycle', name: 'Ciclo fictício' },
  evaluated: { displayName: 'Pessoa fictícia' },
  type: 'GESTOR',
  status: 'RASCUNHO',
  feedbackStatus: 'NAO_APLICAVEL',
  allowedActions: deniedActions,
  answers: [],
  questionnaire: {
    version: 'test',
    competencies: [
      {
        id: 'competency',
        name: 'Equipe',
        questions: [
          {
            id: 'question',
            text: 'Colabora?',
            required: true,
            options: [{ id: 'option', label: 'Dentro das expectativas', points: 100 }],
          },
        ],
      },
    ],
  },
}

function renderRh(detail: AssessmentDetail) {
  const api = {
    getAssessment: vi.fn().mockResolvedValue(detail),
    saveAssessment: vi.fn(),
    submitAssessment: vi.fn(),
    completeAssessmentFeedback: vi.fn(),
  }
  render(
    <AssessmentEditor
      api={api as unknown as ApiClient}
      assessmentId={detail.id}
      canEditManagerAssessment
      canEditSelfAssessment
      canSubmitSelfAssessment
      canPublish
      canReopen
      canEditDirectorAssessment={false}
      canRecordFeedback
      onBack={vi.fn()}
      onChanged={vi.fn()}
      onSessionExpired={vi.fn()}
    />,
  )
  return api
}

describe('ações individuais da avaliação', () => {
  it.each(['GESTOR', 'AUTOAVALIACAO'])(
    'RH não edita nem envia %s de outro autor apesar de possuir as jornadas',
    async (type) => {
      const api = renderRh({ ...sample, type })
      const answer = await screen.findByRole('radio')
      expect(answer).toBeDisabled()
      ;(answer as HTMLInputElement).click()
      expect(answer).not.toBeChecked()
      expect(screen.queryByRole('button', { name: 'Salvar rascunho' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Enviar avaliação' })).not.toBeInTheDocument()
      expect(api.saveAssessment).not.toHaveBeenCalled()
      expect(api.submitAssessment).not.toHaveBeenCalled()
    },
  )

  it('RH pode preencher o próprio rascunho quando o servidor autoriza o recurso', async () => {
    renderRh({ ...sample, allowedActions: { ...deniedActions, edit: true, submit: true } })
    expect(await screen.findByRole('radio')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Enviar avaliação' })).toBeEnabled()
  })

  it('mantém a consulta se uma API antiga não informa ações individuais', async () => {
    renderRh({ ...sample, allowedActions: undefined })
    expect(await screen.findByRole('radio')).toBeDisabled()
  })

  it('RH reabre, mas não registra feedback em nome do avaliador original', async () => {
    renderRh({
      ...sample,
      status: 'PUBLICADA',
      feedbackStatus: 'PENDENTE',
      allowedActions: { ...deniedActions, reopen: true },
    })
    expect(await screen.findByRole('radio')).toBeDisabled()
    expect(screen.getByLabelText('Motivo da reabertura')).toBeInTheDocument()
    expect(document.querySelector('input[type="date"]')).not.toBeInTheDocument()
  })
})
