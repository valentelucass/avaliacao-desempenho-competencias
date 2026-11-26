import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { ApiError, HttpApiClient } from './api/client'
import type { ApiClient } from './api/client'
import type {
  AssessmentDetail,
  AssessmentDraftInput,
  CreateAssessmentInput,
  CurrentUser,
  IndicatorExport,
  IndicatorQuery,
  IndicatorResponse,
} from './api/contracts'
import App from './App'

const passwordChangeMethod = 'changePassword'

describe('App', () => {
  it.each(['ADMINISTRADOR_PLATAFORMA', 'GERENCIA_RH', 'DIRETORIA', 'GESTOR', 'COLABORADOR'])(
    'permite troca pessoal voluntária para %s sem capacidade administrativa',
    async (role) => {
      const api = createApi({
        currentUser: vi.fn().mockResolvedValue({
          id: 'fixture',
          displayName: 'Conta fictícia',
          roles: [role],
          permissions: [],
          passwordChangeRequired: false,
        }),
      })
      renderWithExistingSession(api)
      fireEvent.click(await screen.findByRole('button', { name: 'Abrir menu' }))
      fireEvent.click(screen.getByRole('button', { name: 'Alterar minha senha' }))
      const dialog = await screen.findByRole('dialog', { name: 'Alterar minha senha' })
      expect(within(dialog).getByRole('heading', { name: 'Alterar minha senha' })).toHaveFocus()
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      expect(document.querySelector('.ev-stage')).toHaveAttribute('aria-hidden', 'true')
      fireEvent.change(screen.getByLabelText('Senha atual'), {
        target: { value: crypto.randomUUID() },
      })
      fireEvent.keyDown(screen.getByLabelText('Senha atual'), { key: 'Escape' })
      expect(screen.queryByRole('dialog', { name: 'Alterar minha senha' })).not.toBeInTheDocument()
      expect(document.querySelector('.ev-stage')).not.toHaveAttribute('aria-hidden')
      fireEvent.click(await screen.findByRole('button', { name: 'Abrir menu' }))
      fireEvent.click(screen.getByRole('button', { name: 'Alterar minha senha' }))
      const reopened = await screen.findByRole('dialog', { name: 'Alterar minha senha' })
      expect(within(reopened).getByLabelText('Senha atual')).toHaveValue('')
      fireEvent.click(within(reopened).getByLabelText('Senha atual'))
      expect(reopened).toBeVisible()
      fireEvent.click(reopened.parentElement!)
      expect(screen.queryByRole('dialog', { name: 'Alterar minha senha' })).not.toBeInTheDocument()
      fireEvent.click(await screen.findByRole('button', { name: 'Abrir menu' }))
      fireEvent.click(screen.getByRole('button', { name: 'Alterar minha senha' }))
      await screen.findByRole('dialog', { name: 'Alterar minha senha' })
      const current = crypto.randomUUID(),
        next = crypto.randomUUID()
      fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: current } })
      fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: next } })
      fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: next } })
      fireEvent.click(screen.getByRole('button', { name: 'Alterar senha' }))
      await screen.findByRole('heading', { name: 'Acesso à plataforma' })
      expect(api.changePassword).toHaveBeenCalledExactlyOnceWith(current, next)
    },
  )

  it.each([
    ['GESTOR', 'GESTOR'],
    ['GESTOR', 'AUTOAVALIACAO'],
    ['GERENCIA_RH', 'GESTOR'],
    ['GERENCIA_RH', 'AUTOAVALIACAO'],
    ['DIRETORIA', 'DIRETORIA_GERENCIA'],
    ['DIRETORIA', 'AUTOAVALIACAO'],
  ] as const)(
    '%s: remove a opção de %s após criar e voltar pela navegação real',
    async (role, type) => {
      const cycle = { id: 'cycle-2024', name: 'Ciclo fictício dos perfis' }
      const person = { id: 'person-1', displayName: 'Pessoa fictícia vinculada' }
      const teamType = role === 'DIRETORIA' ? 'DIRETORIA_GERENCIA' : 'GESTOR'
      const teamCycleLabel = `Ciclo para avaliação de ${role === 'DIRETORIA' ? 'Diretoria' : 'gestor'}`
      const cycleLabel = type === 'AUTOAVALIACAO' ? 'Ciclo para autoavaliação' : teamCycleLabel
      const untouchedCycleLabel =
        type === 'AUTOAVALIACAO' ? teamCycleLabel : 'Ciclo para autoavaliação'
      const detail = {
        ...sampleAssessment(),
        type,
        cycle,
        evaluated: { displayName: person.displayName },
      }
      let created = false
      const api = createApi({
        currentUser: vi.fn().mockResolvedValue({
          id: 'review-profile-1',
          displayName: 'Conta fictícia de conferência',
          roles: [role],
          permissions: [
            role === 'DIRETORIA'
              ? 'AVALIACOES.AVALIAR_GERENCIAS_VINCULADAS'
              : 'AVALIACOES.AVALIAR_VINCULADOS',
            'AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS',
            'AUTOAVALIACOES.PREENCHER_PROPRIA',
            'AUTOAVALIACOES.ENVIAR_PROPRIA',
            'AUTOAVALIACOES.VISUALIZAR_PROPRIA',
            ...(role === 'GESTOR' ? [] : ['AVALIACOES.VISUALIZAR_TODAS', 'ACESSOS.NEGOCIO.GERIR']),
          ],
        }),
        listAssessmentCreationCycleOptions: vi.fn(async (requested) =>
          created && requested === type ? [] : [cycle],
        ),
        listManagerAssessmentCreationOptions: vi.fn(async () =>
          created && type === 'GESTOR' ? [] : [person],
        ),
        listDirectorAssessmentCreationOptions: vi.fn(async () =>
          created && type === 'DIRETORIA_GERENCIA' ? [] : [person],
        ),
        listAssessments: vi.fn(async () => ({
          items: created ? [detail] : [],
          page: { limit: 2, nextCursor: null },
        })),
        createAssessment: vi.fn(async () => {
          created = true
          return detail
        }),
        getAssessment: vi.fn().mockResolvedValue(detail),
      })
      renderWithExistingSession(api, '/avaliacoes')
      const cycleSelect = await screen.findByLabelText(cycleLabel)
      await waitFor(() => expect(cycleSelect).toBeEnabled())
      expect(screen.getByLabelText(untouchedCycleLabel)).toBeInTheDocument()
      expect(api.listAssessmentCreationCycleOptions).toHaveBeenCalledWith(teamType)
      expect(api.listAssessmentCreationCycleOptions).toHaveBeenCalledWith('AUTOAVALIACAO')
      expect(
        screen.queryByLabelText(
          role === 'DIRETORIA'
            ? 'Ciclo para avaliação de gestor'
            : 'Ciclo para avaliação de Diretoria',
        ),
      ).toBeNull()
      fireEvent.change(cycleSelect, { target: { value: cycle.id } })
      if (type !== 'AUTOAVALIACAO') {
        const personSelect = screen.getByLabelText(
          role === 'DIRETORIA' ? 'Gerência autorizada' : 'Colaborador autorizado',
        )
        await waitFor(() => expect(personSelect).toBeEnabled())
        expect(
          within(personSelect).getByRole('option', { name: person.displayName }),
        ).toBeInTheDocument()
        fireEvent.change(personSelect, { target: { value: person.id } })
      }
      fireEvent.click(
        screen.getByRole('button', {
          name:
            type === 'AUTOAVALIACAO'
              ? 'Criar autoavaliação'
              : `Criar avaliação de ${role === 'DIRETORIA' ? 'Diretoria' : 'gestor'}`,
        }),
      )
      const back = await screen.findByRole('button', { name: 'Voltar para a lista' })
      expect(window.location.pathname).toBe(`/avaliacoes/${detail.id}`)
      fireEvent.click(back)
      await waitFor(() => expect(screen.getByLabelText(untouchedCycleLabel)).toBeEnabled())
      expect(window.location.pathname).toBe('/avaliacoes')
      expect(screen.queryByLabelText(cycleLabel)).toBeNull()
      expect(screen.queryByRole('option', { name: person.displayName })).toBeNull()
      expect(
        within(screen.getByLabelText(untouchedCycleLabel)).getByRole('option', {
          name: cycle.name,
        }),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Abrir avaliação' })).toBeInTheDocument()
      expect(api.createAssessment).toHaveBeenCalledExactlyOnceWith({
        type,
        cycleId: cycle.id,
        ...(type === 'AUTOAVALIACAO' ? {} : { collaboratorId: person.id }),
      })
    },
  )

  it.each([
    ['Administrador técnico', 'ADMINISTRADOR_PLATAFORMA', false],
    ['Administrador supremo', 'ADMINISTRADOR_PLATAFORMA', true],
    ['Colaborador comum', 'COLABORADOR', false],
  ] as const)(
    '%s: não oferece criação nem consulta opções de avaliação',
    async (_label, role, supremeAdministrator) => {
      const api = createApi({
        currentUser: vi.fn().mockResolvedValue({
          id: 'review-restricted-1',
          displayName: 'Conta fictícia sem avaliação',
          roles: [role],
          supremeAdministrator,
          permissions: role === 'COLABORADOR' ? [] : ['USUARIOS.LER', 'CADASTROS.GERIR'],
        }),
      })
      renderWithExistingSession(api, '/avaliacoes')
      await screen.findByRole('button', { name: 'Abrir menu' })
      expect(screen.queryByRole('heading', { name: /Criar (autoavaliação|avaliação)/ })).toBeNull()
      expect(api.listAssessments).not.toHaveBeenCalled()
      expect(api.listAssessmentCreationCycleOptions).not.toHaveBeenCalled()
      expect(api.listManagerAssessmentCreationOptions).not.toHaveBeenCalled()
      expect(api.listDirectorAssessmentCreationOptions).not.toHaveBeenCalled()
      expect(api.createAssessment).not.toHaveBeenCalled()
    },
  )

  it('abre avaliações e indicadores para o supremo selecionado em modo de consulta', async () => {
    const detail = sampleAssessment()
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'supremo-de-demonstracao',
        displayName: 'Supremo de demonstração',
        roles: ['ADMINISTRADOR_PLATAFORMA'],
        supremeAdministrator: true,
        permissions: ['USUARIOS.LER', 'SUPREMO.CONSULTAR'],
      }),
      listAssessments: vi.fn().mockResolvedValue([detail]),
      getAssessment: vi.fn().mockResolvedValue(detail),
      listCycles: vi.fn().mockResolvedValue([detail.cycle]),
      getIndicators: vi.fn().mockResolvedValue({ availability: 'DADOS_INSUFICIENTES' }),
    })
    renderWithExistingSession(api, '/avaliacoes')
    expect(await screen.findByRole('heading', { name: 'Avaliações individuais' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Exportar Excel' })).toBeNull()
    expect(api.listAssessmentCreationCycleOptions).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir avaliação' }))
    for (const option of await screen.findAllByRole('radio')) expect(option).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: /Imprimir|Salvar rascunho|Enviar avaliação/ }),
    ).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }))
    expect(screen.getByText('Perfil: Administrador supremo')).toBeVisible()
    fireEvent.click(screen.getByRole('link', { name: 'Indicadores' }))
    fireEvent.click(await screen.findByText('Consulta detalhada de indicadores'))
    const cycle = screen.getByLabelText('Ciclo de avaliação')
    await waitFor(() => expect(cycle).toBeEnabled())
    fireEvent.change(cycle, { target: { value: detail.cycle.id } })
    const query = screen.getByRole('button', { name: 'Consultar indicadores' })
    await waitFor(() => expect(query).toBeEnabled())
    fireEvent.click(query)
    expect(
      await screen.findByText('Dados insuficientes para preservar a confidencialidade.'),
    ).toBeVisible()
    expect(api.getIndicators).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Exportar CSV agregado' })).toBeNull()
  })

  it('abre o login com o cliente HTTP real sem consultar rotas que exigem sessão', async () => {
    const fetchMock = vi.fn((url: string) => {
      const body = url.endsWith('/auth/csrf')
        ? { token: 'csrf-synthetic' }
        : { authenticated: false }
      const status = url.endsWith('/auth/me') || url.endsWith('/auth/sessions/refresh') ? 401 : 200
      return Promise.resolve(new Response(JSON.stringify(body), { status }))
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      render(
        <StrictMode>
          <App api={new HttpApiClient()} />
        </StrictMode>,
      )
      expect(await screen.findByLabelText('E-mail ou login')).toBeInTheDocument()
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        '/api/v1/auth/csrf',
        '/api/v1/auth/sessions/restore',
      ])
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('restaura a sessão uma única vez na inicialização em StrictMode', async () => {
    const api = createApi({
      restoreSession: vi.fn().mockResolvedValue({
        id: 'user-1',
        displayName: 'Sessão fictícia retomada',
        permissions: [],
      }),
    })
    render(
      <StrictMode>
        <App api={api} />
      </StrictMode>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir menu' }))
    expect(
      await within(screen.getByRole('dialog', { name: 'Menu de módulos' })).findByText(
        'Sessão fictícia retomada',
        { selector: 'strong' },
      ),
    ).toBeVisible()
    expect(api.restoreSession).toHaveBeenCalledTimes(1)
    expect(api.currentUser).not.toHaveBeenCalled()
    expect(api.refreshSession).not.toHaveBeenCalled()
  })

  it('apresenta o login sem repetir a tentativa de sessão ausente em StrictMode', async () => {
    const api = createApi({
      restoreSession: vi.fn().mockResolvedValue(null),
    })
    render(
      <StrictMode>
        <App api={api} />
      </StrictMode>,
    )
    expect(await screen.findByRole('heading', { name: 'Acesso à plataforma' })).toBeInTheDocument()
    expect(api.restoreSession).toHaveBeenCalledTimes(1)
    expect(api.currentUser).not.toHaveBeenCalled()
    expect(api.refreshSession).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('não continua a restauração quando a resposta chega após sair da aplicação', async () => {
    let resolve!: (user: CurrentUser | null) => void
    const api = createApi({
      restoreSession: vi.fn(
        () =>
          new Promise<CurrentUser | null>((done) => {
            resolve = done
          }),
      ),
    })
    const { unmount } = render(<App api={api} />)
    await waitFor(() => expect(api.restoreSession).toHaveBeenCalledTimes(1))
    unmount()
    await act(async () => resolve(null))
    expect(api.refreshSession).not.toHaveBeenCalled()
    expect(api.currentUser).not.toHaveBeenCalled()
  })

  it('não mostra o login enquanto restaura uma sessão ao atualizar a página', async () => {
    let resolveCurrentUser: (user: CurrentUser | null) => void = () => undefined
    const api = createApi({
      currentUser: vi.fn(
        () =>
          new Promise<CurrentUser | null>((resolve) => {
            resolveCurrentUser = resolve
          }),
      ),
    })

    render(<App api={api} />)

    expect(
      screen.getByRole('heading', { name: 'Restaurando sua sessão' }).closest('[role=status]'),
    ).not.toBeNull()
    expect(screen.queryByRole('heading', { name: 'Acesso à plataforma' })).not.toBeInTheDocument()

    await waitFor(() => expect(api.currentUser).toHaveBeenCalledTimes(1))
    resolveCurrentUser({ id: 'user-1', displayName: 'Sessão preservada', permissions: [] })

    fireEvent.click(await screen.findByRole('button', { name: 'Abrir menu' }))
    expect(
      await within(screen.getByRole('dialog', { name: 'Menu de módulos' })).findByText(
        'Sessão preservada',
        { selector: 'strong' },
      ),
    ).toBeVisible()
    expect(screen.queryByText('Restaurando sua sessão')).not.toBeInTheDocument()
  })

  it('verifica automaticamente uma sessão antes de apresentar o login', async () => {
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
    expect(screen.getByText('Avaliação de desempenho')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ativar modo escuro' })).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      'Todos os direitos reservados à Rodogarcia.',
    )
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Desenvolvido por Lucas Andrade')
    expect(screen.getByRole('complementary', { name: 'Sobre esta página' })).toHaveTextContent(
      'Avaliações de desempenho',
    )
    expect(api.refreshSession).toHaveBeenCalledTimes(1)
    expect(api.currentUser).toHaveBeenCalledTimes(2)
  })

  it('troca o tema de imediato, preserva o login digitado e restaura a preferência ao remontar', async () => {
    window.localStorage.setItem('adc-theme', 'light')
    const api = createApi()
    try {
      const { unmount } = render(<App api={api} />)
      fireEvent.change(await screen.findByLabelText('E-mail ou login'), {
        target: { value: 'conta-ficticia' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Ativar modo escuro' }))
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
      expect(document.querySelector('.adc-theme-curtain')).toBeNull()
      expect(screen.getByLabelText('E-mail ou login')).toHaveValue('conta-ficticia')
      expect(window.localStorage.getItem('adc-theme')).toBe('dark')
      expect(api.signIn).not.toHaveBeenCalled()
      unmount()
      render(<App api={api} />)
      await screen.findByLabelText('E-mail ou login')
      expect(screen.getByRole('button', { name: 'Ativar modo claro' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      expect(document.querySelector('.adc-theme-curtain')).toBeNull()
    } finally {
      window.localStorage.removeItem('adc-theme')
      document.documentElement.dataset.theme = 'light'
    }
  })

  it('renova automaticamente uma sessão cujo token de acesso expirou', async () => {
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue(null),
      refreshSession: vi.fn().mockResolvedValue({
        id: 'user-1',
        displayName: 'Sessão retomada',
        permissions: [],
      }),
    })

    render(<App api={api} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Abrir menu' }))
    expect(
      await within(screen.getByRole('dialog', { name: 'Menu de módulos' })).findByText(
        'Sessão retomada',
        { selector: 'strong' },
      ),
    ).toBeVisible()
    expect(api.refreshSession).toHaveBeenCalledTimes(1)
    expect(api.currentUser).toHaveBeenCalledTimes(1)
  })

  it('mantém automaticamente uma sessão com token de acesso ainda válido', async () => {
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'user-1',
        displayName: 'Sessão preservada',
        permissions: [],
      }),
    })

    render(<App api={api} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Abrir menu' }))
    expect(
      await within(screen.getByRole('dialog', { name: 'Menu de módulos' })).findByText(
        'Sessão preservada',
        { selector: 'strong' },
      ),
    ).toBeVisible()
    expect(api.currentUser).toHaveBeenCalledTimes(1)
    expect(api.refreshSession).not.toHaveBeenCalled()
  })

  it('volta ao login ao sair mesmo que o servidor não confirme o encerramento', async () => {
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'user-1',
        displayName: 'Pessoa autenticada',
        permissions: [],
      }),
      signOut: vi.fn().mockRejectedValue(new ApiError({ status: 401 })),
    })

    renderWithExistingSession(api)

    const signOut = await screen.findByRole('button', { name: 'Sair da conta' })
    expect(screen.getByRole('banner')).toContainElement(signOut)
    fireEvent.click(signOut)

    expect(await screen.findByLabelText('E-mail ou login')).toBeInTheDocument()
    expect(api.signOut).toHaveBeenCalledTimes(1)
    expect(
      screen.getByText('Sua sessão não está disponível. Entre novamente para continuar.'),
    ).toBeInTheDocument()
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

    fireEvent.click(await screen.findByRole('button', { name: 'Abrir menu' }))
    fireEvent.click(await screen.findByRole('link', { name: 'Rodogarcia, ir para o início' }))

    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(screen.getByRole('heading', { name: 'Avaliações de desempenho' })).toBeInTheDocument()
  })

  it('mantém a sessão e explica quando a rota interna não existe', async () => {
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'indicator-reader-1',
        displayName: 'Leitor de indicadores',
        permissions: ['INDICADORES.VISUALIZAR'],
      }),
    })

    const { container } = renderWithExistingSession(api, '/endereco-inexistente')

    expect(
      await screen.findByRole('heading', { name: 'Página não encontrada' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Sua sessão continua ativa\./)).toBeInTheDocument()
    expect(screen.queryByLabelText('E-mail ou login')).not.toBeInTheDocument()

    const accessibilityResult = await axe(container, {
      rules: {
        'color-contrast': { enabled: false },
      },
    })
    expect(accessibilityResult.violations).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Ir para a página inicial' }))

    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(screen.getByRole('heading', { name: 'Avaliações de desempenho' })).toBeInTheDocument()
  })

  it('mantém a sessão e explica ao abrir um módulo não autorizado', async () => {
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'indicator-reader-1',
        displayName: 'Leitor de indicadores',
        permissions: ['INDICADORES.VISUALIZAR'],
      }),
    })

    renderWithExistingSession(api, '/administracao/usuarios')

    expect(
      await screen.findByRole('heading', { name: 'Acesso não disponível' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Sua sessão continua ativa, mas seu perfil não possui permissão/),
    ).toBeInTheDocument()
    expect(api.listAdministrationUsers).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('E-mail ou login')).not.toBeInTheDocument()
  })

  it('explica falha de credenciais sem revelar o estado da conta', async () => {
    const api = createApi({ signIn: vi.fn().mockRejectedValue(new ApiError({ status: 401 })) })
    render(<App api={api} />)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Acessar plataforma' })).not.toBeDisabled(),
    )

    fireEvent.change(screen.getByLabelText('E-mail ou login'), {
      target: { value: 'conta-teste' },
    })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-incorreta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Acessar plataforma' }))

    expect(
      await screen.findByText(
        'Não foi possível autenticar. Revise o login e a senha. Após várias tentativas incorretas, aguarde 15 minutos antes de tentar novamente ou peça ajuda à administração.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Sua sessão não está disponível. Entre novamente para continuar.'),
    ).not.toBeInTheDocument()
  })

  it('confere os sete indicadores, os três gráficos e a troca de ciclo', async () => {
    const dashboard = {
      metrics: {
        collaborators: 18,
        assessments: 22,
        managers: 2,
        managerSelfAssessments: 5,
        averagePercent: 87.2,
        finalizedPercent: 72.7,
        feedbackPercent: 57.1,
      },
      byBranch: [{ label: 'Matriz de teste', averagePercent: 100 }],
      byArea: [{ label: 'Operações', averagePercent: 96.4 }],
      byItem: [{ label: 'Comunicação', averagePercent: 83.3 }],
    }
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'rh-test',
        displayName: 'RH de teste',
        roles: ['GERENCIA_RH'],
        permissions: ['INDICADORES.VISUALIZAR'],
      }),
      listAllCycles: vi.fn().mockResolvedValue([
        { id: 'previous', name: 'Ciclo anterior', status: 'ENCERRADO' },
        { id: 'current', name: 'Ciclo atual', status: 'ABERTO', windowStatus: 'VIGENTE' },
        { id: 'future', name: 'Ciclo planejado', status: 'RASCUNHO' },
      ]),
      getIndicatorDashboard: vi
        .fn()
        .mockResolvedValueOnce(dashboard)
        .mockResolvedValue({
          metrics: {
            collaborators: null,
            assessments: null,
            managers: null,
            managerSelfAssessments: null,
            averagePercent: null,
            finalizedPercent: null,
            feedbackPercent: null,
          },
          byBranch: [],
          byArea: [],
          byItem: [],
        }),
    })

    renderWithExistingSession(api, '/indicadores')
    expect(await screen.findByText('Matriz de teste')).toBeVisible()
    expect(screen.getByText('Operações')).toBeVisible()
    expect(screen.getByText('Comunicação')).toBeVisible()
    for (const label of ['18', '22', '2', '5', '87,2%', '72,7%', '57,1%']) {
      expect(screen.getByText(label)).toBeVisible()
    }
    const select = screen.getByLabelText('Ciclo do painel')
    expect(select).toHaveValue('current')
    expect(select).not.toHaveTextContent('Ciclo planejado')
    fireEvent.change(select, { target: { value: 'previous' } })
    expect(
      await screen.findByText(
        'Dados insuficientes para preservar a confidencialidade neste ciclo.',
      ),
    ).toBeVisible()
    expect(screen.queryByText('Matriz de teste')).toBeNull()
    expect(api.getIndicatorDashboard).toHaveBeenLastCalledWith('previous')
  })

  it('encontra pendentes e abre somente uma avaliação já iniciada', async () => {
    const detail = sampleAssessment()
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'rh-test',
        displayName: 'RH de teste',
        roles: ['GERENCIA_RH'],
        permissions: ['AVALIACOES.VISUALIZAR_TODAS'],
      }),
      listAllCycles: vi
        .fn()
        .mockResolvedValue([{ id: 'cycle-sample', name: 'Ciclo demonstrativo', status: 'ABERTO' }]),
      listAssessmentCoverage: vi
        .fn()
        .mockResolvedValueOnce({
          items: [
            {
              collaboratorId: 'one',
              displayName: 'Pessoa sem rascunho',
              managerName: null,
              assessmentId: null,
            },
          ],
          hasNextPage: false,
        })
        .mockResolvedValue({
          items: [
            {
              collaboratorId: 'two',
              displayName: 'Pessoa com rascunho',
              managerName: 'Gestora de teste',
              assessmentId: detail.id,
            },
          ],
          hasNextPage: false,
        }),
      getAssessment: vi.fn().mockResolvedValue(detail),
    })
    renderWithExistingSession(api, '/avaliacoes')
    fireEvent.click(await screen.findByRole('button', { name: 'Acompanhar início' }))
    expect(await screen.findByText('Pessoa sem rascunho')).toBeVisible()
    expect(screen.getByText('Sem gestor vinculado')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Abrir avaliação' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Exportar Excel' })).toBeNull()
    expect(api.listAssessmentCoverage).toHaveBeenLastCalledWith({
      cycleId: 'cycle-sample',
      status: 'PENDENTE',
      evaluatedName: undefined,
      managerName: undefined,
      page: 1,
      limit: 12,
    })
    fireEvent.change(screen.getByLabelText('Início da avaliação'), {
      target: { value: 'INICIADA' },
    })
    fireEvent.change(screen.getByLabelText('Nome do colaborador'), {
      target: { value: ' rascunho ' },
    })
    fireEvent.change(screen.getByLabelText('Gestor responsável'), {
      target: { value: ' Gestora ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    expect(await screen.findByText('Pessoa com rascunho')).toBeVisible()
    expect(screen.getByRole('columnheader', { name: 'Gestor responsável' })).toBeVisible()
    expect(screen.getByText('Gestora de teste')).toBeVisible()
    expect(api.listAssessmentCoverage).toHaveBeenLastCalledWith({
      cycleId: 'cycle-sample',
      status: 'INICIADA',
      evaluatedName: 'rascunho',
      managerName: 'Gestora',
      page: 1,
      limit: 12,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Abrir avaliação' }))
    await waitFor(() => expect(api.getAssessment).toHaveBeenCalledWith(detail.id))
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

    fireEvent.click(await screen.findByText('Consulta detalhada de indicadores'))
    await waitFor(() =>
      expect(screen.getByLabelText('Ciclo de avaliação')).toHaveTextContent('Ciclo 2024'),
    )
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
    expect(insufficientDataMessage.closest('.astryx-banner')).toHaveAttribute(
      'data-status',
      'warning',
    )
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

    const table = await screen.findByRole('table', { name: 'Lista de avaliações' })
    const assessment = within(table).getAllByRole('row')[1]
    expect(screen.queryByText('Ciclo de avaliação')).not.toBeInTheDocument()
    expect(within(assessment).getByLabelText('Situação: Publicada')).toBeInTheDocument()
    expect(within(assessment).getByText('Avaliação de gestor')).toBeInTheDocument()
  })

  it('salva as respostas atuais antes de enviar e oferece impressão do resumo', async () => {
    const draftAssessment: AssessmentDetail = {
      ...sampleManagerAssessmentWithOptionalQuestion(),
      actionPlan: 'Plano histórico que deve ser preservado.',
    }
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
    expect(screen.queryByLabelText('Plano de ação opcional')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Dentro das expectativas'))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar avaliação' }))

    await waitFor(() =>
      expect(api.saveAssessment).toHaveBeenCalledWith(
        draftAssessment.id,
        {
          answers: [{ questionId: 'question-1', optionId: 'option-1' }],
          actionPlan: 'Plano histórico que deve ser preservado.',
        },
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
    expect(document.querySelector('.assessment-editor__print-heading')).toHaveTextContent(
      'Resumo individual de desempenho',
    )
    expect(screen.getByLabelText('Assinatura do colaborador')).toBeInTheDocument()
    expect(screen.getByText('Data')).toBeInTheDocument()
  })

  it('permite ao colaborador criar uma autoavaliação em ciclo autorizado', async () => {
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'collaborator-1',
        displayName: 'Colaborador autorizado',
        permissions: ['AUTOAVALIACOES.PREENCHER_PROPRIA', 'AUTOAVALIACOES.VISUALIZAR_PROPRIA'],
      }),
      listAssessmentCreationCycleOptions: vi
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
      listAssessmentCreationCycleOptions: vi
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

  it('oferece avaliação de equipe e autoavaliação para a Gerência de RH avaliadora', async () => {
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'rh-1',
        displayName: 'Gerência de RH avaliadora',
        roles: ['GERENCIA_RH'],
        permissions: [
          'AVALIACOES.AVALIAR_VINCULADOS',
          'AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS',
          'AVALIACOES.REGISTRAR_FEEDBACK_PROPRIO',
          'AUTOAVALIACOES.PREENCHER_PROPRIA',
          'AUTOAVALIACOES.ENVIAR_PROPRIA',
          'AUTOAVALIACOES.VISUALIZAR_PROPRIA',
        ],
      }),
    })

    renderWithExistingSession(api, '/')

    expect(
      await screen.findByRole('heading', { name: 'Avaliações de desempenho' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Avaliar minha equipe/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Minha autoavaliação/ })).toBeInTheDocument()
    expect(screen.queryByText('Nenhuma jornada disponível')).not.toBeInTheDocument()
  })

  it('mostra somente ciclos de Diretoria que o servidor confirmou como elegíveis', async () => {
    const listAssessmentCreationCycleOptions = vi.fn((type: string) =>
      Promise.resolve(
        type === 'DIRETORIA_GERENCIA'
          ? [{ id: 'cycle-eligible', name: 'Ciclo de teste de perfis DEV' }]
          : [],
      ),
    )
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'director-1',
        displayName: 'Diretoria autorizada',
        permissions: ['AVALIACOES.AVALIAR_GERENCIAS_VINCULADAS'],
        roles: ['DIRETORIA'],
      }),
      listAssessmentCreationCycleOptions,
    })

    renderWithExistingSession(api, '/avaliacoes')

    expect(
      await screen.findByRole('option', { name: 'Ciclo de teste de perfis DEV' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: 'Demonstração DEV — radar com 5 perfis' }),
    ).not.toBeInTheDocument()
    expect(listAssessmentCreationCycleOptions).toHaveBeenCalledWith('DIRETORIA_GERENCIA')
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

    expect(screen.getByRole('link', { name: 'Minhas avaliações' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.queryByRole('button', { name: 'Nova avaliação' })).not.toBeInTheDocument()
  })

  it.each(['GERENCIA_RH', 'GESTOR', 'DIRETORIA'])(
    'permite a %s publicar uma avaliação enviada quando a API autoriza',
    async (role) => {
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
          roles: [role],
          permissions:
            role === 'GESTOR'
              ? ['AVALIACOES.AVALIAR_VINCULADOS', 'AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS']
              : ['AVALIACOES.VISUALIZAR_TODAS', 'AVALIACOES.PUBLICAR'],
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
    },
  )

  it.each(['COLABORADOR', 'GESTOR', 'GERENCIA_RH', 'DIRETORIA'])(
    'permite a %s publicar a própria autoavaliação enviada com autorização individual',
    async (role) => {
      const detail: AssessmentDetail = {
        ...sampleAssessment(),
        type: 'AUTOAVALIACAO',
        status: 'ENVIADA',
        allowedActions: {
          edit: false,
          submit: false,
          publish: true,
          reopen: false,
          completeFeedback: false,
        },
        result: { finalScore: 100, classification: { label: 'Dentro das expectativas' } },
      }
      const api = createApi({
        currentUser: vi.fn().mockResolvedValue({
          id: 'self-author',
          displayName: 'Pessoa fictícia',
          roles: [role],
          permissions: ['AUTOAVALIACOES.ENVIAR_PROPRIA'],
        }),
        listAssessments: vi.fn().mockResolvedValue([detail]),
        getAssessment: vi.fn().mockResolvedValue(detail),
        publishAssessment: vi.fn().mockResolvedValue({
          ...detail,
          status: 'PUBLICADA',
          allowedActions: { ...detail.allowedActions!, publish: false },
        }),
      })

      renderWithExistingSession(api, '/avaliacoes')
      fireEvent.click(await screen.findByRole('button', { name: 'Abrir avaliação' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Publicar avaliação' }))

      expect(await screen.findByText('Avaliação publicada com sucesso.')).toBeInTheDocument()
      expect(api.publishAssessment).toHaveBeenCalledExactlyOnceWith(detail.id)
      expect(screen.queryByRole('button', { name: 'Publicar avaliação' })).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Motivo da reabertura')).not.toBeInTheDocument()
      expect(screen.getByText('Não se aplica a autoavaliações.')).toBeInTheDocument()
    },
  )

  it.each([
    { role: 'COLABORADOR', permission: 'AUTOAVALIACOES.ENVIAR_PROPRIA', publish: false },
    { role: 'GESTOR', permission: 'AUTOAVALIACOES.ENVIAR_PROPRIA', publish: undefined },
    { role: 'COLABORADOR', permission: 'AUTOAVALIACOES.VISUALIZAR_PROPRIA', publish: true },
    { role: 'COLABORADOR', permission: 'AUTOAVALIACOES.PREENCHER_PROPRIA', publish: true },
    {
      role: 'ADMINISTRADOR_PLATAFORMA',
      permission: 'AUTOAVALIACOES.ENVIAR_PROPRIA',
      publish: true,
    },
  ])('não amplia a publicação da autoavaliação sem as duas autorizações (%s)', async (scenario) => {
    const detail: AssessmentDetail = {
      ...sampleAssessment(),
      id: 'self-or-foreign-assessment',
      type: 'AUTOAVALIACAO',
      status: 'ENVIADA',
      allowedActions:
        scenario.publish === undefined
          ? undefined
          : {
              edit: false,
              submit: false,
              publish: scenario.publish,
              reopen: false,
              completeFeedback: false,
            },
    }
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'self-author',
        displayName: 'Pessoa fictícia',
        roles: [scenario.role],
        permissions: [scenario.permission],
      }),
      listAssessments: vi.fn().mockResolvedValue([detail]),
      getAssessment: vi.fn().mockResolvedValue(detail),
    })

    renderWithExistingSession(api, '/avaliacoes')
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir avaliação' }))

    expect(
      await screen.findByText(
        'Esta avaliação está disponível somente para consulta com as permissões atuais.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Publicar avaliação' })).not.toBeInTheDocument()
    expect(api.publishAssessment).not.toHaveBeenCalled()
  })

  it('preserva envio e publicação como etapas distintas sem duplicar operações pendentes', async () => {
    const draft: AssessmentDetail = {
      ...sampleAssessment(),
      type: 'AUTOAVALIACAO',
      allowedActions: {
        edit: true,
        submit: true,
        publish: false,
        reopen: false,
        completeFeedback: false,
      },
    }
    const saved: AssessmentDetail = { ...draft, revision: 'saved-revision' }
    const submitted: AssessmentDetail = {
      ...saved,
      status: 'ENVIADA',
      allowedActions: { ...draft.allowedActions!, edit: false, submit: false, publish: true },
      result: { finalScore: 100, classification: { label: 'Dentro das expectativas' } },
    }
    let resolveSave!: (value: AssessmentDetail) => void
    let resolvePublish!: (value: AssessmentDetail) => void
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'self-author',
        displayName: 'Pessoa fictícia',
        roles: ['COLABORADOR'],
        permissions: ['AUTOAVALIACOES.PREENCHER_PROPRIA', 'AUTOAVALIACOES.ENVIAR_PROPRIA'],
      }),
      listAssessments: vi.fn().mockResolvedValue([draft]),
      getAssessment: vi.fn().mockResolvedValue(draft),
      saveAssessment: vi.fn().mockImplementation(
        () =>
          new Promise<AssessmentDetail>((resolve) => {
            resolveSave = resolve
          }),
      ),
      submitAssessment: vi.fn().mockResolvedValue(submitted),
      publishAssessment: vi.fn().mockImplementation(
        () =>
          new Promise<AssessmentDetail>((resolve) => {
            resolvePublish = resolve
          }),
      ),
    })

    renderWithExistingSession(api, '/avaliacoes')
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir avaliação' }))
    fireEvent.click(await screen.findByLabelText(/Dentro das expectativas/))
    expect(screen.queryByRole('button', { name: 'Publicar avaliação' })).not.toBeInTheDocument()
    const submit = screen.getByRole('button', { name: 'Enviar avaliação' })
    fireEvent.click(submit)
    expect(submit).toBeDisabled()
    fireEvent.click(submit)
    expect(api.saveAssessment).toHaveBeenCalledTimes(1)
    expect(api.submitAssessment).not.toHaveBeenCalled()
    expect(api.publishAssessment).not.toHaveBeenCalled()
    await act(async () => resolveSave(saved))

    const publish = await screen.findByRole('button', { name: 'Publicar avaliação' })
    expect(api.submitAssessment).toHaveBeenCalledExactlyOnceWith(draft.id, 'saved-revision')
    expect(screen.queryByRole('button', { name: 'Enviar avaliação' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar rascunho' })).not.toBeInTheDocument()
    expect(await screen.findByRole('radio', { name: /Dentro das expectativas/ })).toBeDisabled()
    fireEvent.click(publish)
    expect(publish).toBeDisabled()
    fireEvent.click(publish)
    expect(api.publishAssessment).toHaveBeenCalledExactlyOnceWith(draft.id)
    await act(async () =>
      resolvePublish({
        ...submitted,
        status: 'PUBLICADA',
        allowedActions: { ...submitted.allowedActions!, publish: false },
      }),
    )

    expect(await screen.findByText('Avaliação publicada com sucesso.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Publicar avaliação' })).not.toBeInTheDocument()
  })

  it('não mostra sucesso de publicação da própria autoavaliação quando o servidor recusa', async () => {
    const detail: AssessmentDetail = {
      ...sampleAssessment(),
      type: 'AUTOAVALIACAO',
      status: 'ENVIADA',
    }
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'self-author',
        displayName: 'Pessoa fictícia',
        roles: ['COLABORADOR'],
        permissions: ['AUTOAVALIACOES.ENVIAR_PROPRIA'],
      }),
      listAssessments: vi.fn().mockResolvedValue([detail]),
      getAssessment: vi.fn().mockResolvedValue(detail),
      publishAssessment: vi
        .fn()
        .mockRejectedValue(new ApiError({ status: 403, code: 'ASSESSMENT_ACCESS_DENIED' })),
    })

    renderWithExistingSession(api, '/avaliacoes')
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir avaliação' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Publicar avaliação' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Avaliação publicada com sucesso.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publicar avaliação' })).toBeEnabled()
    expect(api.publishAssessment).toHaveBeenCalledExactlyOnceWith(detail.id)
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

  it('não carrega o catálogo administrativo de colaboradores para Diretoria', async () => {
    const listCollaborators = vi.fn().mockRejectedValue(new ApiError({ status: 403 }))
    const api = createApi({
      currentUser: vi.fn().mockResolvedValue({
        id: 'director-1',
        displayName: 'Diretoria autorizada',
        permissions: [
          'ACESSOS.NEGOCIO.GERIR',
          'AVALIACOES.VISUALIZAR_TODAS',
          'AVALIACOES.AVALIAR_GERENCIAS_VINCULADAS',
          'AUTOAVALIACOES.PREENCHER_PROPRIA',
          'AUTOAVALIACOES.ENVIAR_PROPRIA',
          'AUTOAVALIACOES.VISUALIZAR_PROPRIA',
        ],
        roles: ['DIRETORIA'],
      }),
      listCollaborators,
      listAssessments: vi.fn().mockResolvedValue([]),
    })

    renderWithExistingSession(api, '/avaliacoes')

    expect(
      await screen.findByRole('heading', { name: 'Avaliações individuais' }),
    ).toBeInTheDocument()
    expect(listCollaborators).not.toHaveBeenCalled()
    expect(screen.queryByText('Você não possui acesso a esta operação.')).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Criar avaliação de Diretoria' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Criar autoavaliação' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Localizar avaliação' })).not.toBeInTheDocument()
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

    fireEvent.click(await screen.findByText('Consulta detalhada de indicadores'))
    await waitFor(() =>
      expect(screen.getByLabelText('Ciclo de avaliação')).toHaveTextContent('Ciclo 2024'),
    )
    fireEvent.change(screen.getByLabelText('Ciclo de avaliação'), {
      target: { value: 'cycle-2024' },
    })
    await waitFor(() => expect(api.getIndicatorFilterOptions).toHaveBeenCalledWith('cycle-2024'))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Consultar indicadores' })).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Consultar indicadores' }))

    const resultHeading = await screen.findByRole('heading', { name: 'Resultado agregado' })
    expect(resultHeading.closest('.indicator-results')).toHaveClass('indicator-results--metric')
    expect(screen.getByText('Indicador disponível')).toBeInTheDocument()
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

    fireEvent.click(await screen.findByText('Consulta detalhada de indicadores'))
    await waitFor(() =>
      expect(screen.getByLabelText('Ciclo de avaliação')).toHaveTextContent('Ciclo 2024'),
    )
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

    fireEvent.click(await screen.findByText('Consulta detalhada de indicadores'))
    await waitFor(() =>
      expect(screen.getByLabelText('Ciclo de avaliação')).toHaveTextContent('Ciclo 2024'),
    )
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
    expect(screen.getByRole('link', { name: 'Contas e acessos' })).toHaveAttribute(
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
    fireEvent.click(within(drawer).getByRole('link', { name: 'Questionários' }))

    expect(await screen.findByRole('heading', { name: 'Questionários' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/administracao/questionarios')
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }))
    const reopenedDrawer = await screen.findByRole('dialog', { name: 'Menu de módulos' })
    expect(within(reopenedDrawer).getByRole('link', { name: 'Questionários' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      within(reopenedDrawer).queryByRole('link', { name: 'Contas e acessos' }),
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
    expect(within(drawer).getByRole('button', { name: 'Fechar navegação' })).toBeVisible()
    await waitFor(() => expect(drawer.contains(document.activeElement)).toBe(true))

    fireEvent(drawer, new Event('cancel', { cancelable: true }))
    await waitFor(() => expect(menuButton).toHaveFocus())
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    expect(drawer).not.toHaveAttribute('open')
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

    const scrollingRoot = document.scrollingElement ?? document.documentElement
    expect(getComputedStyle(scrollingRoot).overflow).toBe('hidden')

    fireEvent.click(within(drawer).getByRole('button', { name: 'Fechar navegação' }))

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
    fireEvent.change(screen.getByLabelText('Nova senha'), {
      target: { value: 'replacement-for-fixture' },
    })
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), {
      target: { value: 'replacement-for-fixture' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Alterar senha' }))

    await screen.findByLabelText('E-mail ou login')
    fireEvent.change(screen.getByLabelText('E-mail ou login'), {
      target: { value: 'administrador' },
    })
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: 'replacement-for-fixture' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Acessar plataforma' }))

    expect(await screen.findByRole('heading', { name: 'Contas locais' })).toBeInTheDocument()
    expect(api.changePassword).toHaveBeenCalledWith('initial', 'replacement-for-fixture')
    expect(api.signIn).toHaveBeenCalledWith('administrador', 'replacement-for-fixture')
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
    fireEvent.change(screen.getByLabelText('Nova senha'), {
      target: { value: 'replacement-for-fixture' },
    })
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), {
      target: { value: 'replacement-for-fixture' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Alterar senha' }))

    expect(await screen.findByLabelText('E-mail ou login')).toBeInTheDocument()
    expect(api.changePassword).toHaveBeenCalledWith('current', 'replacement-for-fixture')
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
        permissions: ['USUARIOS.LER'],
        roles: ['ADMINISTRADOR_PLATAFORMA'],
      }),
    })

    renderWithExistingSession(api)

    await screen.findByRole('button', { name: 'Ativar modo escuro' })
    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      'Todos os direitos reservados à Rodogarcia.',
    )
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Desenvolvido por Lucas Andrade')
    expect(screen.getByRole('link', { name: 'Lucas Andrade' })).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/dev-lucasandrade/',
    )
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Ativar modo escuro' }),
    ).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Conta ativa' })).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Sair da conta' }),
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }))
    const drawer = await screen.findByRole('dialog', { name: 'Menu de módulos' })
    expect(within(drawer).getByLabelText('Conta ativa')).toHaveTextContent('Pessoa')
    expect(within(drawer).getByText('Perfil: Administrador técnico')).toBeInTheDocument()
    const profileHelp = within(drawer).getByRole('button', {
      name: 'Entenda o que esta conta pode acessar',
    })
    fireEvent.mouseEnter(profileHelp)
    const profileTooltip = await screen.findByRole('tooltip')
    expect(profileTooltip).toHaveTextContent('contas e acessos')
    fireEvent.mouseLeave(profileHelp)
    fireEvent.mouseEnter(profileTooltip)
    await new Promise((resolve) => window.setTimeout(resolve, 220))
    expect(profileTooltip).toBeInTheDocument()
    fireEvent.mouseLeave(profileTooltip)
    fireEvent.click(profileHelp)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Vínculos, ciclo, questionário e escopo continuam validados pelo servidor.',
    )
    expect(within(drawer).queryByRole('button', { name: 'Sair da conta' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ativar modo escuro' }))

    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'dark'))
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
  return render(<App api={api} />)
}

