import type {
  AdministrationUser,
  AppliedCycleQuestionnaire,
  ActiveAllocation,
  ActiveManagerAssignment,
  ActiveQuestionnaireAssignment,
  ActiveUserCollaboratorLink,
  AdministrativeCollaborator,
  AdministrativeNamedResource,
  ApprovedQuestionnaireVersion,
  ApiProblem,
  AssessmentDetail,
  AssessmentListRequest,
  AssessmentDraftInput,
  AssessmentSummary,
  CloseRecordInput,
  CreateAdministrationUserInput,
  CreateAllocationInput,
  CreateAssessmentInput,
  CreateCollaboratorInput,
  CreateEvaluationCycleInput,
  CreateManagerAssignmentInput,
  CreateQuestionnaireAssignmentInput,
  CreateQuestionnaireVersionInput,
  CreateUserCollaboratorLinkInput,
  CreatedEvaluationCycle,
  CreatedQuestionnaireVersion,
  CreatedResource,
  CurrentUser,
  DraftCycleConfiguration,
  EvaluationCycle,
  IndicatorExport,
  IndicatorFilterOptions,
  IndicatorQuery,
  IndicatorResponse,
  ManagerAssessmentCreationOption,
  ManagerAssignmentOptions,
  NamedResourceInput,
  Page,
  QuestionnaireAssignmentOption,
  ReplaceAdministrationUserAccessGrantsInput,
  ResetAdministrationUserPasswordInput,
  ReplaceEvaluationCycleInput,
  RevokeQuestionnaireAssignmentInput,
  UpdateAdministrationUserInput,
  UserCollaboratorLinkOptions,
} from './contracts'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '')

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly requestId?: string
  readonly fieldErrors: readonly {
    field: string
    code: string
  }[]

  constructor(problem: ApiProblem) {
    super(problem.code ?? 'REQUEST_FAILED')
    this.name = 'ApiError'
    this.status = problem.status
    this.code = problem.code
    this.requestId = problem.requestId
    this.fieldErrors = problem.errors ?? []
  }
}

export function isAuthenticationError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401
}

