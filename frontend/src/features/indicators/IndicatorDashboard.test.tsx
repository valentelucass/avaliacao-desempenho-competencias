import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../api/client'
import type { EvaluationCycle, IndicatorDashboard as Dashboard } from '../../api/contracts'
import { IndicatorDashboard } from './IndicatorDashboard'

const cycle: EvaluationCycle = { id: 'ciclo', name: 'Ciclo de teste', status: 'ABERTO' }
const dashboard: Dashboard = {
  metrics: {
    collaborators: 60,
    assessments: 45,
    managers: 9,
    managerSelfAssessments: 6,
    averagePercent: 92.4,
    finalizedPercent: 96.3,
    feedbackPercent: 94.2,
  },
  comparison: {
    current: { firstDay: '2026-11-01', lastDay: '2026-11-26' },
    previous: { firstDay: '2026-10-01', lastDay: '2026-10-26' },
    changes: {
      collaborators: 1,
      assessments: -2.1,
      managers: 0,
      managerSelfAssessments: null,
      averagePercent: 0.5,
      finalizedPercent: -0.7,
      feedbackPercent: null,
    },
  },
  byBranch: [],
  byArea: [],
  byItem: [],
  areaSummary: [
    {
      label: 'Operações',
      collaborators: 20,
      assessments: 17,
      averagePercent: 93.1,
      finalizedPercent: 90,
      feedbackPercent: null,
    },
  ],
  evolution: [
    { weekStart: '2026-11-02', averagePercent: 89.5 },
    { weekStart: '2026-11-09', averagePercent: 92.4 },
    { weekStart: '2026-11-23', averagePercent: 93.1 },
  ],
}

describe('IndicatorDashboard', () => {
  it('shows the monthly directions, percentage points, and unavailable comparisons', async () => {
    const api = {
      getIndicatorDashboard: vi.fn().mockResolvedValue(dashboard),
    } as unknown as ApiClient
    render(
      <IndicatorDashboard
        api={api}
        cycles={[cycle]}
        refreshRevision={0}
        onSessionExpired={vi.fn()}
      />,
    )

    const rise = await screen.findByText('1,0%')
    expect(rise).toHaveAttribute('data-direction', 'up')
    expect(screen.getByText(/2,1%$/)).toHaveAttribute('data-direction', 'down')
    expect(screen.getByText('0,0%')).toHaveAttribute('data-direction', 'flat')
    expect(screen.getByText('0,5 p.p.')).toHaveAttribute('data-direction', 'up')
    expect(screen.getByText('-0,7 p.p.')).toHaveAttribute('data-direction', 'down')
    expect(screen.getAllByText('Sem base para comparar')).toHaveLength(2)
    expect(screen.getAllByText('vs. mês anterior')).toHaveLength(5)
  })

  it('shows the area total and leaves a gap for weeks without a published average', async () => {
    const api = {
      getIndicatorDashboard: vi.fn().mockResolvedValue(dashboard),
    } as unknown as ApiClient
    const { container } = render(
      <IndicatorDashboard
        api={api}
        cycles={[cycle]}
        refreshRevision={0}
        onSessionExpired={vi.fn()}
      />,
    )
    const summary = await screen.findByRole('table', { name: 'Resumo por área' })
    expect(within(summary).getByRole('row', { name: /Operações/ })).toHaveTextContent('93,1%')
    expect(within(summary).getByRole('row', { name: /Operações/ })).toHaveTextContent('—')
    expect(within(summary).getByRole('row', { name: /Total do ciclo/ })).toHaveTextContent('94,2%')

    const chart = screen.getByRole('figure', { name: 'Evolução da média geral' })
    expect(within(chart).getByText('Sem média disponível na semana')).toBeInTheDocument()
    const path = container.querySelector('.indicator-trend__plot path')?.getAttribute('d') ?? ''
    expect(path.match(/M/g)).toHaveLength(2)
    expect(path.match(/L/g)).toHaveLength(1)
    const open = screen.getByRole('button', { name: 'Ver médias por semana' })
    open.focus()
    fireEvent.click(open)
    const dialog = screen.getByRole('dialog', { name: 'Médias por semana' })
    expect(within(dialog).getByRole('row', { name: /23 de novembro/ })).toHaveTextContent('93,1%')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(dialog).not.toBeInTheDocument()
    expect(open).toHaveFocus()
  })
})