function createApi(overrides: Partial<ApiClient> = {}): ApiClient {
  const currentUser = overrides.currentUser ?? vi.fn().mockResolvedValue(null)
  const refreshSession = overrides.refreshSession ?? vi.fn(() => currentUser())
  const listCycles = overrides.listCycles ?? vi.fn().mockResolvedValue([])
  const listAllCycles = overrides.listAllCycles ?? vi.fn(() => listCycles())
  const api = {
    currentUser,
    refreshSession,
    restoreSession: vi.fn(async () => (await currentUser()) ?? refreshSession()),
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    listAdministrationUsers: vi.fn().mockResolvedValue([]),
    listCycles,
    listAllCycles,
    listAssessments: vi.fn().mockResolvedValue([]),
    listAssessmentCoverage: vi.fn().mockResolvedValue({ items: [], hasNextPage: false }),
    listAssessmentCreationCycleOptions: vi.fn().mockResolvedValue([]),
    listManagerAssessmentCreationOptions: vi.fn().mockResolvedValue([]),
    listDirectorAssessmentCreationOptions: vi.fn().mockResolvedValue([]),
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
    getIndicatorDashboard: vi.fn().mockResolvedValue({
      metrics: {
        collaborators: null,
        assessments: null,
        managers: null,
        managerSelfAssessments: null,
        averagePercent: null,
        finalizedPercent: null,
        feedbackPercent: null,
      },
      byBranch: [],
      byArea: [],
      byItem: [],
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
    allowedActions: {
      edit: true,
      submit: true,
      publish: true,
      reopen: true,
      completeFeedback: true,
    },
    id: 'assessment-1',
    cycle: { id: 'cycle-2024', name: 'Ciclo 2024' },
    evaluated: { displayName: 'Colaborador autorizado' },
    type: 'GESTOR',
    status: 'RASCUNHO',
    feedbackStatus: 'NAO_APLICAVEL',
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