export interface ApiClient {
  currentUser(): Promise<CurrentUser | null>
  refreshSession(): Promise<CurrentUser | null>
  signIn(login: string, password: string): Promise<void>
  signOut(): Promise<void>
  changePassword(currentPassword: string, newPassword: string): Promise<void>
  listAdministrationUsers(): Promise<readonly AdministrationUser[]>
  getAdministrationUser(userId: string): Promise<AdministrationUser>
  createAdministrationUser(input: CreateAdministrationUserInput): Promise<AdministrationUser>
  logicallyDeleteAdministrationUser(userId: string): Promise<AdministrationUser>
  resetAdministrationUserPassword(
    userId: string,
    input: ResetAdministrationUserPasswordInput,
  ): Promise<AdministrationUser>
  updateAdministrationUser(
    userId: string,
    input: UpdateAdministrationUserInput,
  ): Promise<AdministrationUser>
  replaceAdministrationUserAccessGrants(
    userId: string,
    input: ReplaceAdministrationUserAccessGrantsInput,
  ): Promise<AdministrationUser>
  listBranches(): Promise<readonly AdministrativeNamedResource[]>
  listAreas(): Promise<readonly AdministrativeNamedResource[]>
  listCollaborators(): Promise<readonly AdministrativeCollaborator[]>
  listActiveAllocations(): Promise<readonly ActiveAllocation[]>
  listActiveManagerAssignments(): Promise<readonly ActiveManagerAssignment[]>
  getManagerAssignmentOptions(): Promise<ManagerAssignmentOptions>
  listActiveUserCollaboratorLinks(): Promise<readonly ActiveUserCollaboratorLink[]>
  getUserCollaboratorLinkOptions(): Promise<UserCollaboratorLinkOptions>
  listActiveQuestionnaireAssignments(): Promise<readonly ActiveQuestionnaireAssignment[]>
  listQuestionnaireAssignmentOptions(): Promise<readonly QuestionnaireAssignmentOption[]>
  listApprovedQuestionnaireVersions(): Promise<readonly ApprovedQuestionnaireVersion[]>
  createBranch(input: NamedResourceInput): Promise<CreatedResource>
  deactivateBranch(branchId: string): Promise<void>
  deleteInactiveUnusedBranch(branchId: string): Promise<void>
  createArea(input: NamedResourceInput): Promise<CreatedResource>
  deactivateArea(areaId: string): Promise<void>
  createCollaborator(input: CreateCollaboratorInput): Promise<CreatedResource>
  deactivateCollaborator(collaboratorId: string): Promise<void>
  createAllocation(input: CreateAllocationInput): Promise<CreatedResource>
  closeAllocation(allocationId: string, input: CloseRecordInput): Promise<void>
  createManagerAssignment(input: CreateManagerAssignmentInput): Promise<CreatedResource>
  closeManagerAssignment(assignmentId: string, input: CloseRecordInput): Promise<void>
  createUserCollaboratorLink(input: CreateUserCollaboratorLinkInput): Promise<CreatedResource>
  closeUserCollaboratorLink(linkId: string, input: CloseRecordInput): Promise<void>
  createQuestionnaireAssignment(input: CreateQuestionnaireAssignmentInput): Promise<CreatedResource>
  revokeQuestionnaireAssignment(
    assignmentId: string,
    input: RevokeQuestionnaireAssignmentInput,
  ): Promise<void>
  createQuestionnaireVersion(
    input: CreateQuestionnaireVersionInput,
  ): Promise<CreatedQuestionnaireVersion>
  listCycles(): Promise<readonly EvaluationCycle[]>
  listAllCycles(): Promise<readonly EvaluationCycle[]>
  getEvaluationCycleAdministrationDraft(cycleId: string): Promise<DraftCycleConfiguration>
  getAppliedCycleQuestionnaire(
    cycleId: string,
    cycleQuestionnaireId: string,
  ): Promise<AppliedCycleQuestionnaire>
  createEvaluationCycle(input: CreateEvaluationCycleInput): Promise<CreatedEvaluationCycle>
  replaceEvaluationCycle(cycleId: string, input: ReplaceEvaluationCycleInput): Promise<void>
  openEvaluationCycle(cycleId: string): Promise<void>
  closeEvaluationCycle(cycleId: string): Promise<void>
  listAssessments(request?: AssessmentListRequest): Promise<Page<AssessmentSummary>>
  listManagerAssessmentCreationOptions(
    cycleId: string,
  ): Promise<readonly ManagerAssessmentCreationOption[]>
  createAssessment(input: CreateAssessmentInput): Promise<AssessmentDetail>
  getAssessment(assessmentId: string): Promise<AssessmentDetail>
  recordAssessmentPrint(assessmentId: string): Promise<void>
  saveAssessment(
    assessmentId: string,
    draft: AssessmentDraftInput,
    revision?: string,
  ): Promise<AssessmentDetail>
  submitAssessment(assessmentId: string, revision?: string): Promise<AssessmentDetail>
  publishAssessment(assessmentId: string): Promise<AssessmentDetail>
  reopenAssessment(assessmentId: string, reason: string): Promise<AssessmentDetail>
  getIndicatorFilterOptions(cycleId: string): Promise<IndicatorFilterOptions>
  getIndicators(query: IndicatorQuery): Promise<IndicatorResponse>
  exportIndicators(query: IndicatorQuery): Promise<IndicatorExport | IndicatorResponse>
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: HeadersInit
  requiresCsrf?: boolean
  skipSessionRecovery?: boolean
}

export class HttpApiClient implements ApiClient {
  private csrfToken?: string
  private csrfRequest?: Promise<string>
  private sessionRefreshRequest?: Promise<boolean>

  async currentUser(): Promise<CurrentUser | null> {
    try {
      return await this.request<CurrentUser>('/auth/me', { skipSessionRecovery: true })
    } catch (error) {
      if (isAuthenticationError(error)) {
        return null
      }
      throw error
    }
  }

