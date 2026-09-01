import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../api/client'
import type {
  ApprovedQuestionnaireVersion,
  AppliedCycleQuestionnaire,
  DraftCycleConfiguration,
  EvaluationCycle,
} from '../../api/contracts'
import { CycleAdministrationPanel } from './CycleAdministrationPanel'

describe('CycleAdministrationPanel', () => {
  it('cria um ciclo em rascunho com uma versão aprovada selecionada', async () => {
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
    fireEvent.change(screen.getByLabelText('Código do ciclo'), { target: { value: '2026.2' } })
    fireEvent.change(screen.getByLabelText('Nome do ciclo'), {
      target: { value: 'Ciclo de avaliação 2026.2' },
    })
    fireEvent.change(screen.getByLabelText('Abertura'), {
      target: { value: '2026-09-01T08:00' },
    })
    fireEvent.change(screen.getByLabelText('Encerramento'), {
      target: { value: '2026-10-31T18:00' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'MEDIA_SIMPLES_2024_1 v1 · GERAL v1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Criar ciclo' }))

    await waitFor(() =>
      expect(api.createEvaluationCycle).toHaveBeenCalledWith({
        code: '2026.2',
        configuration: {
          name: 'Ciclo de avaliação 2026.2',
          openingAtLocal: '2026-09-01T08:00',
          closingAtLocal: '2026-10-31T18:00',
          timeZone: 'America/Sao_Paulo',
          selfAssessmentEnabled: false,
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
          openingAtLocal: '2026-09-01T08:00',
          closingAtLocal: '2026-10-31T18:00',
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
    openingAtLocal: '2026-09-01T08:00',
    closingAtLocal: '2026-10-31T18:00',
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
