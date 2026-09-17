import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../api/client'
import type { AssessmentCreationType, ManagerAssessmentCreationOption } from '../../api/contracts'
import { AssessmentsPanel } from './AssessmentsPanel'

const cycles = [
  { id: 'cycle-1', name: 'Ciclo atual fictício' },
  { id: 'cycle-2', name: 'Outro ciclo fictício' },
]
const people = [
  { id: 'person-1', displayName: 'Pessoa fictícia A' },
  { id: 'person-2', displayName: 'Pessoa fictícia B' },
]
const scenarios = [
  { profile: 'Gestor', type: 'GESTOR', administrative: false },
  { profile: 'RH', type: 'GESTOR', administrative: true },
  { profile: 'Diretoria', type: 'DIRETORIA_GERENCIA', administrative: true },
] as const

function setup(type: AssessmentCreationType, administrative = false) {
  const detail = {
    id: 'assessment-1',
    cycle: cycles[0],
    evaluated: { displayName: people[0].displayName },
    type,
    status: 'RASCUNHO',
    feedbackStatus: 'NAO_APLICAVEL',
    questionnaire: { version: '2024.1', competencies: [] },
    answers: [],
  }
  const creationCycles = vi.fn().mockResolvedValue(cycles)
  const options = vi.fn().mockResolvedValue(people)
  const listAssessments = vi.fn().mockResolvedValue({
    items: [],
    page: { limit: 2, nextCursor: null },
  })
  const createAssessment = vi.fn().mockImplementation(async () => {
    options.mockResolvedValue([people[1]])
    if (type === 'AUTOAVALIACAO') creationCycles.mockResolvedValue([cycles[1]])
    listAssessments.mockResolvedValue({
      items: [detail],
      page: { limit: 2, nextCursor: null },
    })
    return detail
  })
  const props = {
    api: {
      listAssessments,
      listAssessmentCreationCycleOptions: creationCycles,
      listManagerAssessmentCreationOptions: options,
      listDirectorAssessmentCreationOptions: options,
      createAssessment,
      getAssessment: vi.fn().mockResolvedValue(detail),
    } as unknown as ApiClient,
    canCreateManagerAssessment: type === 'GESTOR',
    canCreateDirectorAssessment: type === 'DIRETORIA_GERENCIA',
    canCreateSelfAssessment: type === 'AUTOAVALIACAO',
    canSubmitSelfAssessment: type === 'AUTOAVALIACAO',
    canPublishAssessments: administrative,
    canReopenAssessments: administrative,
    canRecordFeedback: false,
    isAdministrativeView: administrative,
    canUseAdministrativeFilters: false,
    onExitEditor: vi.fn(),
    onSelectAssessment: vi.fn(),
    onSessionExpired: vi.fn(),
  }
  const cycleLabel =
    type === 'AUTOAVALIACAO'
      ? 'Ciclo para autoavaliação'
      : `Ciclo para avaliação de ${type === 'GESTOR' ? 'gestor' : 'Diretoria'}`
  const personLabel = type === 'GESTOR' ? 'Colaborador autorizado' : 'Gerência autorizada'
  const buttonLabel =
    type === 'AUTOAVALIACAO'
      ? 'Criar autoavaliação'
      : `Criar avaliação de ${type === 'GESTOR' ? 'gestor' : 'Diretoria'}`
  const rendered = render(<AssessmentsPanel {...props} />)
  async function selectPerson() {
    fireEvent.change(await screen.findByLabelText(cycleLabel), { target: { value: 'cycle-1' } })
    if (type !== 'AUTOAVALIACAO') {
      await screen.findByRole('option', { name: people[0].displayName })
      fireEvent.change(screen.getByLabelText(personLabel), { target: { value: 'person-1' } })
    }
  }
  return {
    ...rendered,
    props,
    options,
    creationCycles,
    createAssessment,
    listAssessments,
    cycleLabel,
    personLabel,
    buttonLabel,
    selectPerson,
  }
}