  async refreshSession(): Promise<CurrentUser | null> {
    try {
      await this.request<void>('/auth/sessions/refresh', {
        method: 'POST',
        requiresCsrf: true,
        skipSessionRecovery: true,
      })
      return await this.currentUser()
    } catch (error) {
      if (isAuthenticationError(error)) {
        return null
      }
      throw error
    }
  }

  async signIn(login: string, password: string): Promise<void> {
    try {
      await this.request<void>('/auth/sessions', {
        method: 'POST',
        body: { login, password },
        requiresCsrf: true,
        skipSessionRecovery: true,
      })
    } finally {
      // A transição de autenticação pode renovar o cookie CSRF. Não reutilize o token emitido
      // antes dela em uma operação subsequente, como a troca obrigatória de senha.
      this.csrfToken = undefined
    }
  }

  async signOut(): Promise<void> {
    try {
      await this.request<void>('/auth/sessions/current', {
        method: 'DELETE',
        requiresCsrf: true,
        skipSessionRecovery: true,
      })
    } finally {
      this.csrfToken = undefined
    }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.request<void>('/auth/password', {
      method: 'PUT',
      body: { currentPassword, newPassword },
      requiresCsrf: true,
    })
    this.csrfToken = undefined
  }

  listAdministrationUsers(): Promise<readonly AdministrationUser[]> {
    return this.request<readonly AdministrationUser[]>('/administration/users')
  }

  getAdministrationUser(userId: string): Promise<AdministrationUser> {
    return this.request<AdministrationUser>(`/administration/users/${encodeURIComponent(userId)}`)
  }

  createAdministrationUser(input: CreateAdministrationUserInput): Promise<AdministrationUser> {
    return this.request<AdministrationUser>('/administration/users', {
      method: 'POST',
      body: input,
      requiresCsrf: true,
    })
  }

  logicallyDeleteAdministrationUser(userId: string): Promise<AdministrationUser> {
    return this.request<AdministrationUser>(
      `/administration/users/${encodeURIComponent(userId)}/logical-deletion`,
      {
        method: 'PATCH',
        body: { deleted: true },
        requiresCsrf: true,
      },
    )
  }

  resetAdministrationUserPassword(
    userId: string,
    input: ResetAdministrationUserPasswordInput,
  ): Promise<AdministrationUser> {
    return this.request<AdministrationUser>(
      `/administration/users/${encodeURIComponent(userId)}/password-reset`,
      {
        method: 'PUT',
        body: input,
        requiresCsrf: true,
      },
    )
  }

