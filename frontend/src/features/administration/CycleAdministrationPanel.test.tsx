import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../api/client'
import { ApiError } from '../../api/client'
import type {
  ApprovedQuestionnaireVersion,
  AppliedCycleQuestionnaire,
  DraftCycleConfiguration,
  EvaluationCycle,
} from '../../api/contracts'
import { CycleAdministrationPanel } from './CycleAdministrationPanel'

describe('CycleAdministrationPanel', () => {
  it('cria o ciclo com as datas e a autoavaliação informadas pelo gestor', async () => {
    const api = createApi({
      createEvaluationCycle: vi.fn().mockResolvedValue({
        cycleId: 'cycle-created',
        questionnaires: [
          {
            cycleQuestionnaireId: 'cycle-questionnaire-created',
            questionnaireVersionId: 'questionnaire-version-1',
          },
        ],
      }),
    })

    render(
      <CycleAdministrationPanel
        api={api}
        permissions={['CICLOS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    await screen.findByRole('checkbox', {
      name: 'MEDIA_SIMPLES_2024_1 v1 · GERAL v1',
    })
    fireEvent.change(screen.getByLabelText('Código do ciclo'), { target: { value: '2026' } })
    fireEvent.change(screen.getByLabelText('Nome do ciclo'), {
      target: { value: 'Avaliação de Desempenho 2026' },
    })
    fireEvent.change(screen.getByLabelText('Abertura'), {
      target: { value: '2026-09-16T14:00' },
    })
    fireEvent.change(screen.getByLabelText('Encerramento'), {
      target: { value: '2026-10-16T23:59' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'MEDIA_SIMPLES_2024_1 v1 · GERAL v1' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Permitir autoavaliação neste ciclo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Criar ciclo' }))

    await waitFor(() =>
      expect(api.createEvaluationCycle).toHaveBeenCalledWith({
        code: '2026',
        configuration: {
          name: 'Avaliação de Desempenho 2026',
          openingAtLocal: '2026-09-16T14:00',
          closingAtLocal: '2026-10-16T23:59',
          timeZone: 'America/Sao_Paulo',
          selfAssessmentEnabled: true,
          questionnaires: [
            {
              questionnaireVersionId: 'questionnaire-version-1',
              calculationConfigurationVersionId: 'calculation-version-1',
              classificationMatrixVersionId: 'matrix-version-1',
            },
          ],
        },
      }),
    )
    expect(
      await screen.findByText('Ciclo criado como rascunho. Revise-o antes de abrir.'),
    ).toBeInTheDocument()
  })

  it('carrega e atualiza a configuração de um ciclo em rascunho', async () => {
    const cycle = sampleCycle()
    const api = createApi({
      listAllCycles: vi.fn().mockResolvedValue([cycle]),
      getEvaluationCycleAdministrationDraft: vi.fn().mockResolvedValue(sampleDraft()),
    })

    render(
      <CycleAdministrationPanel
        api={api}
        permissions={['CICLOS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Configurar' }))
    await screen.findByText('O rascunho selecionado contém 1 questionário(s) aplicado(s).')
    fireEvent.change(screen.getByLabelText('Nome do ciclo'), {
      target: { value: 'Ciclo de avaliação revisado' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar configuração' }))

    await waitFor(() =>
      expect(api.replaceEvaluationCycle).toHaveBeenCalledWith('cycle-draft-1', {
        configuration: {
          name: 'Ciclo de avaliação revisado',
          openingAtLocal: '2026-09-01T00:00',
          closingAtLocal: '2026-09-16T00:00',
          timeZone: 'America/Sao_Paulo',
          selfAssessmentEnabled: true,
          questionnaires: [
            {
              questionnaireVersionId: 'questionnaire-version-1',
              calculationConfigurationVersionId: 'calculation-version-1',
              classificationMatrixVersionId: 'matrix-version-1',
            },
          ],
        },
      }),
    )
  })

  it.each([
    ['Nome do ciclo', 'name', 'Ciclo de avaliação revisado'],
    ['Fuso horário', 'timeZone', 'America/Manaus'],
    ['Abertura', 'openingAtLocal', '2026-09-02T08:00'],
    ['Encerramento', 'closingAtLocal', '2026-11-01T18:00'],
    ['Permitir autoavaliação neste ciclo', 'selfAssessmentEnabled', false],
  ] as const)(
    'preserva %s se o DOM for restaurado antes de processar o estado pendente',
    async (label, field, value) => {
      vi.useFakeTimers()
      const api = createApi({ listAllCycles: vi.fn().mockResolvedValue([sampleCycle()]) })

      try {
        await act(async () => {
          render(
            // Restaura o DOM ainda no evento, antes de React processar o updater.
            <div onChange={(event) => (event.target as HTMLInputElement).form?.reset()}>
              <CycleAdministrationPanel
                api={api}
                permissions={['CICLOS.GERIR']}
                onSessionExpired={vi.fn()}
              />
            </div>,
          )
        })
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: 'Configurar' }))
        })

        const input = screen.getByLabelText(label)
        act(() => {
          // O destaque e a edição ficam no mesmo lote, antes do próximo render.
          vi.advanceTimersByTime(380)
          if (typeof value === 'boolean') {
            fireEvent.click(input)
          } else {
            fireEvent.change(input, { target: { value } })
          }
        })

        if (typeof value === 'boolean') {
          expect(input).not.toBeChecked()
        } else {
          expect(input).toHaveValue(value)
        }
        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: 'Salvar configuração' }))
        })
        if (field === 'timeZone') {
          expect(api.replaceEvaluationCycle).not.toHaveBeenCalled()
          expect(screen.getByRole('alert')).toBeInTheDocument()
        } else {
          expect(api.replaceEvaluationCycle).toHaveBeenCalledWith('cycle-draft-1', {
            configuration: expect.objectContaining({ [field]: value }),
          })
        }
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it.each(['2026-09-16T14:00', '2026-09-15T23:59'])(
    'impede encerramento %s igual ou anterior à abertura sem chamar a API',
    async (closing) => {
      const api = createApi()
      render(
        <CycleAdministrationPanel
          api={api}
          permissions={['CICLOS.GERIR']}
          onSessionExpired={vi.fn()}
        />,
      )
      await screen.findByRole('checkbox', { name: 'MEDIA_SIMPLES_2024_1 v1 · GERAL v1' })
      fireEvent.change(screen.getByLabelText('Código do ciclo'), { target: { value: '2026' } })
      fireEvent.change(screen.getByLabelText('Nome do ciclo'), {
        target: { value: 'Ciclo fictício' },
      })
      fireEvent.change(screen.getByLabelText('Abertura'), { target: { value: '2026-09-16T14:00' } })
      fireEvent.change(screen.getByLabelText('Encerramento'), { target: { value: closing } })
      fireEvent.click(screen.getByRole('checkbox', { name: 'MEDIA_SIMPLES_2024_1 v1 · GERAL v1' }))
      fireEvent.click(screen.getByRole('button', { name: 'Criar ciclo' }))
      expect(screen.getByRole('alert')).toHaveTextContent(
        'O encerramento deve ocorrer depois da abertura.',
      )
      expect(api.createEvaluationCycle).not.toHaveBeenCalled()
    },
  )

  it('leva até o painel em linha ao consultar, configurar ou iniciar um ciclo', async () => {
    const scrollIntoView = vi.fn()
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    const draftCycle = sampleCycle()
    const openCycle = sampleCycle({ id: 'cycle-open-1', name: 'Ciclo aberto', status: 'ABERTO' })
    const api = createApi({
      listAllCycles: vi.fn().mockResolvedValue([draftCycle, openCycle]),
      getEvaluationCycleAdministrationDraft: vi.fn().mockResolvedValue(sampleDraft()),
    })

    try {
      render(
        <CycleAdministrationPanel
          api={api}
          permissions={['CICLOS.GERIR']}
          onSessionExpired={vi.fn()}
        />,
      )

      fireEvent.click(await screen.findByRole('button', { name: 'Configurar' }))
      const configurationPanel = await screen.findByRole('form', {
        name: 'Configuração: Ciclo de avaliação 2026.2',
      })
      await waitFor(() =>
        expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' }),
      )
      expect(configurationPanel).toHaveFocus()
      await waitFor(() => expect(configurationPanel).toHaveClass('inline-panel-focus--highlighted'))
      expect(screen.getByLabelText('Código do ciclo').closest('.field')).toHaveClass(
        'field--inline-reveal',
      )
      expect(screen.getByLabelText('Nome do ciclo').closest('.field')).toHaveClass(
        'field--inline-reveal',
      )
      expect(screen.getByRole('group', { name: 'Questionários aplicados' })).toHaveClass(
        'fieldset--inline-reveal',
      )
      expect(document.querySelector('.cycle-questionnaire-table tbody tr')).toHaveClass(
        'cycle-questionnaire-table__row--inline-reveal',
      )

      fireEvent.click(screen.getByRole('button', { name: 'Consultar' }))
      await screen.findByRole('form', { name: 'Configuração: Ciclo aberto' })
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2))
      expect(screen.getByLabelText('Abertura')).toBeDisabled()
      expect(screen.getByLabelText('Encerramento')).toBeDisabled()
      expect(screen.getByLabelText('Fuso horário')).toBeDisabled()

      fireEvent.click(screen.getByRole('button', { name: 'Novo ciclo' }))
      await screen.findByRole('form', { name: 'Novo ciclo' })
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(3))
      await waitFor(() =>
        expect(screen.getByLabelText('Código do ciclo').closest('.field')).toHaveClass(
          'field--inline-reveal',
        ),
      )
      expect(screen.getByLabelText('Nome do ciclo').closest('.field')).not.toHaveClass(
        'field--inline-reveal',
      )
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScrollIntoView,
      })
    }
  })

  it('mantém rótulos de dados nos ciclos para a apresentação móvel', async () => {
    const api = createApi({ listAllCycles: vi.fn().mockResolvedValue([sampleCycle()]) })

    render(
      <CycleAdministrationPanel
        api={api}
        permissions={['CICLOS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    const cells = (await screen.findByRole('button', { name: 'Configurar' }))
      .closest('tr')
      ?.querySelectorAll('td')

    expect(cells).toHaveLength(3)
    expect(cells?.[0]).toHaveAttribute('data-label', 'Ciclo')
    expect(cells?.[1]).toHaveAttribute('data-label', 'Situação')
    expect(cells?.[2]).toHaveAttribute('data-label', 'Ação')
  })

  it('pede confirmação antes de abrir o ciclo em rascunho', async () => {
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const cycle = sampleCycle()
    const api = createApi({
      listAllCycles: vi.fn().mockResolvedValue([cycle]),
      getEvaluationCycleAdministrationDraft: vi.fn().mockResolvedValue(sampleDraft()),
    })

    try {
      render(
        <CycleAdministrationPanel
          api={api}
          permissions={['CICLOS.GERIR']}
          onSessionExpired={vi.fn()}
        />,
      )

      fireEvent.click(await screen.findByRole('button', { name: 'Configurar' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Abrir ciclo' }))

      expect(confirmation).toHaveBeenCalledWith(
        'Confirma abrir o ciclo “Ciclo de avaliação 2026.2”?',
      )
      await waitFor(() => expect(api.openEvaluationCycle).toHaveBeenCalledWith('cycle-draft-1'))
      expect(await screen.findByText('Ciclo aberto.')).toBeInTheDocument()
    } finally {
      confirmation.mockRestore()
    }
  })

  it('explica abertura futura sem alterar o rascunho nem repetir a escrita', async () => {
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const api = createApi({
      listAllCycles: vi.fn().mockResolvedValue([sampleCycle()]),
      openEvaluationCycle: vi.fn().mockRejectedValue(
        new ApiError({
          status: 409,
          reasonCode: 'CYCLE_OPENING_NOT_REACHED',
          requestId: 'cycle-future-1',
        }),
      ),
    })
    try {
      render(
        <CycleAdministrationPanel
          api={api}
          permissions={['CICLOS.GERIR']}
          onSessionExpired={vi.fn()}
        />,
      )
      fireEvent.click(await screen.findByRole('button', { name: 'Configurar' }))
      await screen.findByText('O rascunho selecionado contém 1 questionário(s) aplicado(s).')
      fireEvent.click(screen.getByRole('button', { name: 'Abrir ciclo' }))
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('ainda não chegou à data e ao horário de abertura salvos')
      expect(alert).toHaveTextContent('Referência: cycle-future-1.')
      expect(api.openEvaluationCycle).toHaveBeenCalledTimes(1)
      expect(api.replaceEvaluationCycle).not.toHaveBeenCalled()
      expect(screen.getByLabelText('Abertura')).toHaveValue('2026-09-01T00:00')
      expect(screen.getByRole('button', { name: 'Salvar configuração' })).toBeEnabled()
      expect(screen.queryByText('Ciclo aberto.')).not.toBeInTheDocument()
    } finally {
      confirmation.mockRestore()
    }
  })

  it('consulta em modo somente leitura o questionário aplicado ao ciclo', async () => {
    const cycle = sampleCycle()
    const api = createApi({
      listAllCycles: vi.fn().mockResolvedValue([cycle]),
      getEvaluationCycleAdministrationDraft: vi.fn().mockResolvedValue(sampleDraft()),
      getAppliedCycleQuestionnaire: vi.fn().mockResolvedValue(sampleAppliedQuestionnaire()),
    })

    render(
      <CycleAdministrationPanel
        api={api}
        permissions={['CICLOS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Configurar' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Visualizar questionário aplicado 1' }),
    )

    await waitFor(() =>
      expect(api.getAppliedCycleQuestionnaire).toHaveBeenCalledWith(
        'cycle-draft-1',
        'cycle-questionnaire-1',
      ),
    )
    expect(
      await screen.findByRole('heading', { name: 'Equipe 2026.2 · versão 1' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Conduz atividades com responsabilidade?')).toBeInTheDocument()
    expect(screen.getByText('Resposta obrigatória')).toBeInTheDocument()
  })

  it('não consulta nem exibe controles sem CICLOS.GERIR', () => {
    const api = createApi()

    render(<CycleAdministrationPanel api={api} permissions={[]} onSessionExpired={vi.fn()} />)

    expect(api.listAllCycles).not.toHaveBeenCalled()
    expect(api.listApprovedQuestionnaireVersions).not.toHaveBeenCalled()
    expect(api.createEvaluationCycle).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Criar ciclo' })).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Você não possui permissão para administrar ciclos de avaliação.',
    )
  })
})

function createApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listAllCycles: vi.fn().mockResolvedValue([]),
    listApprovedQuestionnaireVersions: vi.fn().mockResolvedValue([sampleApprovedVersion()]),
    getEvaluationCycleAdministrationDraft: vi.fn().mockResolvedValue(sampleDraft()),
    getAppliedCycleQuestionnaire: vi.fn().mockResolvedValue(sampleAppliedQuestionnaire()),
    createEvaluationCycle: vi.fn(),
    replaceEvaluationCycle: vi.fn().mockResolvedValue(undefined),
    openEvaluationCycle: vi.fn().mockResolvedValue(undefined),
    closeEvaluationCycle: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as ApiClient
}

function sampleCycle(overrides: Partial<EvaluationCycle> = {}): EvaluationCycle {
  return {
    id: 'cycle-draft-1',
    name: 'Ciclo de avaliação 2026.2',
    status: 'RASCUNHO',
    ...overrides,
  }
}

function sampleApprovedVersion(
  overrides: Partial<ApprovedQuestionnaireVersion> = {},
): ApprovedQuestionnaireVersion {
  return {
    questionnaireVersionId: 'questionnaire-version-1',
    questionnaireCode: 'EQUIPE',
    questionnaireName: 'Avaliação de equipe',
    versionNumber: 1,
    title: 'Equipe 2026.2',
    configurationOptions: [
      {
        calculationConfigurationVersionId: 'calculation-version-1',
        calculationCode: 'MEDIA_SIMPLES_2024_1',
        calculationVersionNumber: 1,
        classificationMatrixVersionId: 'matrix-version-1',
        classificationMatrixCode: 'GERAL',
        classificationMatrixVersionNumber: 1,
      },
    ],
    ...overrides,
  }
}

function sampleDraft(overrides: Partial<DraftCycleConfiguration> = {}): DraftCycleConfiguration {
  return {
    cycleId: 'cycle-draft-1',
    code: '2026.2',
    name: 'Ciclo de avaliação 2026.2',
    openingAtLocal: '2026-09-01T00:00',
    closingAtLocal: '2026-09-16T00:00',
    timeZone: 'America/Sao_Paulo',
    selfAssessmentEnabled: true,
    questionnaires: [
      {
        cycleQuestionnaireId: 'cycle-questionnaire-1',
        questionnaireVersionId: 'questionnaire-version-1',
        calculationConfigurationVersionId: 'calculation-version-1',
        classificationMatrixVersionId: 'matrix-version-1',
      },
    ],
    ...overrides,
  }
}

function sampleAppliedQuestionnaire(
  overrides: Partial<AppliedCycleQuestionnaire> = {},
): AppliedCycleQuestionnaire {
  return {
    cycleQuestionnaireId: 'cycle-questionnaire-1',
    questionnaireVersionId: 'questionnaire-version-1',
    questionnaireCode: 'EQUIPE',
    questionnaireVersionNumber: 1,
    title: 'Equipe 2026.2',
    competencies: [
      {
        id: 'competency-1',
        name: 'Responsabilidade',
        questions: [
          {
            id: 'question-1',
            text: 'Conduz atividades com responsabilidade?',
            required: true,
            options: [
              { id: 'option-1', label: 'Dentro das expectativas' },
              { id: 'option-2', label: 'Supera as expectativas' },
            ],
          },
        ],
      },
    ],
    ...overrides,
  }
}
