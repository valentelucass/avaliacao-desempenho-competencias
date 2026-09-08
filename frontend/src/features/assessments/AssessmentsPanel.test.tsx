import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import type { ApiClient } from '../../api/client'
import { ApiError } from '../../api/client'
import type { AssessmentSummary, Page } from '../../api/contracts'
import { AssessmentsPanel } from './AssessmentsPanel'

const summary = (name: string): AssessmentSummary => ({
  id: name,
  cycle: { id: 'cycle-1', name: 'Ciclo fictício' },
  evaluated: { displayName: name },
  type: 'GESTOR',
  status: 'PUBLICADA',
  feedbackStatus: 'PENDENTE',
})
const page = (names: string[] = [], nextCursor: string | null = null): Page<AssessmentSummary> => ({
  items: names.map(summary),
  page: { limit: 2, nextCursor },
})
function setup(listAssessments = vi.fn().mockResolvedValue(page(['Registro inicial']))) {
  const onSessionExpired = vi.fn()
  const api = {
    listAssessments,
    getAssessment: vi.fn().mockResolvedValue({
      ...summary('Detalhe fictício'),
      status: 'RASCUNHO',
      feedbackStatus: 'NAO_APLICAVEL',
      questionnaire: { version: '2024.1', competencies: [] },
      answers: [],
    }),
  } as unknown as ApiClient
  const props = {
    api,
    canCreateManagerAssessment: false,
    canCreateDirectorAssessment: false,
    canCreateSelfAssessment: false,
    canSubmitSelfAssessment: false,
    canPublishAssessments: false,
    canReopenAssessments: false,
    canRecordFeedback: false,
    isAdministrativeView: false,
    canUseAdministrativeFilters: false,
    onExitEditor: vi.fn(),
    onSelectAssessment: vi.fn(),
    onSessionExpired,
  }
  const result = render(<AssessmentsPanel {...props} />)
  return { ...result, listAssessments, onSessionExpired, props }
}
const apply = () => fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
const setName = (value: string) =>
  fireEvent.change(screen.getByLabelText('Nome do Colaborador Avaliado'), { target: { value } })

