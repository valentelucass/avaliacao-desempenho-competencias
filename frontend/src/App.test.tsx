import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { ApiError } from './api/client'
import type { ApiClient } from './api/client'
import type {
  AssessmentDetail,
  AssessmentDraftInput,
  CreateAssessmentInput,
  IndicatorExport,
  IndicatorQuery,
  IndicatorResponse,
} from './api/contracts'
import App from './App'

const passwordChangeMethod = 'changePassword'

describe('App', () => {
  it('apresenta login sem tentar renovar uma sessão ao carregar', async () => {
    const api = createApi()
    render(<App api={api} />)

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Acesso à plataforma',
      }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('E-mail ou login')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('img', { name: 'Rodogarcia' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ativar modo escuro' })).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Desenvolvido por Lucas Andrade')
    expect(screen.getByRole('complementary', { name: 'Sobre esta página' })).toHaveTextContent(
      'Avaliações de desempenho',
    )
    expect(screen.getByRole('button', { name: 'Retomar sessão existente' })).toBeInTheDocument()
    expect(api.refreshSession).not.toHaveBeenCalled()
    expect(api.currentUser).not.toHaveBeenCalled()
  })

  it('retoma uma sessão existente somente pela ação explícita', async () => {
    const api = createApi({
      refreshSession: vi.fn().mockResolvedValue({
        id: 'user-1',
        displayName: 'Sessão retomada',
        permissions: [],
      }),
    })

    render(<App api={api} />)

    fireEvent.click(screen.getByRole('button', { name: 'Retomar sessão existente' }))

    expect(await screen.findByText('Sessão retomada')).toBeInTheDocument()
    expect(api.refreshSession).toHaveBeenCalledTimes(1)
    expect(api.currentUser).not.toHaveBeenCalled()
  })

  it('leva ao início ao selecionar a marca no cabeçalho', async () => {
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'user-1',
        displayName: 'Pessoa autenticada',
        permissions: ['INDICADORES.VISUALIZAR'],
      }),
    })

    renderWithExistingSession(api, '/indicadores')

    fireEvent.click(await screen.findByRole('button', { name: 'Ir para o início' }))

    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(screen.getByRole('heading', { name: 'Avaliações de desempenho' })).toBeInTheDocument()
  })

  it('informa quando não há sessão disponível para retomar', async () => {
    const api = createApi({ refreshSession: vi.fn().mockResolvedValue(null) })
    render(<App api={api} />)

    fireEvent.click(screen.getByRole('button', { name: 'Retomar sessão existente' }))

    await waitFor(() => expect(api.refreshSession).toHaveBeenCalledTimes(1))
    expect(screen.getByLabelText('E-mail ou login')).toBeInTheDocument()
    expect(
      screen.getByText('Não há uma sessão ativa para retomar. Entre com seu login e senha.'),
    ).toBeInTheDocument()
  })

  it('explica falha de credenciais sem revelar o estado da conta', async () => {
    const api = createApi({ signIn: vi.fn().mockRejectedValue(new ApiError({ status: 401 })) })
    render(<App api={api} />)

    fireEvent.change(screen.getByLabelText('E-mail ou login'), {
      target: { value: 'conta-teste' },
    })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-incorreta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Acessar plataforma' }))

    expect(
      await screen.findByText(
        'Não foi possível autenticar. Revise o login e a senha e tente novamente.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Sua sessão não está disponível. Entre novamente para continuar.'),
    ).not.toBeInTheDocument()
  })

  it('oculta métricas e CSV para dados insuficientes', async () => {
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'rh-1',
        displayName: 'Pessoa de RH',
        permissions: ['INDICADORES.VISUALIZAR', 'DADOS.EXPORTAR'],
      }),
      listCycles: vi
        .fn()
        .mockResolvedValue([{ id: 'cycle-2024', name: 'Ciclo 2024', status: 'ENCERRADO' }]),
      getIndicators: vi.fn().mockResolvedValue({ availability: 'DADOS_INSUFICIENTES' }),
    })

    const { container } = renderWithExistingSession(api, '/indicadores')

    await screen.findByRole('option', { name: 'Ciclo 2024' })
    const cycle = screen.getByLabelText('Ciclo de avaliação')
    fireEvent.change(cycle, { target: { value: 'cycle-2024' } })
    await waitFor(() => expect(api.getIndicatorFilterOptions).toHaveBeenCalledWith('cycle-2024'))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Consultar indicadores' })).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Consultar indicadores' }))

    const insufficientDataMessage = await screen.findByText(
      'Dados insuficientes para preservar a confidencialidade.',
    )
    expect(insufficientDataMessage).toBeInTheDocument()
    expect(insufficientDataMessage).toHaveClass('feedback--warning')
    expect(screen.queryByRole('heading', { name: 'Resultado agregado' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Exportar CSV agregado' })).not.toBeInTheDocument()
    expect(api.getIndicators).toHaveBeenCalledWith({
      cycleId: 'cycle-2024',
      metric: 'FINAL_SCORE_AVERAGE',
    })

    const result = await axe(container, {
      rules: {
        'color-contrast': { enabled: false },
      },
    })
    expect(result.violations).toHaveLength(0)
  })

  it('permite rascunho parcial, mas bloqueia envio sem todas as respostas', async () => {
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'manager-1',
        displayName: 'Gestor autorizado',
        permissions: ['AVALIACOES.AVALIAR_VINCULADOS'],
      }),
      listAssessments: vi.fn().mockResolvedValue([
        {
          id: 'assessment-1',
          cycle: { id: 'cycle-2024', name: 'Ciclo 2024' },
          evaluated: { displayName: 'Colaborador autorizado' },
          type: 'GESTOR',
          status: 'RASCUNHO',
        },
      ]),
      getAssessment: vi.fn().mockResolvedValue(sampleAssessment()),
    })

    renderWithExistingSession(api, '/avaliacoes')

    fireEvent.click(await screen.findByRole('button', { name: 'Abrir avaliação' }))
    expect(
      await screen.findByRole('radiogroup', { name: 'Conduz atividades com responsabilidade?' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Enviar avaliação' }))

    expect(
      await screen.findByText(
        'Responda todas as perguntas obrigatórias antes de enviar a avaliação.',
      ),
    ).toBeInTheDocument()
    expect(api.submitAssessment).not.toHaveBeenCalled()
    expect(screen.queryByText('Resultado calculado no servidor')).not.toBeInTheDocument()
  })

  it('identifica separadamente a situação do fluxo na lista de avaliações', async () => {
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'manager-1',
        displayName: 'Gestor autorizado',
        permissions: ['AVALIACOES.AVALIAR_VINCULADOS'],
      }),
      listAssessments: vi.fn().mockResolvedValue([
        {
          id: 'assessment-1',
          cycle: { id: 'cycle-demo', name: 'Demonstração DEV — radar com 5 perfis' },
          evaluated: { displayName: 'Pessoa fictícia 01 — abaixo' },
          type: 'GESTOR',
          status: 'PUBLICADA',
        },
      ]),
    })

    renderWithExistingSession(api, '/avaliacoes')

    const assessment = await screen.findByRole('listitem')
    expect(screen.queryByText('Ciclo de avaliação')).not.toBeInTheDocument()
    expect(within(assessment).getByLabelText('Situação: Publicada')).toBeInTheDocument()
    expect(within(assessment).getByText('Avaliação de gestor')).toBeInTheDocument()
  })

  it('salva as respostas atuais antes de enviar e oferece impressão do resumo', async () => {
    const draftAssessment = sampleManagerAssessmentWithOptionalQuestion()
    const savedAssessment: AssessmentDetail = {
      ...draftAssessment,
      revision: 'revision-2',
      answers: [{ questionId: 'question-1', optionId: 'option-1' }],
    }
    const submittedAssessment: AssessmentDetail = {
      ...savedAssessment,
      status: 'ENVIADA',
      result: {
        finalScore: 100,
        classification: { label: 'Dentro das expectativas' },
      },
      competencyScores: [{ id: 'competency-1', name: 'Conduta pessoal', score: 100 }],
    }
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'manager-1',
        displayName: 'Gestor autorizado',
        permissions: ['AVALIACOES.AVALIAR_VINCULADOS'],
      }),
      listAssessments: vi.fn().mockResolvedValue([
        {
          id: draftAssessment.id,
          cycle: draftAssessment.cycle,
          evaluated: draftAssessment.evaluated,
          type: draftAssessment.type,
          status: draftAssessment.status,
        },
      ]),
      getAssessment: vi.fn().mockResolvedValue(draftAssessment),
      recordAssessmentPrint: vi.fn().mockResolvedValue(undefined),
      saveAssessment: vi.fn().mockResolvedValue(savedAssessment),
      submitAssessment: vi.fn().mockResolvedValue(submittedAssessment),
    })
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)

    renderWithExistingSession(api, '/avaliacoes')

    fireEvent.click(await screen.findByRole('button', { name: 'Abrir avaliação' }))
    await screen.findByRole('radiogroup', { name: 'Conduz atividades com responsabilidade?' })

    expect(screen.getByRole('button', { name: 'Imprimir / PDF' })).toBeDisabled()

    fireEvent.click(screen.getByLabelText('Dentro das expectativas'))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar avaliação' }))

    await waitFor(() =>
      expect(api.saveAssessment).toHaveBeenCalledWith(
        draftAssessment.id,
        { answers: [{ questionId: 'question-1', optionId: 'option-1' }] },
        draftAssessment.revision,
      ),
    )
    await waitFor(() =>
      expect(api.submitAssessment).toHaveBeenCalledWith(
        draftAssessment.id,
        savedAssessment.revision,
      ),
    )
    expect(
      screen.queryByText('Responda todas as perguntas obrigatórias antes de enviar a avaliação.'),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Imprimir / PDF' }))
    await waitFor(() => expect(api.recordAssessmentPrint).toHaveBeenCalledWith(draftAssessment.id))
    expect(print).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Assinatura do colaborador')).toBeInTheDocument()
  })

  it('permite ao colaborador criar uma autoavaliação em ciclo autorizado', async () => {
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'collaborator-1',
        displayName: 'Colaborador autorizado',
        permissions: ['AUTOAVALIACOES.PREENCHER_PROPRIA', 'AUTOAVALIACOES.VISUALIZAR_PROPRIA'],
      }),
      listCycles: vi
        .fn()
        .mockResolvedValue([{ id: 'cycle-2024', name: 'Ciclo 2024', status: 'ABERTO' }]),
      createAssessment: vi.fn().mockResolvedValue(sampleSelfAssessment()),
      getAssessment: vi.fn().mockResolvedValue(sampleSelfAssessment()),
    })

    renderWithExistingSession(api, '/avaliacoes')

    expect(await screen.findByRole('heading', { name: 'Criar autoavaliação' })).toBeInTheDocument()
    await screen.findByRole('option', { name: 'Ciclo 2024' })
    fireEvent.change(screen.getByLabelText('Ciclo para autoavaliação'), {
      target: { value: 'cycle-2024' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar autoavaliação' }))

    expect(
      await screen.findByRole('heading', { name: 'Avaliação de Colaborador autorizado' }),
    ).toBeInTheDocument()
    expect(api.createAssessment).toHaveBeenCalledWith({
      type: 'AUTOAVALIACAO',
      cycleId: 'cycle-2024',
    })
  })

  it('permite ao gestor criar avaliação apenas para colaborador autorizado pelo servidor', async () => {
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'manager-1',
        displayName: 'Gestor autorizado',
        permissions: ['AVALIACOES.AVALIAR_VINCULADOS'],
      }),
      listCycles: vi
        .fn()
        .mockResolvedValue([{ id: 'cycle-2024', name: 'Ciclo 2024', status: 'ABERTO' }]),
      listManagerAssessmentCreationOptions: vi
        .fn()
        .mockResolvedValue([{ id: 'collaborator-1', displayName: 'Colaborador vinculado' }]),
      createAssessment: vi.fn().mockResolvedValue(sampleManagerAssessment()),
      getAssessment: vi.fn().mockResolvedValue(sampleManagerAssessment()),
    })

    renderWithExistingSession(api, '/avaliacoes')

    expect(
      await screen.findByRole('heading', { name: 'Criar avaliação de gestor' }),
    ).toBeInTheDocument()
    await screen.findByRole('option', { name: 'Ciclo 2024' })
    fireEvent.change(screen.getByLabelText('Ciclo para avaliação de gestor'), {
      target: { value: 'cycle-2024' },
    })
    await screen.findByRole('option', { name: 'Colaborador vinculado' })
    fireEvent.change(screen.getByLabelText('Colaborador autorizado'), {
      target: { value: 'collaborator-1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar avaliação de gestor' }))

    expect(
      await screen.findByRole('heading', { name: 'Avaliação de Colaborador vinculado' }),
    ).toBeInTheDocument()
    expect(api.listManagerAssessmentCreationOptions).toHaveBeenCalledWith('cycle-2024')
    expect(api.createAssessment).toHaveBeenCalledWith({
      type: 'GESTOR',
      cycleId: 'cycle-2024',
      collaboratorId: 'collaborator-1',
    })
  })

  it('não duplica a criação de avaliação no menu lateral', async () => {
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'manager-1',
        displayName: 'Gestor autorizado',
        permissions: ['AVALIACOES.AVALIAR_VINCULADOS'],
      }),
    })

    renderWithExistingSession(api, '/avaliacoes?jornada=EQUIPE')

    await screen.findByRole('heading', { name: 'Avaliações autorizadas' })
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }))

    expect(screen.getByRole('button', { name: 'Minhas avaliações' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.queryByRole('button', { name: 'Nova avaliação' })).not.toBeInTheDocument()
  })

  it('permite a RH publicar uma avaliação enviada pelo gestor', async () => {
    const submittedAssessment: AssessmentDetail = {
      ...sampleManagerAssessment(),
      status: 'ENVIADA',
      result: {
        finalScore: 100,
        classification: { label: 'Dentro das expectativas' },
      },
    }
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'rh-1',
        displayName: 'Pessoa de RH',
        permissions: ['AVALIACOES.VISUALIZAR_TODAS', 'AVALIACOES.PUBLICAR'],
      }),
      listAssessments: vi.fn().mockResolvedValue([
        {
          id: submittedAssessment.id,
          cycle: submittedAssessment.cycle,
          evaluated: submittedAssessment.evaluated,
          type: submittedAssessment.type,
          status: submittedAssessment.status,
        },
      ]),
      getAssessment: vi.fn().mockResolvedValue(submittedAssessment),
      publishAssessment: vi.fn().mockResolvedValue({
        ...submittedAssessment,
        status: 'PUBLICADA',
      }),
    })

    renderWithExistingSession(api, '/avaliacoes')

    fireEvent.click(await screen.findByRole('button', { name: 'Abrir avaliação' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Publicar avaliação' }))

    expect(await screen.findByText('Avaliação publicada com sucesso.')).toBeInTheDocument()
    expect(api.publishAssessment).toHaveBeenCalledWith(submittedAssessment.id)
  })

  it('pré-visualiza o gráfico ao selecionar ciclo e colaborador na visão administrativa', async () => {
    const completedAssessment: AssessmentDetail = {
      ...sampleManagerAssessment(),
      status: 'PUBLICADA',
      result: {
        finalScore: 100,
        classification: { label: 'Dentro das expectativas' },
      },
      competencyScores: [{ id: 'competency-1', name: 'Conduta pessoal', score: 100 }],
    }
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'rh-1',
        displayName: 'Pessoa de RH',
        permissions: ['AVALIACOES.VISUALIZAR_TODAS', 'CADASTROS.GERIR'],
      }),
      listAllCycles: vi
        .fn()
        .mockResolvedValue([{ id: 'cycle-2024', name: 'Ciclo 2024', status: 'ENCERRADO' }]),
      listCollaborators: vi
        .fn()
        .mockResolvedValue([
          { id: 'collaborator-1', displayName: 'Colaborador vinculado', active: true },
        ]),
      listAssessments: vi.fn().mockResolvedValue([
        {
          id: completedAssessment.id,
          cycle: completedAssessment.cycle,
          evaluated: completedAssessment.evaluated,
          type: completedAssessment.type,
          status: completedAssessment.status,
        },
      ]),
      getAssessment: vi.fn().mockResolvedValue(completedAssessment),
    })

    renderWithExistingSession(api, '/avaliacoes')

    await screen.findByRole('option', { name: 'Ciclo 2024' })
    fireEvent.change(screen.getByLabelText('Ciclo'), { target: { value: 'cycle-2024' } })
    fireEvent.change(screen.getByLabelText('Colaborador'), { target: { value: 'collaborator-1' } })

    expect(
      await screen.findByRole('img', { name: /Pontuação por competência/ }),
    ).toBeInTheDocument()
    expect(api.getAssessment).toHaveBeenCalledWith(completedAssessment.id)
  })

  it('mantém um rascunho em consulta quando a permissão não autoriza sua edição', async () => {
    const draftAssessment = sampleManagerAssessment()
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'rh-reader-1',
        displayName: 'Leitura de RH',
        permissions: ['AVALIACOES.VISUALIZAR_TODAS'],
      }),
      getAssessment: vi.fn().mockResolvedValue(draftAssessment),
    })

    renderWithExistingSession(api, `/avaliacoes/${draftAssessment.id}`)

    expect(
      await screen.findByText(
        'Esta avaliação está disponível somente para consulta com as permissões atuais.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Dentro das expectativas' })).toBeDisabled()
    expect(screen.getByLabelText('Comentário opcional')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Salvar rascunho' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enviar avaliação' })).not.toBeInTheDocument()
  })

  it('não exibe CSV para quem não possui permissão de exportação', async () => {
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'indicator-reader-1',
        displayName: 'Leitor de indicadores',
        permissions: ['INDICADORES.VISUALIZAR'],
      }),
      listCycles: vi
        .fn()
        .mockResolvedValue([{ id: 'cycle-2024', name: 'Ciclo 2024', status: 'ENCERRADO' }]),
      getIndicators: vi.fn().mockResolvedValue({
        availability: 'AVAILABLE',
        policyVersion: '2024.1',
        metric: 'FINAL_SCORE_AVERAGE',
        averageScore: 100,
      }),
    })

    renderWithExistingSession(api, '/indicadores')

    await screen.findByRole('option', { name: 'Ciclo 2024' })
    fireEvent.change(screen.getByLabelText('Ciclo de avaliação'), {
      target: { value: 'cycle-2024' },
    })
    await waitFor(() => expect(api.getIndicatorFilterOptions).toHaveBeenCalledWith('cycle-2024'))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Consultar indicadores' })).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Consultar indicadores' }))

    await screen.findByRole('heading', { name: 'Resultado agregado' })
    expect(screen.queryByRole('button', { name: 'Exportar CSV agregado' })).not.toBeInTheDocument()
  })

  it('oferece somente filtros de indicadores autorizados pelo servidor', async () => {
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'rh-1',
        displayName: 'Pessoa de RH',
        permissions: ['INDICADORES.VISUALIZAR'],
      }),
      listCycles: vi
        .fn()
        .mockResolvedValue([{ id: 'cycle-2024', name: 'Ciclo 2024', status: 'ENCERRADO' }]),
      getIndicatorFilterOptions: vi.fn().mockResolvedValue({
        branches: [{ id: 'branch-1', label: 'Filial Norte' }],
        areas: [],
        managers: [],
        competencies: [],
      }),
      getIndicators: vi.fn().mockResolvedValue({
        availability: 'DADOS_INSUFICIENTES',
      }),
    })

    renderWithExistingSession(api, '/indicadores')

    await screen.findByRole('option', { name: 'Ciclo 2024' })
    fireEvent.change(screen.getByLabelText('Ciclo de avaliação'), {
      target: { value: 'cycle-2024' },
    })
    await waitFor(() => expect(api.getIndicatorFilterOptions).toHaveBeenCalledWith('cycle-2024'))
    fireEvent.change(screen.getByLabelText('Dimensão'), { target: { value: 'BRANCH' } })
    await screen.findByRole('option', { name: 'Filial Norte' })

    const branch = screen.getByLabelText('Opção autorizada')
    expect(branch).toHaveProperty('tagName', 'SELECT')
    fireEvent.change(branch, { target: { value: 'branch-1' } })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Consultar indicadores' })).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Consultar indicadores' }))

    expect(api.getIndicatorFilterOptions).toHaveBeenCalledWith('cycle-2024')
    expect(api.getIndicators).toHaveBeenCalledWith({
      cycleId: 'cycle-2024',
      metric: 'FINAL_SCORE_AVERAGE',
      branchId: 'branch-1',
    })
  })

  it('invalida resultado e exportação ao alterar qualquer filtro de indicadores', async () => {
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'rh-1',
        displayName: 'Pessoa de RH',
        permissions: ['INDICADORES.VISUALIZAR', 'DADOS.EXPORTAR'],
      }),
      listCycles: vi
        .fn()
        .mockResolvedValue([{ id: 'cycle-2024', name: 'Ciclo 2024', status: 'ENCERRADO' }]),
      getIndicatorFilterOptions: vi.fn().mockResolvedValue({
        branches: [
          { id: 'branch-1', label: 'Filial Norte' },
          { id: 'branch-2', label: 'Filial Sul' },
        ],
        areas: [],
        managers: [],
        competencies: [
          { id: 'competency-1', label: 'Conduta pessoal' },
          { id: 'competency-2', label: 'Foco em resultados' },
        ],
      }),
      getIndicators: vi.fn().mockImplementation(async (query: IndicatorQuery) => ({
        availability: 'AVAILABLE' as const,
        policyVersion: '2024.1',
        metric: query.metric,
        averageScore: 100,
      })),
    })

    renderWithExistingSession(api, '/indicadores')

    await screen.findByRole('option', { name: 'Ciclo 2024' })
    fireEvent.change(screen.getByLabelText('Ciclo de avaliação'), {
      target: { value: 'cycle-2024' },
    })
    await waitFor(() => expect(api.getIndicatorFilterOptions).toHaveBeenCalledWith('cycle-2024'))

    async function expectFreshResult() {
      fireEvent.click(screen.getByRole('button', { name: 'Consultar indicadores' }))
      await screen.findByRole('heading', { name: 'Resultado agregado' })
      expect(screen.getByRole('button', { name: 'Exportar CSV agregado' })).toBeInTheDocument()
    }

    function expectInvalidatedResult() {
      expect(screen.queryByRole('heading', { name: 'Resultado agregado' })).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Exportar CSV agregado' }),
      ).not.toBeInTheDocument()
      expect(screen.queryByText('Indicadores atualizados.')).not.toBeInTheDocument()
    }

    await expectFreshResult()
    fireEvent.change(screen.getByLabelText('Métrica'), {
      target: { value: 'COMPETENCY_SCORE_AVERAGE' },
    })
    expectInvalidatedResult()

    fireEvent.change(screen.getByLabelText('Competência'), {
      target: { value: 'competency-1' },
    })
    await expectFreshResult()
    fireEvent.change(screen.getByLabelText('Competência'), {
      target: { value: 'competency-2' },
    })
    expectInvalidatedResult()

    fireEvent.change(screen.getByLabelText('Competência'), {
      target: { value: 'competency-1' },
    })
    await expectFreshResult()
    fireEvent.change(screen.getByLabelText('Dimensão'), { target: { value: 'BRANCH' } })
    expectInvalidatedResult()

    fireEvent.change(screen.getByLabelText('Opção autorizada'), {
      target: { value: 'branch-1' },
    })
    await expectFreshResult()
    fireEvent.change(screen.getByLabelText('Opção autorizada'), {
      target: { value: 'branch-2' },
    })
    expectInvalidatedResult()
  })

  it('oferece consulta técnica somente de leitura ao administrador da plataforma', async () => {
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'platform-admin-1',
        displayName: 'Administrador de plataforma',
        permissions: ['USUARIOS.LER'],
      }),
      listAdministrationUsers: vi.fn().mockResolvedValue([
        {
          id: 'platform-admin-1',
          login: 'administrador',
          displayName: 'Administrador de plataforma',
          status: 'ACTIVE',
          passwordChangeRequired: false,
        },
      ]),
    })

    const { container } = renderWithExistingSession(api, '/administracao')

    expect(await screen.findByRole('heading', { name: 'Contas locais' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }))
    expect(screen.getByRole('button', { name: 'Contas e acessos' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      await screen.findByRole('cell', { name: 'Administrador de plataforma' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Ativa' })).toBeInTheDocument()
    expect(api.listAdministrationUsers).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Avaliações autorizadas')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /criar conta/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /conceder acesso/i })).not.toBeInTheDocument()

    const result = await axe(container, {
      rules: {
        'color-contrast': { enabled: false },
      },
    })
    expect(result.violations).toHaveLength(0)
  })

  it('abre o deep-link de ciclos administrativos para RH autorizado', async () => {
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'rh-1',
        displayName: 'Pessoa de RH',
        permissions: ['CICLOS.GERIR'],
      }),
      listAllCycles: vi.fn().mockResolvedValue([]),
      listApprovedQuestionnaireVersions: vi.fn().mockResolvedValue([]),
    })

    renderWithExistingSession(api, '/administracao/ciclos')

    expect(await screen.findByRole('heading', { name: 'Ciclos de avaliação' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/administracao/ciclos')
    expect(
      screen.queryByRole('navigation', { name: 'Áreas administrativas' }),
    ).not.toBeInTheDocument()
    await waitFor(() => expect(api.listAllCycles).toHaveBeenCalledTimes(1))
  })

  it('mantém administração disponível para RH sem leitura de usuários e sincroniza a aba com a URL', async () => {
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'rh-1',
        displayName: 'Pessoa de RH',
        permissions: ['QUESTIONARIOS.GERIR', 'CICLOS.GERIR'],
      }),
      listAllCycles: vi.fn().mockResolvedValue([]),
      listApprovedQuestionnaireVersions: vi.fn().mockResolvedValue([]),
    })

    renderWithExistingSession(api, '/administracao/ciclos')

    await screen.findByRole('heading', { name: 'Ciclos de avaliação' })
    expect(
      screen.queryByRole('navigation', { name: 'Áreas administrativas' }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }))
    const drawer = await screen.findByRole('dialog', { name: 'Menu de módulos' })
    expect(within(drawer).getByText('Administração')).toBeInTheDocument()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Questionários' }))

    expect(await screen.findByRole('heading', { name: 'Questionários' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/administracao/questionarios')
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }))
    const reopenedDrawer = await screen.findByRole('dialog', { name: 'Menu de módulos' })
    expect(within(reopenedDrawer).getByRole('button', { name: 'Questionários' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      within(reopenedDrawer).queryByRole('button', { name: 'Contas e acessos' }),
    ).not.toBeInTheDocument()
  })

  it('fecha o drawer com Escape e devolve o foco ao botão que o abriu', async () => {
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'indicator-reader-1',
        displayName: 'Leitor de indicadores',
        permissions: ['INDICADORES.VISUALIZAR'],
      }),
    })

    renderWithExistingSession(api)

    const menuButton = await screen.findByRole('button', { name: 'Abrir menu' })
    menuButton.focus()
    fireEvent.click(menuButton)

    const drawer = await screen.findByRole('dialog', { name: 'Menu de módulos' })
    const closeButton = within(drawer).getByRole('button', { name: 'Fechar menu' })
    await waitFor(() => expect(closeButton).toHaveFocus())

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(menuButton).toHaveFocus()
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    expect(drawer).toHaveAttribute('aria-hidden', 'true')
  })

  it('bloqueia a rolagem global enquanto o drawer está aberto', async () => {
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'indicator-reader-1',
        displayName: 'Leitor de indicadores',
        permissions: ['INDICADORES.VISUALIZAR'],
      }),
    })

    renderWithExistingSession(api)

    fireEvent.click(await screen.findByRole('button', { name: 'Abrir menu' }))
    const drawer = await screen.findByRole('dialog', { name: 'Menu de módulos' })

    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.click(within(drawer).getByRole('button', { name: 'Fechar menu' }))

    await waitFor(() => expect(document.documentElement.style.overflow).toBe(''))
    expect(document.body.style.overflow).toBe('')
  })

  it('libera a administração somente após trocar a senha e entrar novamente', async () => {
    const technicalAdministrator = {
      id: 'platform-admin-1',
      displayName: 'Administrador de plataforma',
      permissions: ['USUARIOS.LER'],
    }
    const api = createApi({
      currentUser: vi
        .fn()
        .mockResolvedValueOnce({ ...technicalAdministrator, passwordChangeRequired: true })
        .mockResolvedValueOnce(technicalAdministrator),
      changePassword: vi.fn().mockResolvedValue(undefined),
      signIn: vi.fn().mockResolvedValue(undefined),
      listAdministrationUsers: vi.fn().mockResolvedValue([]),
    })

    renderWithExistingSession(api, '/administracao')

    expect(
      await screen.findByRole('heading', { name: 'Troca de senha obrigatória' }),
    ).toBeInTheDocument()
    expect(document.querySelector('input[autocomplete="username"]')).toHaveAttribute('hidden')
    expect(screen.queryByRole('button', { name: 'Administração' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: 'initial' } })
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'replacement' } })
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), {
      target: { value: 'replacement' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Alterar senha' }))

    await screen.findByLabelText('E-mail ou login')
    fireEvent.change(screen.getByLabelText('E-mail ou login'), {
      target: { value: 'administrador' },
    })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'replacement' } })
    fireEvent.click(screen.getByRole('button', { name: 'Acessar plataforma' }))

    expect(await screen.findByRole('heading', { name: 'Contas locais' })).toBeInTheDocument()
    expect(api.changePassword).toHaveBeenCalledWith('initial', 'replacement')
    expect(api.signIn).toHaveBeenCalledWith('administrador', 'replacement')
    await waitFor(() => expect(api.listAdministrationUsers).toHaveBeenCalledTimes(1))
  })

  it('exige a troca de senha e retorna ao login depois de revogar a sessão', async () => {
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'user-1',
        displayName: 'Pessoa com troca pendente',
        passwordChangeRequired: true,
        permissions: ['INDICADORES.VISUALIZAR'],
      }),
      [passwordChangeMethod]: vi.fn().mockResolvedValue(undefined),
    })

    const { container } = renderWithExistingSession(api, '/indicadores')

    expect(
      await screen.findByRole('heading', { name: 'Troca de senha obrigatória' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('navigation', { name: 'Módulos disponíveis' }),
    ).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: 'current' } })
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'replacement' } })
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), {
      target: { value: 'replacement' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Alterar senha' }))

    expect(await screen.findByLabelText('E-mail ou login')).toBeInTheDocument()
    expect(api.changePassword).toHaveBeenCalledWith('current', 'replacement')
    expect(
      screen.getByText('Senha alterada. Entre novamente com a nova senha para continuar.'),
    ).toBeInTheDocument()

    const result = await axe(container, {
      rules: {
        'color-contrast': { enabled: false },
      },
    })
    expect(result.violations).toHaveLength(0)
  })

  it('alterna o tema pelo topo e guarda a preferência neste navegador', async () => {
    window.localStorage.removeItem('adc-theme')
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'theme-user',
        displayName: 'Pessoa',
        permissions: ['INDICADORES.VISUALIZAR'],
      }),
    })

    renderWithExistingSession(api)

    await screen.findByRole('button', { name: 'Ativar modo escuro' })
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Desenvolvido por Lucas Andrade')
    expect(screen.getByRole('link', { name: 'Lucas Andrade' })).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/dev-lucasandrade/',
    )
    expect(screen.getByRole('banner').firstElementChild).toHaveClass('application-header__content')
    expect(screen.queryByRole('region', { name: 'Conta ativa' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }))
    const drawer = await screen.findByRole('dialog', { name: 'Menu de módulos' })
    expect(within(drawer).getByLabelText('Conta ativa')).toHaveTextContent('Pessoa')
    expect(within(drawer).getByRole('button', { name: 'Sair da conta' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ativar modo escuro' }))

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(window.localStorage.getItem('adc-theme')).toBe('dark')
    expect(screen.getByRole('button', { name: 'Ativar modo claro' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    window.localStorage.removeItem('adc-theme')
    document.documentElement.dataset.theme = 'light'
  })
})

function renderWithExistingSession(api: ApiClient, path = '/') {
  window.history.replaceState(null, '', path)
  const rendered = render(<App api={api} />)
  fireEvent.click(screen.getByRole('button', { name: 'Retomar sessão existente' }))
  return rendered
}

function createApi(overrides: Partial<ApiClient> = {}): ApiClient {
  const currentUser = overrides.currentUser ?? vi.fn().mockResolvedValue(null)
  const refreshSession = overrides.refreshSession ?? vi.fn(() => currentUser())
  const listCycles = overrides.listCycles ?? vi.fn().mockResolvedValue([])
  const listAllCycles = overrides.listAllCycles ?? vi.fn(() => listCycles())
  const api = {
    currentUser,
    refreshSession,
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    listAdministrationUsers: vi.fn().mockResolvedValue([]),
    listCycles,
    listAllCycles,
    listAssessments: vi.fn().mockResolvedValue([]),
    listManagerAssessmentCreationOptions: vi.fn().mockResolvedValue([]),
    createAssessment: vi.fn<(input: CreateAssessmentInput) => Promise<AssessmentDetail>>(),
    getAssessment: vi.fn<(assessmentId: string) => Promise<AssessmentDetail>>(),
    recordAssessmentPrint: vi.fn<(assessmentId: string) => Promise<void>>(),
    saveAssessment:
      vi.fn<
        (
          assessmentId: string,
          draft: AssessmentDraftInput,
          revision?: string,
        ) => Promise<AssessmentDetail>
      >(),
    submitAssessment:
      vi.fn<(assessmentId: string, revision?: string) => Promise<AssessmentDetail>>(),
    publishAssessment: vi.fn<(assessmentId: string) => Promise<AssessmentDetail>>(),
    reopenAssessment: vi.fn<(assessmentId: string, reason: string) => Promise<AssessmentDetail>>(),
    getIndicatorFilterOptions: vi.fn().mockResolvedValue({
      branches: [],
      areas: [],
      managers: [],
      competencies: [],
    }),
    getIndicators: vi.fn<(query: IndicatorQuery) => Promise<IndicatorResponse>>(),
    exportIndicators:
      vi.fn<(query: IndicatorQuery) => Promise<IndicatorExport | IndicatorResponse>>(),
    ...overrides,
  }

  return Object.assign(
    { [passwordChangeMethod]: vi.fn().mockResolvedValue(undefined) },
    api,
  ) as ApiClient
}

function sampleAssessment(): AssessmentDetail {
  return {
    id: 'assessment-1',
    cycle: { id: 'cycle-2024', name: 'Ciclo 2024' },
    evaluated: { displayName: 'Colaborador autorizado' },
    type: 'GESTOR',
    status: 'RASCUNHO',
    revision: 'revision-1',
    questionnaire: {
      version: '2024.1',
      competencies: [
        {
          id: 'competency-1',
          name: 'Conduta pessoal',
          questions: [
            {
              id: 'question-1',
              text: 'Conduz atividades com responsabilidade?',
              required: true,
              options: [
                { id: 'option-1', label: 'Dentro das expectativas', points: 100 },
                { id: 'option-2', label: 'Supera as expectativas', points: 110 },
              ],
            },
          ],
        },
      ],
    },
    answers: [],
  }
}

function sampleSelfAssessment(): AssessmentDetail {
  return {
    ...sampleAssessment(),
    id: 'self-assessment-1',
    evaluated: { displayName: 'Colaborador autorizado' },
    type: 'AUTOAVALIACAO',
  }
}

function sampleManagerAssessment(): AssessmentDetail {
  return {
    ...sampleAssessment(),
    id: 'manager-assessment-1',
    evaluated: { displayName: 'Colaborador vinculado' },
  }
}

function sampleManagerAssessmentWithOptionalQuestion(): AssessmentDetail {
  const assessment = sampleManagerAssessment()
  const competency = assessment.questionnaire.competencies[0]
  return {
    ...assessment,
    questionnaire: {
      ...assessment.questionnaire,
      competencies: [
        {
          ...competency,
          questions: [
            ...competency.questions,
            {
              id: 'optional-question-1',
              text: 'Há observações adicionais?',
              required: false,
              options: [
                { id: 'optional-option-1', label: 'Sim', points: 100 },
                { id: 'optional-option-2', label: 'Não', points: 80 },
              ],
            },
          ],
        },
      ],
    },
  }
}
