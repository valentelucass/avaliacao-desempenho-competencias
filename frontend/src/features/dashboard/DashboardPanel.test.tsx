import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DashboardPanel } from './DashboardPanel'

describe('DashboardPanel', () => {
  it('oferece ajuda contextual no cartão de jornada e no cartão de dados protegidos', () => {
    render(
      <DashboardPanel canCreateAssessment canCreateSelfAssessment onOpenAssessments={vi.fn()} />,
    )

    const journeyHelp = screen.getByRole('button', { name: 'Ajuda sobre Como escolher a jornada' })
    expect(
      screen.getByRole('button', {
        name: 'Ajuda sobre Como a plataforma protege este registro',
      }),
    ).toBeInTheDocument()

    fireEvent.click(journeyHelp)

    expect(screen.getByRole('tooltip')).toHaveTextContent('Avaliação de equipe')
  })

  it('aplica a composição própria para duas colunas no estado sem jornadas', () => {
    const { container } = render(
      <DashboardPanel
        canCreateAssessment={false}
        canCreateSelfAssessment={false}
        onOpenAssessments={vi.fn()}
      />,
    )

    expect(container.querySelector('.dashboard-hero--empty')).toHaveTextContent(
      'Nenhuma jornada disponível',
    )
  })
})