describe('Opções para iniciar avaliações', () => {
  it.each(scenarios)(
    '$profile: retira o rascunho criado das opções e mantém sua consulta ao voltar do editor',
    async ({ type, administrative }) => {
      const test = setup(type, administrative)
      await test.selectPerson()
      fireEvent.click(screen.getByRole('button', { name: test.buttonLabel }))
      await waitFor(() =>
        expect(test.props.onSelectAssessment).toHaveBeenCalledWith('assessment-1'),
      )
      await waitFor(() => expect(screen.getByLabelText(test.personLabel)).toBeEnabled())
      expect(screen.queryByRole('option', { name: people[0].displayName })).toBeNull()
      test.rerender(<AssessmentsPanel {...test.props} assessmentId="assessment-1" />)
      await screen.findByRole('button', { name: 'Voltar para a lista' })
      test.rerender(<AssessmentsPanel {...test.props} />)
      await waitFor(() => expect(screen.getByLabelText(test.personLabel)).toBeEnabled())
      const select = screen.getByLabelText(test.personLabel)
      expect(within(select).queryByRole('option', { name: people[0].displayName })).toBeNull()
      expect(
        within(select).getByRole('option', { name: people[1].displayName }),
      ).toBeInTheDocument()
      expect(select).toHaveValue('')
      expect(screen.getByLabelText(test.cycleLabel)).toHaveValue('cycle-1')
      expect(screen.getByRole('button', { name: test.buttonLabel })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Abrir avaliação' })).toBeInTheDocument()
      expect(test.createAssessment).toHaveBeenCalledExactlyOnceWith({
        type,
        cycleId: 'cycle-1',
        collaboratorId: 'person-1',
      })
    },
  )

  it.each(['Gestor', 'RH', 'Diretoria'])(
    '%s: retira o ciclo da autoavaliação iniciada e mantém outro ciclo disponível',
    async (profile) => {
      const test = setup('AUTOAVALIACAO', profile !== 'Gestor')
      await test.selectPerson()
      fireEvent.click(screen.getByRole('button', { name: test.buttonLabel }))
      await waitFor(() =>
        expect(test.props.onSelectAssessment).toHaveBeenCalledWith('assessment-1'),
      )
      test.rerender(<AssessmentsPanel {...test.props} assessmentId="assessment-1" />)
      await screen.findByRole('button', { name: 'Voltar para a lista' })
      test.rerender(<AssessmentsPanel {...test.props} />)
      await waitFor(() => expect(screen.getByLabelText(test.cycleLabel)).toBeEnabled())
      const select = screen.getByLabelText(test.cycleLabel)
      expect(within(select).queryByRole('option', { name: cycles[0].name })).toBeNull()
      expect(within(select).getByRole('option', { name: cycles[1].name })).toBeInTheDocument()
      expect(select).toHaveValue('')
      expect(test.creationCycles).toHaveBeenLastCalledWith('AUTOAVALIACAO')
    },
  )

  it.each(scenarios)(
    '$profile: Atualizar consulta novamente as pessoas e os ciclos',
    async ({ type, administrative }) => {
      const test = setup(type, administrative)
      await test.selectPerson()
      test.options.mockResolvedValue([people[1]])
      fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
      await waitFor(() => expect(test.options).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(screen.getByLabelText(test.personLabel)).toBeEnabled())
      expect(screen.queryByRole('option', { name: people[0].displayName })).toBeNull()
      expect(screen.getByLabelText(test.personLabel)).toHaveValue('')
      expect(test.creationCycles).toHaveBeenCalledTimes(2)
      expect(test.createAssessment).not.toHaveBeenCalled()
    },
  )

  it('limpa o ciclo esgotado e impede sua reutilização quando ele volta a ficar disponível', async () => {
    const test = setup('GESTOR')
    await test.selectPerson()
    test.creationCycles.mockResolvedValue([cycles[1]])
    let finishOld!: (value: readonly ManagerAssessmentCreationOption[]) => void
    test.options.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve
        }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
    await waitFor(() => expect(screen.queryByRole('option', { name: cycles[0].name })).toBeNull())
    expect(screen.getByLabelText(test.cycleLabel)).toHaveValue('')
    expect(screen.getByLabelText(test.personLabel)).toBeDisabled()
    await waitFor(() =>
      expect(screen.queryByText('Carregando colaboradores autorizados…')).toBeNull(),
    )
    await act(async () => finishOld(people))
    expect(screen.queryByRole('option', { name: people[0].displayName })).toBeNull()
    test.creationCycles.mockResolvedValue(cycles)
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
    await screen.findByRole('option', { name: cycles[0].name })
    expect(screen.getByLabelText(test.cycleLabel)).toHaveValue('')
  })

  it('não mantém opções antigas quando a atualização falha e permite tentar novamente', async () => {
    const test = setup('DIRETORIA_GERENCIA', true)
    await test.selectPerson()
    test.options.mockRejectedValueOnce(new ApiError({ status: 503, code: 'UNAVAILABLE' }))
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
    await screen.findByRole('alert')
    expect(screen.queryByRole('option', { name: people[0].displayName })).toBeNull()
    expect(screen.getByRole('button', { name: test.buttonLabel })).toBeDisabled()
    test.options.mockResolvedValue([people[1]])
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
    await screen.findByRole('option', { name: people[1].displayName })
  })

  it('descarta resposta anterior ao editor e recarrega as opções ao retornar', async () => {
    const test = setup('GESTOR')
    await test.selectPerson()
    let finishOld!: (value: readonly ManagerAssessmentCreationOption[]) => void
    test.options.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve
        }),
    )
    fireEvent.change(screen.getByLabelText(test.cycleLabel), { target: { value: 'cycle-2' } })
    await waitFor(() => expect(test.options).toHaveBeenCalledTimes(2))
    test.rerender(<AssessmentsPanel {...test.props} assessmentId="assessment-1" />)
    await screen.findByRole('button', { name: 'Voltar para a lista' })
    test.options.mockResolvedValue([people[1]])
    test.rerender(<AssessmentsPanel {...test.props} />)
    await waitFor(() => expect(test.options).toHaveBeenCalledTimes(3))
    await act(async () => finishOld(people))
    expect(screen.queryByRole('option', { name: people[0].displayName })).toBeNull()
    expect(screen.getByRole('option', { name: people[1].displayName })).toBeInTheDocument()
  })

  it('mantém a pessoa disponível se a criação falhar', async () => {
    const test = setup('GESTOR')
    await test.selectPerson()
    test.createAssessment.mockRejectedValueOnce(new ApiError({ status: 503, code: 'UNAVAILABLE' }))
    fireEvent.click(screen.getByRole('button', { name: test.buttonLabel }))
    await screen.findByRole('alert')
    expect(screen.getByRole('option', { name: people[0].displayName })).toBeInTheDocument()
    expect(test.props.onSelectAssessment).not.toHaveBeenCalled()
  })

  it.each(scenarios)(
    '$profile: mostra falha ao atualizar ciclos e permite recuperação',
    async ({ type, administrative }) => {
      const test = setup(type, administrative)
      await test.selectPerson()
      test.creationCycles.mockRejectedValueOnce(new ApiError({ status: 503, code: 'UNAVAILABLE' }))
      fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Não foi possível carregar os ciclos para iniciar avaliações',
      )
      expect(screen.queryByRole('option', { name: cycles[0].name })).toBeNull()
      expect(screen.queryByText(/Não há ciclos disponíveis/)).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
      await screen.findByRole('option', { name: cycles[0].name })
      expect(screen.queryByRole('alert')).toBeNull()
    },
  )
})