  updateAdministrationUser(
    userId: string,
    input: UpdateAdministrationUserInput,
  ): Promise<AdministrationUser> {
    return this.request<AdministrationUser>(`/administration/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: input,
      requiresCsrf: true,
    })
  }

  replaceAdministrationUserAccessGrants(
    userId: string,
    input: ReplaceAdministrationUserAccessGrantsInput,
  ): Promise<AdministrationUser> {
    return this.request<AdministrationUser>(
      `/administration/users/${encodeURIComponent(userId)}/access-grants`,
      {
        method: 'PUT',
        body: input,
        requiresCsrf: true,
      },
    )
  }

  listBranches(): Promise<readonly AdministrativeNamedResource[]> {
    return this.request<readonly AdministrativeNamedResource[]>('/master-data/branches')
  }

  listAreas(): Promise<readonly AdministrativeNamedResource[]> {
    return this.request<readonly AdministrativeNamedResource[]>('/master-data/areas')
  }

  listCollaborators(): Promise<readonly AdministrativeCollaborator[]> {
    return this.request<readonly AdministrativeCollaborator[]>('/master-data/collaborators')
  }

  listActiveAllocations(): Promise<readonly ActiveAllocation[]> {
    return this.request<readonly ActiveAllocation[]>('/master-data/allocations/active')
  }

  listActiveManagerAssignments(): Promise<readonly ActiveManagerAssignment[]> {
    return this.request<readonly ActiveManagerAssignment[]>(
      '/administration/manager-assignments/active',
    )
  }

  getManagerAssignmentOptions(): Promise<ManagerAssignmentOptions> {
    return this.request<ManagerAssignmentOptions>('/administration/manager-assignments/options')
  }

  listActiveUserCollaboratorLinks(): Promise<readonly ActiveUserCollaboratorLink[]> {
    return this.request<readonly ActiveUserCollaboratorLink[]>(
      '/master-data/user-collaborator-links/active',
    )
  }

  getUserCollaboratorLinkOptions(): Promise<UserCollaboratorLinkOptions> {
    return this.request<UserCollaboratorLinkOptions>('/master-data/user-collaborator-links/options')
  }

  listActiveQuestionnaireAssignments(): Promise<readonly ActiveQuestionnaireAssignment[]> {
    return this.request<readonly ActiveQuestionnaireAssignment[]>(
      '/master-data/questionnaire-assignments/active',
    )
  }

  listQuestionnaireAssignmentOptions(): Promise<readonly QuestionnaireAssignmentOption[]> {
    return this.request<readonly QuestionnaireAssignmentOption[]>(
      '/master-data/questionnaire-assignment-options',
    )
  }

  listApprovedQuestionnaireVersions(): Promise<readonly ApprovedQuestionnaireVersion[]> {
    return this.request<readonly ApprovedQuestionnaireVersion[]>('/questionnaire-versions/approved')
  }

  createBranch(input: NamedResourceInput): Promise<CreatedResource> {
    return this.request<CreatedResource>('/master-data/branches', {
      method: 'POST',
      body: input,
      requiresCsrf: true,
    })
  }

  deactivateBranch(branchId: string): Promise<void> {
    return this.request<void>(`/master-data/branches/${encodeURIComponent(branchId)}/deactivate`, {
      method: 'PATCH',
      requiresCsrf: true,
    })
  }

  deleteInactiveUnusedBranch(branchId: string): Promise<void> {
    return this.request<void>(`/master-data/branches/${encodeURIComponent(branchId)}`, {
      method: 'DELETE',
      requiresCsrf: true,
    })
  }

  createArea(input: NamedResourceInput): Promise<CreatedResource> {
    return this.request<CreatedResource>('/master-data/areas', {
      method: 'POST',
      body: input,
      requiresCsrf: true,
    })
  }

  deactivateArea(areaId: string): Promise<void> {
    return this.request<void>(`/master-data/areas/${encodeURIComponent(areaId)}/deactivate`, {
      method: 'PATCH',
      requiresCsrf: true,
    })
  }

  createCollaborator(input: CreateCollaboratorInput): Promise<CreatedResource> {
    return this.request<CreatedResource>('/master-data/collaborators', {
      method: 'POST',
      body: input,
      requiresCsrf: true,
    })
  }

  deactivateCollaborator(collaboratorId: string): Promise<void> {
    return this.request<void>(
      `/master-data/collaborators/${encodeURIComponent(collaboratorId)}/deactivate`,
      {
        method: 'PATCH',
        requiresCsrf: true,
      },
    )
  }

  createAllocation(input: CreateAllocationInput): Promise<CreatedResource> {
    return this.request<CreatedResource>('/master-data/allocations', {
      method: 'POST',
      body: input,
      requiresCsrf: true,
    })
  }

  closeAllocation(allocationId: string, input: CloseRecordInput): Promise<void> {
    return this.request<void>(
      `/master-data/allocations/${encodeURIComponent(allocationId)}/close`,
      {
        method: 'PATCH',
        body: input,
        requiresCsrf: true,
      },
    )
  }

  createManagerAssignment(input: CreateManagerAssignmentInput): Promise<CreatedResource> {
    return this.request<CreatedResource>('/administration/manager-assignments', {
      method: 'POST',
      body: input,
      requiresCsrf: true,
    })
  }

  closeManagerAssignment(assignmentId: string, input: CloseRecordInput): Promise<void> {
    return this.request<void>(
      `/administration/manager-assignments/${encodeURIComponent(assignmentId)}/close`,
      {
        method: 'PATCH',
        body: input,
        requiresCsrf: true,
      },
    )
  }

  createUserCollaboratorLink(input: CreateUserCollaboratorLinkInput): Promise<CreatedResource> {
    return this.request<CreatedResource>('/master-data/user-collaborator-links', {
      method: 'POST',
      body: input,
      requiresCsrf: true,
    })
  }

  closeUserCollaboratorLink(linkId: string, input: CloseRecordInput): Promise<void> {
    return this.request<void>(
      `/master-data/user-collaborator-links/${encodeURIComponent(linkId)}/close`,
      {
        method: 'PATCH',
        body: input,
        requiresCsrf: true,
      },
    )
  }

  createQuestionnaireAssignment(
    input: CreateQuestionnaireAssignmentInput,
  ): Promise<CreatedResource> {
    return this.request<CreatedResource>('/master-data/questionnaire-assignments', {
      method: 'POST',
      body: input,
      requiresCsrf: true,
    })
  }

  revokeQuestionnaireAssignment(
    assignmentId: string,
    input: RevokeQuestionnaireAssignmentInput,
  ): Promise<void> {
    return this.request<void>(
      `/master-data/questionnaire-assignments/${encodeURIComponent(assignmentId)}/revoke`,
      {
        method: 'PATCH',
        body: input,
        requiresCsrf: true,
      },
    )
  }

  createQuestionnaireVersion(
    input: CreateQuestionnaireVersionInput,
  ): Promise<CreatedQuestionnaireVersion> {
    return this.request<CreatedQuestionnaireVersion>('/questionnaire-versions', {
      method: 'POST',
      body: input,
      requiresCsrf: true,
    })
  }

  async listCycles(): Promise<readonly EvaluationCycle[]> {
    const page = await this.request<Page<EvaluationCycle>>('/evaluation-cycles')
    return page.items
  }

  async listAllCycles(): Promise<readonly EvaluationCycle[]> {
    const cycles: EvaluationCycle[] = []
    const seenCursors = new Set<string>()
    let cursor: string | null = null

    do {
      const parameters = new URLSearchParams({ limit: '100' })
      if (cursor !== null) {
        parameters.set('cursor', cursor)
      }

      const page = await this.request<Page<EvaluationCycle>>(
        `/evaluation-cycles?${parameters.toString()}`,
      )
      cycles.push(...page.items)
      cursor = page.page.nextCursor

      if (cursor !== null && !seenCursors.add(cursor)) {
        throw new ApiError({ status: 500, code: 'INVALID_CYCLE_PAGINATION' })
      }
    } while (cursor !== null)

    return cycles
  }

  getEvaluationCycleAdministrationDraft(cycleId: string): Promise<DraftCycleConfiguration> {
    return this.request<DraftCycleConfiguration>(
      `/evaluation-cycles/${encodeURIComponent(cycleId)}/administration-draft`,
    )
  }

  getAppliedCycleQuestionnaire(
    cycleId: string,
    cycleQuestionnaireId: string,
  ): Promise<AppliedCycleQuestionnaire> {
    return this.request<AppliedCycleQuestionnaire>(
      `/evaluation-cycles/${encodeURIComponent(cycleId)}/questionnaires/${encodeURIComponent(
        cycleQuestionnaireId,
      )}`,
    )
  }

  createEvaluationCycle(input: CreateEvaluationCycleInput): Promise<CreatedEvaluationCycle> {
    return this.request<CreatedEvaluationCycle>('/evaluation-cycles', {
      method: 'POST',
      body: input,
      requiresCsrf: true,
    })
  }

  replaceEvaluationCycle(cycleId: string, input: ReplaceEvaluationCycleInput): Promise<void> {
    return this.request<void>(`/evaluation-cycles/${encodeURIComponent(cycleId)}`, {
      method: 'PUT',
      body: input,
      requiresCsrf: true,
    })
  }

  openEvaluationCycle(cycleId: string): Promise<void> {
    return this.request<void>(`/evaluation-cycles/${encodeURIComponent(cycleId)}/open`, {
      method: 'POST',
      requiresCsrf: true,
    })
  }

  closeEvaluationCycle(cycleId: string): Promise<void> {
    return this.request<void>(`/evaluation-cycles/${encodeURIComponent(cycleId)}/close`, {
      method: 'POST',
      requiresCsrf: true,
    })
  }

  listAssessments(request: AssessmentListRequest = {}): Promise<Page<AssessmentSummary>> {
    const parameters = new URLSearchParams()
    if (request.limit !== undefined) {
      parameters.set('limit', String(request.limit))
    }
    if (request.cursor) {
      parameters.set('cursor', request.cursor)
    }
    if (request.cycleId) {
      parameters.set('cycleId', request.cycleId)
    }
    if (request.collaboratorId) {
      parameters.set('collaboratorId', request.collaboratorId)
    }
    const query = parameters.size > 0 ? `?${parameters.toString()}` : ''
    return this.request<Page<AssessmentSummary>>(`/assessments${query}`)
  }

  async listManagerAssessmentCreationOptions(
    cycleId: string,
  ): Promise<readonly ManagerAssessmentCreationOption[]> {
    const options = await this.request<{
      collaborators: readonly ManagerAssessmentCreationOption[]
    }>(`/assessments/creation-options?cycleId=${encodeURIComponent(cycleId)}`)
    return options.collaborators
  }

  createAssessment(input: CreateAssessmentInput): Promise<AssessmentDetail> {
    return this.request<AssessmentDetail>('/assessments', {
      method: 'POST',
      body: input,
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      requiresCsrf: true,
    })
  }

  getAssessment(assessmentId: string): Promise<AssessmentDetail> {
    return this.request<AssessmentDetail>(`/assessments/${encodeURIComponent(assessmentId)}`)
  }

  recordAssessmentPrint(assessmentId: string): Promise<void> {
    return this.request<void>(`/assessments/${encodeURIComponent(assessmentId)}/print-events`, {
      method: 'POST',
      requiresCsrf: true,
    })
  }

  saveAssessment(
    assessmentId: string,
    draft: AssessmentDraftInput,
    revision?: string,
  ): Promise<AssessmentDetail> {
    return this.request<AssessmentDetail>(`/assessments/${encodeURIComponent(assessmentId)}`, {
      method: 'PATCH',
      body: draft,
      headers: revision ? { 'If-Match': revision } : undefined,
      requiresCsrf: true,
    })
  }

  submitAssessment(assessmentId: string, revision?: string): Promise<AssessmentDetail> {
    const headers: Record<string, string> = {
      'Idempotency-Key': crypto.randomUUID(),
    }
    if (revision) {
      headers['If-Match'] = revision
    }

    return this.request<AssessmentDetail>(
      `/assessments/${encodeURIComponent(assessmentId)}/submit`,
      {
        method: 'POST',
        headers,
        requiresCsrf: true,
      },
    )
  }

  publishAssessment(assessmentId: string): Promise<AssessmentDetail> {
    return this.request<AssessmentDetail>(
      `/assessments/${encodeURIComponent(assessmentId)}/publish`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        requiresCsrf: true,
      },
    )
  }

  reopenAssessment(assessmentId: string, reason: string): Promise<AssessmentDetail> {
    return this.request<AssessmentDetail>(
      `/assessments/${encodeURIComponent(assessmentId)}/reopen`,
      {
        method: 'POST',
        body: { reason },
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        requiresCsrf: true,
      },
    )
  }

  getIndicatorFilterOptions(cycleId: string): Promise<IndicatorFilterOptions> {
    return this.request<IndicatorFilterOptions>(
      `/indicators/options?cycleId=${encodeURIComponent(cycleId)}`,
    )
  }

  getIndicators(query: IndicatorQuery): Promise<IndicatorResponse> {
    return this.request<IndicatorResponse>(`/indicators${indicatorQueryString(query)}`)
  }

  async exportIndicators(query: IndicatorQuery): Promise<IndicatorExport | IndicatorResponse> {
    const response = await this.send('/indicators/exports', {
      method: 'POST',
      body: query,
      headers: { Accept: 'text/csv, application/json' },
      requiresCsrf: true,
    })

    if (!response.ok) {
      throw await toApiError(response)
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      return (await response.json()) as IndicatorResponse
    }

    return {
      filename: filenameFrom(response.headers.get('content-disposition')),
      content: await response.blob(),
    }
  }

  private async request<ResponseType>(
    path: string,
    options: RequestOptions = {},
  ): Promise<ResponseType> {
    let response = await this.send(path, options)
    if (!response.ok && response.status === 401 && !options.skipSessionRecovery) {
      if (await this.recoverSession()) {
        response = await this.send(path, options)
      }
    }
    if (!response.ok && response.status === 403 && options.requiresCsrf) {
      // O filtro CSRF rejeita a chamada antes de alcançar controller, serviço, auditoria ou
      // persistência. Uma única repetição com token novo recupera um cookie rotacionado sem
      // duplicar a operação de escrita.
      this.csrfToken = undefined
      response = await this.send(path, options)
    }
    if (!response.ok) {
      throw await toApiError(response)
    }

    if (response.status === 204) {
      return undefined as ResponseType
    }

    const body = await response.text()
    return body ? (JSON.parse(body) as ResponseType) : (undefined as ResponseType)
  }

  private async send(path: string, options: RequestOptions): Promise<Response> {
    const headers = new Headers(options.headers)
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json')
    }

    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json')
    }

    if (options.requiresCsrf) {
      headers.set('X-CSRF-TOKEN', await this.getCsrfToken())
    }

    return fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  }

  private getCsrfToken(): Promise<string> {
    if (this.csrfToken) {
      return Promise.resolve(this.csrfToken)
    }

    if (!this.csrfRequest) {
      this.csrfRequest = this.loadCsrfToken().finally(() => {
        this.csrfRequest = undefined
      })
    }

    return this.csrfRequest
  }

  private recoverSession(): Promise<boolean> {
    if (!this.sessionRefreshRequest) {
      this.sessionRefreshRequest = this.refreshSession()
        .then((user) => user !== null)
        .finally(() => {
          this.sessionRefreshRequest = undefined
        })
    }

    return this.sessionRefreshRequest
  }

  private async loadCsrfToken(): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/auth/csrf`, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    })

