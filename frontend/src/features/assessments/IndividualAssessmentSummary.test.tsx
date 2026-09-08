import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AssessmentDetail } from '../../api/contracts'
import { IndividualAssessmentSummary } from './IndividualAssessmentSummary'

describe('IndividualAssessmentSummary', () => {
  it('exibe o gráfico e a tabela textual apenas para uma avaliação completa', () => {
    render(<IndividualAssessmentSummary assessment={sampleAssessment()} />)

    expect(screen.getByRole('img', { name: /Pontuação por competência/ })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Resultado por competência' })).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader', { name: 'Competência' })).toHaveLength(2)
    expect(screen.getAllByRole('columnheader', { name: 'Pontuação' })).toHaveLength(2)
    expect(screen.getAllByText('Preza pela segurança')).toHaveLength(2)
    expect(screen.getAllByText('Qualidade do trabalho')).toHaveLength(2)
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

  it('prepara a relação completa de notas abaixo do gráfico para impressão', () => {
    render(<IndividualAssessmentSummary assessment={sampleAssessment()} displayMode="chart" />)

    expect(screen.getByRole('heading', { name: 'Gráfico da avaliação' })).toBeInTheDocument()
    expect(screen.getByText('Nota final')).toBeInTheDocument()
    expect(screen.getByText('Dentro das expectativas')).toBeInTheDocument()
    expect(screen.getByText('80')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Notas por competência' })).toBeInTheDocument()
    const printedScores = screen.getByRole('list', { name: 'Notas por competência' })
    expect(within(printedScores).getAllByRole('listitem')).toHaveLength(2)
    expect(within(printedScores).getByText('100,0')).toBeInTheDocument()
    expect(within(printedScores).getByText('110,0')).toBeInTheDocument()
    expect(screen.queryByText('Comentário seguro')).not.toBeInTheDocument()
    expect(screen.queryByText('Plano de desenvolvimento')).not.toBeInTheDocument()
  })
})

function sampleAssessment(): AssessmentDetail {
  return {
    id: 'assessment-1',
    cycle: { id: 'cycle-1', name: 'Ciclo 2026' },
    evaluated: { displayName: 'Pessoa avaliada' },
    type: 'GESTOR',
    status: 'PUBLICADA',
    feedbackStatus: 'PENDENTE',
    questionnaire: { version: '2024.1', competencies: [] },
    answers: [],
    comment: 'Comentário seguro',
    actionPlan: 'Plano de desenvolvimento',
    result: {
      finalScore: 100,
      classification: { label: 'Dentro das expectativas' },
    },
    competencyScores: [
      { id: 'competency-1', name: 'Preza pela segurança', score: 100 },
      { id: 'competency-2', name: 'Qualidade do trabalho', score: 110 },
    ],
  }
}