describe('Filtros de avaliações autorizadas', () => {
  it('organiza o cartão da avaliação em identificação, contexto e ação', async () => {
    setup()
    const title = await screen.findByText('Registro inicial')
    const card = title.closest('li')
    expect(card).not.toBeNull()
    expect(card?.querySelector('header.assessment-list__details')).not.toBeNull()
    expect(card?.querySelector('.assessment-list__metadata')).not.toBeNull()
    expect(card?.querySelector('footer.assessment-list__actions')).not.toBeNull()
    expect(title).toHaveAttribute('title', 'Registro inicial')
    expect(
      within(card as HTMLElement).getByRole('button', { name: 'Abrir avaliação' }),
    ).toBeVisible()
  })

  it('mostra os quatro filtros sem consultar cadastros administrativos e sem violação axe', async () => {
    const { container } = setup()
    await screen.findByText('Registro inicial')
    const form = screen.getByRole('form', { name: 'Filtrar avaliações' })
    expect(within(form).getAllByRole('searchbox')).toHaveLength(2)
    expect(within(form).getAllByRole('combobox')).toHaveLength(2)
    expect(screen.getByLabelText('Nome do Gestor Responsável')).toHaveAttribute('maxLength', '160')
    expect(
      (await axe(container, { rules: { 'color-contrast': { enabled: false } } })).violations,
    ).toEqual([])
  })

  it('combina os quatro filtros somente ao aplicar, preservando a consulta no servidor', async () => {
    const { listAssessments } = setup()
    await screen.findByText('Registro inicial')
    setName('  Ana  ')
    fireEvent.change(screen.getByLabelText('Nome do Gestor Responsável'), {
      target: { value: ' José ' },
    })
    fireEvent.change(screen.getByLabelText('Status da Avaliação'), {
      target: { value: 'PUBLICADA' },
    })
    fireEvent.change(screen.getByLabelText('Status do Feedback'), { target: { value: 'PENDENTE' } })
    expect(listAssessments).toHaveBeenCalledTimes(1)
    apply()
    await waitFor(() =>
      expect(listAssessments).toHaveBeenLastCalledWith(
        expect.objectContaining({
          evaluatedName: 'Ana',
          managerName: 'José',
          status: 'PUBLICADA',
          feedbackStatus: 'PENDENTE',
          limit: 2,
          cursor: undefined,
        }),
      ),
    )
    // O resultado autorizado vem da API, não de um filtro sobre os cartões já carregados.
    expect(await screen.findByText('Registro inicial')).toBeInTheDocument()
  })

  it.each([
    ['Status da Avaliação', 'RASCUNHO', 'status'],
    ['Status da Avaliação', 'ENVIADA', 'status'],
    ['Status da Avaliação', 'PUBLICADA', 'status'],
    ['Status do Feedback', 'PENDENTE', 'feedbackStatus'],
    ['Status do Feedback', 'CONCLUIDO', 'feedbackStatus'],
    ['Status do Feedback', 'NAO_APLICAVEL', 'feedbackStatus'],
  ])('envia %s = %s sem reinterpretar estados', async (label, value, key) => {
    const { listAssessments } = setup()
    await screen.findByText('Registro inicial')
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
    apply()
    await waitFor(() =>
      expect(listAssessments).toHaveBeenLastCalledWith(expect.objectContaining({ [key]: value })),
    )
  })

  it('preserva filtros ao paginar e descarta o cursor quando a busca muda', async () => {
    const list = vi.fn().mockResolvedValue(page(['Página inicial'], 'cursor-inicial'))
    setup(list)
    await screen.findByText('Página inicial')
    setName('Ana')
    apply()
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    list.mockResolvedValueOnce(page(['Outra página'], 'cursor-seguinte'))
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
    await screen.findByText('Outra página')
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ evaluatedName: 'Ana', cursor: 'cursor-inicial' }),
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Página anterior' })).toBeEnabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Página anterior' }))
    await screen.findByText('Página inicial')
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ evaluatedName: 'Ana', cursor: undefined }),
    )
    setName('Bruna')
    apply()
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ evaluatedName: 'Bruna', cursor: undefined }),
      ),
    )
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled()
  })

  it('ignora respostas antigas quando duas buscas terminam fora de ordem', async () => {
    const list = vi.fn().mockResolvedValue(page(['Registro inicial']))
    setup(list)
    await screen.findByText('Registro inicial')
    let finishOld!: (value: Page<AssessmentSummary>) => void
    list.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve
        }),
    )
    setName('Antiga')
    apply()
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Registro inicial')).not.toBeInTheDocument()
    list.mockResolvedValueOnce(page(['Busca recente']))
    setName('Recente')
    apply()
    await screen.findByText('Busca recente')
    await act(async () => finishOld(page(['Busca obsoleta'])))
    expect(screen.getByText('Busca recente')).toBeInTheDocument()
    expect(screen.queryByText('Busca obsoleta')).not.toBeInTheDocument()
  })

  it('restaura os filtros visíveis ao voltar do editor, sem uma busca oculta', async () => {
    const { rerender, props, listAssessments } = setup()
    await screen.findByText('Registro inicial')
    setName('Ana')
    fireEvent.change(screen.getByLabelText('Nome do Gestor Responsável'), {
      target: { value: 'João' },
    })
    fireEvent.change(screen.getByLabelText('Status da Avaliação'), {
      target: { value: 'PUBLICADA' },
    })
    fireEvent.change(screen.getByLabelText('Status do Feedback'), { target: { value: 'PENDENTE' } })
    apply()
    await waitFor(() => expect(listAssessments).toHaveBeenCalledTimes(2))
    rerender(<AssessmentsPanel {...props} assessmentId="assessment-ficticia" />)
    await screen.findByRole('button', { name: 'Voltar para a lista' })
    expect(screen.queryByRole('form', { name: 'Filtrar avaliações' })).not.toBeInTheDocument()
    rerender(<AssessmentsPanel {...props} />)
    expect(screen.getByLabelText('Nome do Colaborador Avaliado')).toHaveValue('Ana')
    expect(screen.getByLabelText('Nome do Gestor Responsável')).toHaveValue('João')
    expect(screen.getByLabelText('Status da Avaliação')).toHaveValue('PUBLICADA')
    expect(screen.getByLabelText('Status do Feedback')).toHaveValue('PENDENTE')
  })

  it('limpa os quatro filtros e recupera resultados após busca vazia', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce(page(['Registro inicial']))
      .mockResolvedValueOnce(page())
      .mockResolvedValue(page(['Lista restaurada']))
    setup(list)
    await screen.findByText('Registro inicial')
    setName('Ausente')
    apply()
    await screen.findByText('Nenhuma avaliação encontrada')
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    await screen.findByText('Lista restaurada')
    expect(screen.getByLabelText('Nome do Colaborador Avaliado')).toHaveValue('')
    expect(list).toHaveBeenLastCalledWith({
      limit: 2,
      cursor: undefined,
      cycleId: undefined,
      collaboratorId: undefined,
    })
  })

  it('trata falha de sessão da busca atual', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce(page(['Registro inicial']))
      .mockRejectedValue(new ApiError({ status: 401, code: 'AUTHENTICATION_REQUIRED' }))
    const { onSessionExpired } = setup(list)
    await screen.findByText('Registro inicial')
    setName('Ana')
    apply()
    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Registro inicial')).not.toBeInTheDocument()
  })

  it('limita a página a duas linhas conforme a grade de três colunas', async () => {
    const mediaQuery = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: query === '(min-width: 80rem)',
          media: query,
          onchange: null,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent: () => true,
        }) as MediaQueryList,
    )
    try {
      const listAssessments = vi.fn().mockResolvedValue(page(['Registro em tela larga']))
      setup(listAssessments)
      await screen.findByText('Registro em tela larga')
      expect(listAssessments).toHaveBeenLastCalledWith(
        expect.objectContaining({ limit: 6, cursor: undefined }),
      )
    } finally {
      mediaQuery.mockRestore()
    }
  })
})
