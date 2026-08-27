import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AssessmentDetail } from '../../api/contracts'
import { IndividualAssessmentSummary } from './IndividualAssessmentSummary'

describe('IndividualAssessmentSummary', () => {
  it('exibe o gráfico e a tabela textual apenas para uma avaliação completa', () => {
    render(<IndividualAssessmentSummary assessment={sampleAssessment()} />)

    expect(screen.getByRole('img', { name: /Pontuação por competência/ })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Resultado por competência' })).toBeInTheDocument()
    expect(screen.getByText('Preza pela segurança')).toBeInTheDocument()
    expect(screen.getByText('Comentário seguro')).toBeInTheDocument()
    expect(screen.getByText('Plano de desenvolvimento')).toBeInTheDocument()
  })

  it('não expõe resumo individual em rascunho', () => {
    render(
      <IndividualAssessmentSummary
        assessment={{ ...sampleAssessment(), status: 'RASCUNHO', result: undefined }}
      />,
    )

    expect(screen.queryByRole('img', { name: /Pontuação por competência/ })).not.toBeInTheDocument()
  })
})

function sampleAssessment(): AssessmentDetail {
  return {
    id: 'assessment-1',
    cycle: { id: 'cycle-1', name: 'Ciclo 2026' },
    evaluated: { displayName: 'Pessoa avaliada' },
    type: 'GESTOR',
    status: 'PUBLICADA',
    questionnaire: { version: '2024.1', competencies: [] },
    answers: [],
    comment: 'Comentário seguro',
    actionPlan: 'Plano de desenvolvimento',
    result: {
      finalScore: 100,
      classification: { label: 'Dentro das expectativas' },
    },
    competencyScores: [{ id: 'competency-1', name: 'Preza pela segurança', score: 100 }],
  }
}
