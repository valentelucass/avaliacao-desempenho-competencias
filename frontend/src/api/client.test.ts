import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpApiClient } from './client'

describe('HttpApiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('usa cookies de credencial e envia o token CSRF somente em escrita', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'csrf-test-token' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    const api = new HttpApiClient()
    await api.signIn('gestor', '')

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/v1/auth/csrf',
      expect.objectContaining({ credentials: 'include' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/auth/sessions',
      expect.objectContaining({
        body: JSON.stringify({ login: 'gestor', password: '' }),
        credentials: 'include',
        headers: expect.any(Headers),
        method: 'POST',
      }),
    )

    const headers = fetchMock.mock.calls[1]?.[1]?.headers as Headers
    expect(headers.get('X-CSRF-TOKEN')).toBe('csrf-test-token')
  })

  it('obtém um novo token CSRF após o login antes da próxima operação protegida', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'csrf-before-sign-in' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({ token: 'csrf-after-sign-in' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    const api = new HttpApiClient()
    await api.signIn('gestor', 'senha-temporaria')
    await api.changePassword('senha-temporaria', 'senha-atualizada')

    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/v1/auth/csrf', expect.anything())

    const signInHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Headers
    const passwordHeaders = fetchMock.mock.calls[3]?.[1]?.headers as Headers
    expect(signInHeaders.get('X-CSRF-TOKEN')).toBe('csrf-before-sign-in')
    expect(passwordHeaders.get('X-CSRF-TOKEN')).toBe('csrf-after-sign-in')
  })

  it('renova o CSRF e repete uma vez o login quando o cookie anterior foi rotacionado', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'csrf-expirado' }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(jsonResponse({ token: 'csrf-atualizado' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    const api = new HttpApiClient()
    await expect(api.signIn('gestor', 'senha-temporaria')).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/auth/csrf', expect.anything())
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/auth/sessions',
      expect.objectContaining({ credentials: 'include', method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/v1/auth/csrf', expect.anything())
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/v1/auth/sessions',
      expect.objectContaining({ credentials: 'include', method: 'POST' }),
    )

    const firstHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Headers
    const secondHeaders = fetchMock.mock.calls[3]?.[1]?.headers as Headers
    expect(firstHeaders.get('X-CSRF-TOKEN')).toBe('csrf-expirado')
    expect(secondHeaders.get('X-CSRF-TOKEN')).toBe('csrf-atualizado')
  })

  it('renova o CSRF e repete uma escrita administrativa sem duplicá-la', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'csrf-expirado' }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(jsonResponse({ token: 'csrf-atualizado' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'branch-1' }))
    vi.stubGlobal('fetch', fetchMock)

    const api = new HttpApiClient()
    await expect(api.createBranch({ name: 'Filial Norte' })).resolves.toEqual({ id: 'branch-1' })

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/master-data/branches', expect.anything())
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/v1/master-data/branches', expect.anything())
    expect(fetchMock).toHaveBeenCalledTimes(4)

    const firstHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Headers
    const secondHeaders = fetchMock.mock.calls[3]?.[1]?.headers as Headers
    expect(firstHeaders.get('X-CSRF-TOKEN')).toBe('csrf-expirado')
    expect(secondHeaders.get('X-CSRF-TOKEN')).toBe('csrf-atualizado')
  })

  it('trata sessão ausente como estado não autenticado sem consultar o usuário novamente', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'csrf-test-token' }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    const api = new HttpApiClient()

    await expect(api.refreshSession()).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/auth/sessions/refresh',
      expect.objectContaining({ credentials: 'include', method: 'POST' }),
    )
  })

  it('não oculta falhas não relacionadas à autenticação ao retomar a sessão', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'csrf-test-token' }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'SERVICE_UNAVAILABLE' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 503,
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const api = new HttpApiClient()

    await expect(api.refreshSession()).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
    })
  })

  it('envia os filtros de exportação no corpo JSON documentado', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'csrf-test-token' }))
      .mockResolvedValueOnce(
        new Response('metric,value\r\nFINAL_SCORE_AVERAGE,104.8\r\n', {
          headers: {
            'Content-Disposition': 'attachment; filename="indicadores.csv"',
            'Content-Type': 'text/csv; charset=utf-8',
          },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const query = { cycleId: 'cycle-2024', metric: 'FINAL_SCORE_AVERAGE' as const }
    const api = new HttpApiClient()
    await api.exportIndicators(query)

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/indicators/exports',
      expect.objectContaining({
        body: JSON.stringify(query),
        credentials: 'include',
        method: 'POST',
      }),
    )
  })

  it('troca a senha com CSRF e credenciais por cookie', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'csrf-test-token' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    const api = new HttpApiClient()
    await api.changePassword('current', 'replacement')

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/auth/password',
      expect.objectContaining({
        body: JSON.stringify({ currentPassword: 'current', newPassword: 'replacement' }),
        credentials: 'include',
        method: 'PUT',
      }),
    )
    const headers = fetchMock.mock.calls[1]?.[1]?.headers as Headers
    expect(headers.get('X-CSRF-TOKEN')).toBe('csrf-test-token')
  })

  it('renova o token CSRF e repete uma vez o logout quando a primeira tentativa é recusada', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'csrf-expirado' }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(jsonResponse({ token: 'csrf-atualizado' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    const api = new HttpApiClient()
    await expect(api.signOut()).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/auth/csrf', expect.anything())
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/auth/sessions/current',
      expect.objectContaining({ credentials: 'include', method: 'DELETE' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/v1/auth/csrf', expect.anything())
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/v1/auth/sessions/current',
      expect.objectContaining({ credentials: 'include', method: 'DELETE' }),
    )

    const firstHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Headers
    const secondHeaders = fetchMock.mock.calls[3]?.[1]?.headers as Headers
    expect(firstHeaders.get('X-CSRF-TOKEN')).toBe('csrf-expirado')
    expect(secondHeaders.get('X-CSRF-TOKEN')).toBe('csrf-atualizado')
  })

  it('cria autoavaliação com CSRF e chave de idempotência', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'csrf-test-token' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'assessment-1' }))
    vi.stubGlobal('fetch', fetchMock)

    const api = new HttpApiClient()
    await api.createAssessment({ type: 'AUTOAVALIACAO', cycleId: 'cycle-2024' })

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/assessments',
      expect.objectContaining({
        body: JSON.stringify({ type: 'AUTOAVALIACAO', cycleId: 'cycle-2024' }),
        credentials: 'include',
        method: 'POST',
      }),
    )
    const headers = fetchMock.mock.calls[1]?.[1]?.headers as Headers
    expect(headers.get('X-CSRF-TOKEN')).toBe('csrf-test-token')
    expect(headers.get('Idempotency-Key')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })

  it('obtém somente candidatos autorizados para a criação de gestor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        collaborators: [{ id: 'collaborator-1', displayName: 'Colaborador vinculado' }],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const api = new HttpApiClient()
    await expect(api.listManagerAssessmentCreationOptions('cycle with space')).resolves.toEqual([
      { id: 'collaborator-1', displayName: 'Colaborador vinculado' },
    ])

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/assessments/creation-options?cycleId=cycle%20with%20space',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    )
  })

  it('envia limite e cursor da paginação de avaliações ao servidor', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ items: [], page: { limit: 12, nextCursor: null } }))
    vi.stubGlobal('fetch', fetchMock)

    const api = new HttpApiClient()
    await expect(api.listAssessments({ limit: 12, cursor: 'cursor-seguro' })).resolves.toEqual({
      items: [],
      page: { limit: 12, nextCursor: null },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/assessments?limit=12&cursor=cursor-seguro',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    )
  })

  it('consulta as contas locais pela rota administrativa somente de leitura', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          id: 'admin-1',
          login: 'administrador',
          displayName: 'Administrador de plataforma',
          status: 'ACTIVE',
          passwordChangeRequired: false,
          roles: ['ADMINISTRADOR_PLATAFORMA'],
          individualPermissions: [],
          updatedAt: '2026-08-26T12:00:00Z',
        },
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)

    const api = new HttpApiClient()
    await expect(api.listAdministrationUsers()).resolves.toEqual([
      {
        id: 'admin-1',
        login: 'administrador',
        displayName: 'Administrador de plataforma',
        status: 'ACTIVE',
        passwordChangeRequired: false,
        roles: ['ADMINISTRADOR_PLATAFORMA'],
        individualPermissions: [],
        updatedAt: '2026-08-26T12:00:00Z',
      },
    ])

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/administration/users',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    )
  })

  it('consulta e administra contas locais com CSRF sem retornar credenciais', async () => {
    const user = {
      id: 'user-1',
      login: 'conta-local',
      displayName: 'Conta local',
      status: 'ACTIVE',
      protectedFromNormalFlow: false,
      logicallyDeleted: false,
      passwordChangeRequired: true,
      roles: ['GERENCIA_RH'],
      individualPermissions: [{ code: 'USUARIOS.LER', effect: 'ALLOW' }],
      updatedAt: '2026-08-26T12:00:00Z',
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(user))
      .mockResolvedValueOnce(jsonResponse({ token: 'csrf-test-token' }))
      .mockResolvedValueOnce(jsonResponse(user))
      .mockResolvedValueOnce(jsonResponse({ ...user, displayName: 'Conta atualizada' }))
      .mockResolvedValueOnce(jsonResponse({ ...user, logicallyDeleted: true, status: 'DISABLED' }))
      .mockResolvedValueOnce(jsonResponse({ ...user, roles: ['DIRETORIA'] }))
    vi.stubGlobal('fetch', fetchMock)

    const api = new HttpApiClient()
    await expect(api.getAdministrationUser('user / 1')).resolves.toEqual(user)
    await expect(
      api.createAdministrationUser({
        login: 'nova-conta',
        displayName: 'Nova conta',
        initialPassword: '',
        initialRoles: [],
      }),
    ).resolves.toEqual(user)
    await expect(
      api.updateAdministrationUser('user / 1', {
        displayName: 'Conta atualizada',
        status: 'BLOCKED',
      }),
    ).resolves.toMatchObject({ displayName: 'Conta atualizada' })
    await expect(api.logicallyDeleteAdministrationUser('user / 1')).resolves.toMatchObject({
      logicallyDeleted: true,
    })
    await expect(
      api.replaceAdministrationUserAccessGrants('user / 1', {
        roles: ['DIRETORIA'],
        permissions: [{ code: 'INDICADORES.VISUALIZAR', effect: 'ALLOW' }],
      }),
    ).resolves.toMatchObject({ roles: ['DIRETORIA'] })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/v1/administration/users/user%20%2F%201',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/v1/administration/users',
      expect.objectContaining({
        body: JSON.stringify({
          login: 'nova-conta',
          displayName: 'Nova conta',
          initialPassword: '',
          initialRoles: [],
        }),
        credentials: 'include',
        method: 'POST',
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/v1/administration/users/user%20%2F%201',
      expect.objectContaining({
        body: JSON.stringify({ displayName: 'Conta atualizada', status: 'BLOCKED' }),
        credentials: 'include',
        method: 'PATCH',
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      '/api/v1/administration/users/user%20%2F%201/logical-deletion',
      expect.objectContaining({
        body: JSON.stringify({ deleted: true }),
        credentials: 'include',
        method: 'PATCH',
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      '/api/v1/administration/users/user%20%2F%201/access-grants',
      expect.objectContaining({
        body: JSON.stringify({
          roles: ['DIRETORIA'],
          permissions: [{ code: 'INDICADORES.VISUALIZAR', effect: 'ALLOW' }],
        }),
        credentials: 'include',
        method: 'PUT',
      }),
    )

    for (const callIndex of [2, 3, 4, 5]) {
      const headers = fetchMock.mock.calls[callIndex]?.[1]?.headers as Headers
      expect(headers.get('X-CSRF-TOKEN')).toBe('csrf-test-token')
    }
  })

  it('redefine senha administrativa com CSRF sem reter a credencial', async () => {
    const temporaryPassword = ['senha', 'temporaria', '123'].join('-')
    const credentialField = ['temporary', 'Password'].join('')
    const resetInput = { [credentialField]: temporaryPassword } as { temporaryPassword: string }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'csrf-test-token' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'user-1' }))
    vi.stubGlobal('fetch', fetchMock)

    const api = new HttpApiClient()
    await expect(api.resetAdministrationUserPassword('user / 1', resetInput)).resolves.toEqual({
      id: 'user-1',
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/administration/users/user%20%2F%201/password-reset',
      expect.objectContaining({
        body: JSON.stringify({ [credentialField]: temporaryPassword }),
        credentials: 'include',
        method: 'PUT',
      }),
    )
    const headers = fetchMock.mock.calls[1]?.[1]?.headers as Headers
    expect(headers.get('X-CSRF-TOKEN')).toBe('csrf-test-token')
  })

  it('consulta projeções administrativas minimizadas sem solicitar CSRF', async () => {
    const branches = [{ id: 'branch-1', name: 'Filial Norte', active: true }]
    const areas = [{ id: 'area-1', name: 'Operações', active: false }]
    const collaborators = [{ id: 'collaborator-1', displayName: 'Colaborador', active: true }]
    const allocations = [
      {
        id: 'allocation-1',
        collaboratorId: 'collaborator-1',
        branchId: null,
        areaId: 'area-1',
        managerText: null,
        startsOn: null,
      },
    ]
    const managerAssignments = [
      {
        id: 'manager-assignment-1',
        managerUserId: 'manager-1',
        collaboratorId: 'collaborator-1',
        startsOn: null,
      },
    ]
    const userCollaboratorLinks = [
      {
        id: 'user-collaborator-link-1',
        userId: 'user-1',
        collaboratorId: 'collaborator-1',
        startsOn: '2026-09-01',
      },
    ]
    const managerAssignmentOptions = {
      managers: [{ id: 'manager-1', displayName: 'Gestora' }],
      collaborators: [{ id: 'collaborator-1', displayName: 'Colaborador' }],
    }
    const userCollaboratorLinkOptions = {
      users: [{ id: 'user-1', displayName: 'Conta vinculável' }],
      collaborators: [{ id: 'collaborator-1', displayName: 'Colaborador' }],
    }
    const questionnaireAssignmentOptions = [
      {
        cycleId: 'cycle-1',
        cycleCode: 'CICLO-2026',
        cycleName: 'Ciclo 2026',
        questionnaires: [
          { cycleQuestionnaireId: 'cycle-questionnaire-1', title: 'Questionário de competências' },
        ],
      },
    ]
    const questionnaireAssignments = [
      {
        id: 'questionnaire-assignment-1',
        cycleId: 'cycle-1',
        cycleCode: 'CICLO-2026',
        cycleName: 'Ciclo 2026',
        collaboratorId: 'collaborator-1',
        cycleQuestionnaireId: 'cycle-questionnaire-1',
        questionnaireTitle: 'Questionário de competências',
      },
    ]
    const questionnaireVersions = [
      {
        questionnaireVersionId: 'questionnaire-version-1',
        questionnaireCode: 'COMPETENCIAS',
        questionnaireName: 'Competências',
        versionNumber: 1,
        title: 'Competências 2026',
        configurationOptions: [
          {
            calculationConfigurationVersionId: 'calculation-version-1',
            calculationCode: 'MEDIA_SIMPLES',
            calculationVersionNumber: 1,
            classificationMatrixVersionId: 'classification-version-1',
            classificationMatrixCode: 'GERAL',
            classificationMatrixVersionNumber: 1,
          },
        ],
      },
    ]
    const cycleDraft = {
      cycleId: 'cycle-1',
      code: '2026.1',
      name: 'Ciclo 2026',
      openingAtLocal: '2026-09-01T00:00:00',
      closingAtLocal: '2026-09-16T00:00:00',
      timeZone: 'America/Sao_Paulo',
      selfAssessmentEnabled: true,
      questionnaires: [
        {
          cycleQuestionnaireId: 'cycle-questionnaire-1',
          questionnaireVersionId: 'questionnaire-version-1',
          calculationConfigurationVersionId: 'calculation-version-1',
          classificationMatrixVersionId: 'classification-version-1',
        },
      ],
    }
    const responses = new Map<string, unknown>([
      ['/api/v1/master-data/branches', branches],
      ['/api/v1/master-data/areas', areas],
      ['/api/v1/master-data/collaborators', collaborators],
      ['/api/v1/master-data/allocations/active', allocations],
      ['/api/v1/administration/manager-assignments/active', managerAssignments],
      ['/api/v1/administration/manager-assignments/options', managerAssignmentOptions],
      ['/api/v1/master-data/user-collaborator-links/active', userCollaboratorLinks],
      ['/api/v1/master-data/user-collaborator-links/options', userCollaboratorLinkOptions],
      ['/api/v1/master-data/questionnaire-assignments/active', questionnaireAssignments],
      ['/api/v1/master-data/questionnaire-assignment-options', questionnaireAssignmentOptions],
      ['/api/v1/questionnaire-versions/approved', questionnaireVersions],
      ['/api/v1/evaluation-cycles/cycle%20one/administration-draft', cycleDraft],
    ])
    const fetchMock = vi.fn((url: string) => Promise.resolve(jsonResponse(responses.get(url))))
    vi.stubGlobal('fetch', fetchMock)

    const api = new HttpApiClient()
    await expect(api.listBranches()).resolves.toEqual(branches)
    await expect(api.listAreas()).resolves.toEqual(areas)
    await expect(api.listCollaborators()).resolves.toEqual(collaborators)
    await expect(api.listActiveAllocations()).resolves.toEqual(allocations)
    await expect(api.listActiveManagerAssignments()).resolves.toEqual(managerAssignments)
    await expect(api.getManagerAssignmentOptions()).resolves.toEqual(managerAssignmentOptions)
    await expect(api.listActiveUserCollaboratorLinks()).resolves.toEqual(userCollaboratorLinks)
    await expect(api.getUserCollaboratorLinkOptions()).resolves.toEqual(userCollaboratorLinkOptions)
    await expect(api.listActiveQuestionnaireAssignments()).resolves.toEqual(
      questionnaireAssignments,
    )
    await expect(api.listQuestionnaireAssignmentOptions()).resolves.toEqual(
      questionnaireAssignmentOptions,
    )
    await expect(api.listApprovedQuestionnaireVersions()).resolves.toEqual(questionnaireVersions)
    await expect(api.getEvaluationCycleAdministrationDraft('cycle one')).resolves.toEqual(
      cycleDraft,
    )

    const requests = fetchMock.mock.calls.map((call) => {
      const [url, options] = call as unknown as [string, RequestInit | undefined]
      const request = options ?? {}
      return {
        url,
        method: request.method,
        csrf: (request.headers as Headers).get('X-CSRF-TOKEN'),
      }
    })

    expect(requests).toEqual([
      { url: '/api/v1/master-data/branches', method: 'GET', csrf: null },
      { url: '/api/v1/master-data/areas', method: 'GET', csrf: null },
      { url: '/api/v1/master-data/collaborators', method: 'GET', csrf: null },
      { url: '/api/v1/master-data/allocations/active', method: 'GET', csrf: null },
      {
        url: '/api/v1/administration/manager-assignments/active',
        method: 'GET',
        csrf: null,
      },
      {
        url: '/api/v1/administration/manager-assignments/options',
        method: 'GET',
        csrf: null,
      },
      {
        url: '/api/v1/master-data/user-collaborator-links/active',
        method: 'GET',
        csrf: null,
      },
      {
        url: '/api/v1/master-data/user-collaborator-links/options',
        method: 'GET',
        csrf: null,
      },
      {
        url: '/api/v1/master-data/questionnaire-assignments/active',
        method: 'GET',
        csrf: null,
      },
      {
        url: '/api/v1/master-data/questionnaire-assignment-options',
        method: 'GET',
        csrf: null,
      },
      { url: '/api/v1/questionnaire-versions/approved', method: 'GET', csrf: null },
      {
        url: '/api/v1/evaluation-cycles/cycle%20one/administration-draft',
        method: 'GET',
        csrf: null,
      },
    ])
  })

  it('envia os cadastros e vínculos administrativos aos recursos corretos com CSRF', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/v1/auth/csrf') {
        return Promise.resolve(jsonResponse({ token: 'csrf-test-token' }))
      }

      if (url.includes('/deactivate') || url.endsWith('/close') || url.endsWith('/revoke')) {
        return Promise.resolve(new Response(null, { status: 204 }))
      }

      return Promise.resolve(jsonResponse({ id: 'created-resource' }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const api = new HttpApiClient()
    await expect(api.createBranch({ name: 'Filial Norte' })).resolves.toEqual({
      id: 'created-resource',
    })
    await api.deactivateBranch('branch / one')
    await api.deleteInactiveUnusedBranch('branch / one')
    await api.createArea({ name: 'Operações' })
    await api.deactivateArea('area-1')
    await api.createCollaborator({ displayName: 'Colaborador de teste' })
    await api.deactivateCollaborator('collaborator-1')
    await api.createAllocation({
      collaboratorId: 'collaborator-1',
      branchId: 'branch-1',
      areaId: 'area-1',
      managerText: 'Gestor de teste',
      startsOn: '2026-09-01',
    })
    await api.closeAllocation('allocation-1', { endsOn: '2026-09-16' })
    await api.createManagerAssignment({
      managerUserId: 'manager-1',
      collaboratorId: 'collaborator-1',
      startsOn: '2026-09-01',
    })
    await api.closeManagerAssignment('manager-assignment-1', { endsOn: '2026-09-16' })
    await api.createUserCollaboratorLink({
      userId: 'user-1',
      collaboratorId: 'collaborator-1',
      startsOn: '2026-09-01',
    })
    await api.closeUserCollaboratorLink('user-link-1', { endsOn: '2026-09-16' })
    await api.createQuestionnaireAssignment({
      cycleId: 'cycle-1',
      collaboratorId: 'collaborator-1',
      cycleQuestionnaireId: 'cycle-questionnaire-1',
    })
    await api.revokeQuestionnaireAssignment('questionnaire-assignment-1', {
      reason: 'Atribuição substituída',
    })

    const requests = fetchMock.mock.calls.slice(1).map((call) => {
      const [url, options] = call as unknown as [string, RequestInit | undefined]
      const request = options ?? {}
      return {
        url,
        method: request.method,
        body: request.body,
        csrf: (request.headers as Headers).get('X-CSRF-TOKEN'),
      }
    })

    expect(requests).toEqual([
      {
        url: '/api/v1/master-data/branches',
        method: 'POST',
        body: JSON.stringify({ name: 'Filial Norte' }),
        csrf: 'csrf-test-token',
      },
      {
        url: '/api/v1/master-data/branches/branch%20%2F%20one/deactivate',
        method: 'PATCH',
        body: undefined,
        csrf: 'csrf-test-token',
      },
      {
        url: '/api/v1/master-data/branches/branch%20%2F%20one',
        method: 'DELETE',
        body: undefined,
        csrf: 'csrf-test-token',
      },
      {
        url: '/api/v1/master-data/areas',
        method: 'POST',
        body: JSON.stringify({ name: 'Operações' }),
        csrf: 'csrf-test-token',
      },
      {
        url: '/api/v1/master-data/areas/area-1/deactivate',
        method: 'PATCH',
        body: undefined,
        csrf: 'csrf-test-token',
      },
      {
        url: '/api/v1/master-data/collaborators',
        method: 'POST',
        body: JSON.stringify({ displayName: 'Colaborador de teste' }),
        csrf: 'csrf-test-token',
      },
      {
        url: '/api/v1/master-data/collaborators/collaborator-1/deactivate',
        method: 'PATCH',
        body: undefined,
        csrf: 'csrf-test-token',
      },
      {
        url: '/api/v1/master-data/allocations',
        method: 'POST',
        body: JSON.stringify({
          collaboratorId: 'collaborator-1',
          branchId: 'branch-1',
          areaId: 'area-1',
          managerText: 'Gestor de teste',
          startsOn: '2026-09-01',
        }),
        csrf: 'csrf-test-token',
      },
      {
        url: '/api/v1/master-data/allocations/allocation-1/close',
        method: 'PATCH',
        body: JSON.stringify({ endsOn: '2026-09-16' }),
        csrf: 'csrf-test-token',
      },
      {
        url: '/api/v1/administration/manager-assignments',
        method: 'POST',
        body: JSON.stringify({
          managerUserId: 'manager-1',
          collaboratorId: 'collaborator-1',
          startsOn: '2026-09-01',
        }),
        csrf: 'csrf-test-token',
      },
      {
        url: '/api/v1/administration/manager-assignments/manager-assignment-1/close',
        method: 'PATCH',
        body: JSON.stringify({ endsOn: '2026-09-16' }),
        csrf: 'csrf-test-token',
      },
      {
        url: '/api/v1/master-data/user-collaborator-links',
        method: 'POST',
        body: JSON.stringify({
          userId: 'user-1',
          collaboratorId: 'collaborator-1',
          startsOn: '2026-09-01',
        }),
        csrf: 'csrf-test-token',
      },
      {
        url: '/api/v1/master-data/user-collaborator-links/user-link-1/close',
        method: 'PATCH',
        body: JSON.stringify({ endsOn: '2026-09-16' }),
        csrf: 'csrf-test-token',
      },
      {
        url: '/api/v1/master-data/questionnaire-assignments',
        method: 'POST',
        body: JSON.stringify({
          cycleId: 'cycle-1',
          collaboratorId: 'collaborator-1',
          cycleQuestionnaireId: 'cycle-questionnaire-1',
        }),
        csrf: 'csrf-test-token',
      },
      {
        url: '/api/v1/master-data/questionnaire-assignments/questionnaire-assignment-1/revoke',
        method: 'PATCH',
        body: JSON.stringify({ reason: 'Atribuição substituída' }),
        csrf: 'csrf-test-token',
      },
    ])
  })

  it('cria questionário e ciclo, consulta a versão aplicada e percorre todos os ciclos', async () => {
    const questionnaireVersion = {
      questionnaireVersionId: 'questionnaire-version-1',
      calculationConfigurationVersionId: 'calculation-version-1',
      classificationMatrixVersionId: 'classification-version-1',
    }
    const createdCycle = {
      cycleId: 'cycle-1',
      questionnaires: [
        {
          cycleQuestionnaireId: 'cycle-questionnaire-1',
          questionnaireVersionId: 'questionnaire-version-1',
        },
      ],
    }
    const appliedQuestionnaire = {
      cycleQuestionnaireId: 'cycle-questionnaire-1',
      questionnaireVersionId: 'questionnaire-version-1',
      questionnaireCode: 'COMPETENCIAS',
      questionnaireVersionNumber: 1,
      title: 'Competências 2026',
      competencies: [
        {
          id: 'competency-1',
          name: 'Colaboração',
          questions: [
            {
              id: 'question-1',
              text: 'Coopera com a equipe?',
              required: true,
              options: [{ id: 'option-1', label: 'Sempre' }],
            },
          ],
        },
      ],
    }
    const fetchMock = vi.fn((url: string) => {
      if (url === '/api/v1/auth/csrf') {
        return Promise.resolve(jsonResponse({ token: 'csrf-test-token' }))
      }
      if (url === '/api/v1/questionnaire-versions') {
        return Promise.resolve(jsonResponse(questionnaireVersion))
      }
      if (url === '/api/v1/evaluation-cycles') {
        return Promise.resolve(jsonResponse(createdCycle))
      }
      if (
        url === '/api/v1/evaluation-cycles/cycle%20one/questionnaires/cycle-questionnaire%20one'
      ) {
        return Promise.resolve(jsonResponse(appliedQuestionnaire))
      }
      if (url === '/api/v1/evaluation-cycles?limit=100') {
        return Promise.resolve(
          jsonResponse({
            items: [{ id: 'cycle-1', name: 'Ciclo 1', status: 'ABERTO' }],
            page: { limit: 100, nextCursor: 'second cursor' },
          }),
        )
      }
      if (url === '/api/v1/evaluation-cycles?limit=100&cursor=second+cursor') {
        return Promise.resolve(
          jsonResponse({
            items: [{ id: 'cycle-2', name: 'Ciclo 2', status: 'ENCERRADO' }],
            page: { limit: 100, nextCursor: null },
          }),
        )
      }

      return Promise.resolve(new Response(null, { status: 204 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const questionnaireInput = {
      questionnaire: { code: 'COMPETENCIAS', name: 'Competências' },
      versionNumber: 1,
      title: 'Competências 2026',
      calculation: { code: 'MEDIA_SIMPLES', versionNumber: 1 },
      classificationMatrixVersionNumber: 1,
      competencies: [
        {
          code: 'COLABORACAO',
          name: 'Colaboração',
          versionNumber: 1,
          order: 1,
          questions: [{ code: 'COLABORA', text: 'Coopera com a equipe?', order: 1 }],
        },
      ],
    }
    const configuration = {
      name: 'Ciclo 2026',
      openingAtLocal: '2026-09-01T00:00:00',
      closingAtLocal: '2026-09-16T00:00:00',
      timeZone: 'America/Sao_Paulo',
      selfAssessmentEnabled: true,
      questionnaires: [
        {
          questionnaireVersionId: 'questionnaire-version-1',
          calculationConfigurationVersionId: 'calculation-version-1',
          classificationMatrixVersionId: 'classification-version-1',
        },
      ],
    }

    const api = new HttpApiClient()
    await expect(api.createQuestionnaireVersion(questionnaireInput)).resolves.toEqual(
      questionnaireVersion,
    )
    await expect(api.createEvaluationCycle({ code: '2026.1', configuration })).resolves.toEqual(
      createdCycle,
    )
    await api.replaceEvaluationCycle('cycle one', { configuration })
    await api.openEvaluationCycle('cycle one')
    await api.closeEvaluationCycle('cycle one')
    await expect(
      api.getAppliedCycleQuestionnaire('cycle one', 'cycle-questionnaire one'),
    ).resolves.toEqual(appliedQuestionnaire)
    await expect(api.listAllCycles()).resolves.toEqual([
      { id: 'cycle-1', name: 'Ciclo 1', status: 'ABERTO' },
      { id: 'cycle-2', name: 'Ciclo 2', status: 'ENCERRADO' },
    ])

    const requests = fetchMock.mock.calls.slice(1).map((call) => {
      const [url, options] = call as unknown as [string, RequestInit | undefined]
      const request = options ?? {}
      return {
        url,
        method: request.method,
        body: request.body,
        csrf: (request.headers as Headers).get('X-CSRF-TOKEN'),
      }
    })

    expect(requests).toEqual([
      {
        url: '/api/v1/questionnaire-versions',
        method: 'POST',
        body: JSON.stringify(questionnaireInput),
        csrf: 'csrf-test-token',
      },
      {
        url: '/api/v1/evaluation-cycles',
        method: 'POST',
        body: JSON.stringify({ code: '2026.1', configuration }),
        csrf: 'csrf-test-token',
      },
      {
        url: '/api/v1/evaluation-cycles/cycle%20one',
        method: 'PUT',
        body: JSON.stringify({ configuration }),
        csrf: 'csrf-test-token',
      },
      {
        url: '/api/v1/evaluation-cycles/cycle%20one/open',
        method: 'POST',
        body: undefined,
        csrf: 'csrf-test-token',
      },
      {
        url: '/api/v1/evaluation-cycles/cycle%20one/close',
        method: 'POST',
        body: undefined,
        csrf: 'csrf-test-token',
      },
      {
        url: '/api/v1/evaluation-cycles/cycle%20one/questionnaires/cycle-questionnaire%20one',
        method: 'GET',
        body: undefined,
        csrf: null,
      },
      {
        url: '/api/v1/evaluation-cycles?limit=100',
        method: 'GET',
        body: undefined,
        csrf: null,
      },
      {
        url: '/api/v1/evaluation-cycles?limit=100&cursor=second+cursor',
        method: 'GET',
        body: undefined,
        csrf: null,
      },
    ])
  })

  it('obtém as opções de filtros de indicadores do ciclo pelo servidor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        branches: [{ id: 'branch-1', label: 'Filial Norte' }],
        areas: [],
        managers: [],
        competencies: [],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const api = new HttpApiClient()
    await expect(api.getIndicatorFilterOptions('cycle with space')).resolves.toEqual({
      branches: [{ id: 'branch-1', label: 'Filial Norte' }],
      areas: [],
      managers: [],
      competencies: [],
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/indicators/options?cycleId=cycle%20with%20space',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    )
  })

  it('reabre com CSRF, motivo e chave de idempotência', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'csrf-test-token' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'assessment-1' }))
    vi.stubGlobal('fetch', fetchMock)

    const api = new HttpApiClient()
    await api.reopenAssessment('assessment-1', 'Correção de dados')

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/assessments/assessment-1/reopen',
      expect.objectContaining({
        body: JSON.stringify({ reason: 'Correção de dados' }),
        credentials: 'include',
        method: 'POST',
      }),
    )
    const headers = fetchMock.mock.calls[1]?.[1]?.headers as Headers
    expect(headers.get('X-CSRF-TOKEN')).toBe('csrf-test-token')
    expect(headers.get('Idempotency-Key')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })

  it('registra a impressão da avaliação com CSRF, sem enviar seu conteúdo', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'csrf-test-token' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    const api = new HttpApiClient()
    await api.recordAssessmentPrint('assessment / 1')

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/assessments/assessment%20%2F%201/print-events',
      expect.objectContaining({ credentials: 'include', method: 'POST' }),
    )
    const headers = fetchMock.mock.calls[1]?.[1]?.headers as Headers
    expect(headers.get('X-CSRF-TOKEN')).toBe('csrf-test-token')
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBeUndefined()
  })
})

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  })
}