    if (!response.ok) {
      throw await toApiError(response)
    }

    const body = await response.text()
    const payload = body ? (JSON.parse(body) as Record<string, unknown>) : {}
    const token = response.headers.get('X-CSRF-TOKEN') ?? payload.token ?? payload.csrfToken
    if (typeof token !== 'string' || token.length === 0) {
      throw new ApiError({ status: 500, code: 'CSRF_TOKEN_UNAVAILABLE' })
    }

    this.csrfToken = token
    return token
  }
}

function indicatorQueryString(query: IndicatorQuery): string {
  const parameters = new URLSearchParams({
    cycleId: query.cycleId,
    metric: query.metric,
  })

  if (query.branchId) {
    parameters.set('branchId', query.branchId)
  }
  if (query.areaId) {
    parameters.set('areaId', query.areaId)
  }
  if (query.managerUserId) {
    parameters.set('managerUserId', query.managerUserId)
  }
  if (query.competencyId) {
    parameters.set('competencyId', query.competencyId)
  }

  return `?${parameters.toString()}`
}

async function toApiError(response: Response): Promise<ApiError> {
  let problem: Partial<ApiProblem> = {}
  try {
    problem = (await response.json()) as Partial<ApiProblem>
  } catch {
    // Respostas não JSON nunca são exibidas ao usuário.
  }

  return new ApiError({
    status: response.status,
    code: typeof problem.code === 'string' ? problem.code : undefined,
    requestId: typeof problem.requestId === 'string' ? problem.requestId : undefined,
    errors: Array.isArray(problem.errors) ? problem.errors : undefined,
  })
}

function filenameFrom(contentDisposition: string | null): string {
  const match = contentDisposition?.match(/filename="?([^";]+)"?/i)
  return match?.[1] ?? 'indicadores.csv'
}

export const defaultApiClient = new HttpApiClient()
