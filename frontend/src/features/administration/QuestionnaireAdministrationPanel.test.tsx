import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import type { ApiClient } from '../../api/client'
import type { ApprovedQuestionnaireVersion } from '../../api/contracts'
import { QuestionnaireAdministrationPanel } from './QuestionnaireAdministrationPanel'

describe('QuestionnaireAdministrationPanel', () => {
  it('lista versões aprovadas sem expor seus identificadores técnicos', async () => {
    const api = createApi({
      listApprovedQuestionnaireVersions: vi.fn().mockResolvedValue([
        approvedVersion({
          questionnaireCode: 'LIDERANCA',
          questionnaireName: 'Avaliação de liderança',
          versionNumber: 2,
          title: 'Liderança 2026.2',
        }),
      ]),
    })

    render(
      <QuestionnaireAdministrationPanel
        api={api}
        permissions={['QUESTIONARIOS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    expect(await screen.findByRole('cell', { name: /Avaliação de liderança/ })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'v2' })).toBeInTheDocument()
    expect(screen.getByText('Liderança 2026.2')).toBeInTheDocument()
    expect(screen.getByText('MEDIA_SIMPLES_2024_1 v1 · GERAL v1')).toBeInTheDocument()
    expect(screen.queryByText('questionnaire-version-id')).not.toBeInTheDocument()
  })

  it('preenche o modelo de liderança e cria uma versão com a escala exclusiva do servidor', async () => {
    const createQuestionnaireVersion = vi.fn().mockResolvedValue({
      questionnaireVersionId: 'new-questionnaire-version',
      calculationConfigurationVersionId: 'new-calculation-version',
      classificationMatrixVersionId: 'new-matrix-version',
    })
    const api = createApi({ createQuestionnaireVersion })

    render(
      <QuestionnaireAdministrationPanel
        api={api}
        permissions={['QUESTIONARIOS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    await waitFor(() => expect(api.listApprovedQuestionnaireVersions).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByLabelText('Modelo de competências'), {
      target: { value: 'LIDERANCA' },
    })
    fireEvent.change(screen.getByLabelText('Título exibido'), {
      target: { value: 'Liderança 2026.1' },
    })

    const appliedScale = screen.getByRole('list', { name: 'Escala de respostas aplicada' })
    expect(appliedScale).toHaveTextContent('Abaixo do esperado')
    expect(appliedScale).toHaveTextContent('80')
    expect(appliedScale).toHaveTextContent('É referência')
    expect(appliedScale).toHaveTextContent('120')
    expect(screen.queryByDisplayValue('80')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Competência a avaliar')).not.toBeInTheDocument()
    expect(screen.getAllByText('Preza pela segurança').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Criar e aprovar versão' }))

    await waitFor(() => expect(createQuestionnaireVersion).toHaveBeenCalledTimes(1))
    const input = createQuestionnaireVersion.mock.calls[0]?.[0]
    expect(input).toMatchObject({
      questionnaire: {
        code: 'LIDERANCA',
        name: 'Avaliação de liderança',
      },
      versionNumber: 1,
      title: 'Liderança 2026.1',
      calculation: {
        code: 'MEDIA_SIMPLES_2024_1',
        versionNumber: 1,
      },
      classificationMatrixVersionNumber: 1,
    })
    expect(input.competencies).toHaveLength(21)
    expect(input.competencies[0]).toMatchObject({
      code: 'LIDERANCA_PREZA_SEGURANCA',
      name: 'Preza pela segurança',
      questions: [
        {
          code: 'LIDERANCA_PREZA_SEGURANCA_PERGUNTA',
          text: 'Preza pela segurança',
          order: 1,
        },
      ],
    })
    expect(
      screen.getByText(
        'Versão criada e aprovada. O conteúdo e a escala ficam congelados para preservar as avaliações históricas.',
      ),
    ).toBeInTheDocument()
  })

  it('não consulta nem oferece o formulário sem QUESTIONARIOS.GERIR', () => {
    const api = createApi()

    render(
      <QuestionnaireAdministrationPanel api={api} permissions={[]} onSessionExpired={vi.fn()} />,
    )

    expect(api.listApprovedQuestionnaireVersions).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Criar e aprovar versão' })).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Você não possui a permissão necessária para administrar questionários.',
    )
  })

  it('mantém rótulos e uma escala compreensível para leitores de tela', async () => {
    const api = createApi()
    const { container } = render(
      <QuestionnaireAdministrationPanel
        api={api}
        permissions={['QUESTIONARIOS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    await waitFor(() => expect(api.listApprovedQuestionnaireVersions).toHaveBeenCalledTimes(1))
    expect(screen.getByLabelText('Modelo de competências')).toBeRequired()
    fireEvent.change(screen.getByLabelText('Modelo de competências'), {
      target: { value: 'COLABORADORES' },
    })
    const appliedScale = screen.getByRole('list', { name: 'Escala de respostas aplicada' })
    expect(appliedScale).toHaveTextContent('Abaixo do esperado')
    expect(appliedScale).toHaveTextContent('80')
    expect(appliedScale).toHaveTextContent('É referência')
    expect(appliedScale).toHaveTextContent('120')

    const result = await axe(container, {
      rules: {
        'color-contrast': { enabled: false },
      },
    })
    expect(result.violations).toHaveLength(0)
  })
})

function createApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listApprovedQuestionnaireVersions: vi.fn().mockResolvedValue([]),
    createQuestionnaireVersion: vi.fn(),
    ...overrides,
  } as ApiClient
}

function approvedVersion(
  overrides: Partial<ApprovedQuestionnaireVersion> = {},
): ApprovedQuestionnaireVersion {
  return {
    questionnaireVersionId: 'questionnaire-version-id',
    questionnaireCode: 'EQUIPE',
    questionnaireName: 'Avaliação de equipe',
    versionNumber: 1,
    title: 'Equipe 2026.1',
    configurationOptions: [
      {
        calculationConfigurationVersionId: 'calculation-version-id',
        calculationCode: 'MEDIA_SIMPLES_2024_1',
        calculationVersionNumber: 1,
        classificationMatrixVersionId: 'matrix-version-id',
        classificationMatrixCode: 'GERAL',
        classificationMatrixVersionNumber: 1,
      },
    ],
    ...overrides,
  }
}
