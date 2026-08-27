import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ClipboardList, Plus, RefreshCw, Send } from 'lucide-react'
import type { FormEvent, ReactNode } from 'react'
import { isAuthenticationError } from '../../api/client'
import type { ApiClient } from '../../api/client'
import type {
  AssessmentSummary,
  EvaluationCycle,
  ManagerAssessmentCreationOption,
  Page,
} from '../../api/contracts'
import { FeedbackMessage } from '../../ui/Feedback'
import { Pagination } from '../../ui/Pagination'
import { safeErrorMessage } from '../../ui/safeErrorMessage'
import { AssessmentEditor } from './AssessmentEditor'

type AssessmentsPanelProps = {
  api: ApiClient
  canCreateManagerAssessment: boolean
  canCreateSelfAssessment: boolean
  canSubmitSelfAssessment: boolean
  canPublishAssessments: boolean
  canReopenAssessments: boolean
  journey?: 'EQUIPE' | 'AUTOAVALIACAO'
  assessmentId?: string
  onExitEditor: () => void
  onSelectAssessment: (assessmentId: string) => void
  onSessionExpired: () => void
}

const assessmentsPageSize = 12

export function AssessmentsPanel({
  api,
  canCreateManagerAssessment,
  canCreateSelfAssessment,
  canSubmitSelfAssessment,
  canPublishAssessments,
  canReopenAssessments,
  journey,
  assessmentId,
  onExitEditor,
  onSelectAssessment,
  onSessionExpired,
}: AssessmentsPanelProps) {
  const selfCycleId = useId()
  const managerCycleId = useId()
  const managerCollaboratorId = useId()
  const [assessmentPage, setAssessmentPage] = useState<Page<AssessmentSummary>>({
    items: [],
    page: { limit: assessmentsPageSize, nextCursor: null },
  })
  const [pageNumber, setPageNumber] = useState(1)
  const [cursorHistory, setCursorHistory] = useState<readonly string[]>([])
  const [cycles, setCycles] = useState<readonly EvaluationCycle[]>([])
  const [selectedCycleId, setSelectedCycleId] = useState('')
  const [selectedManagerCycleId, setSelectedManagerCycleId] = useState('')
  const [managerCollaborators, setManagerCollaborators] = useState<
    readonly ManagerAssessmentCreationOption[]
  >([])
  const [selectedManagerCollaboratorId, setSelectedManagerCollaboratorId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingCycles, setIsLoadingCycles] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isLoadingManagerCollaborators, setIsLoadingManagerCollaborators] = useState(false)
  const [isCreatingManagerAssessment, setIsCreatingManagerAssessment] = useState(false)
  const [error, setError] = useState<string>()
  const [creationError, setCreationError] = useState<string>()
  const [managerCreationError, setManagerCreationError] = useState<string>()
  const isPageNavigationPending = useRef(false)

  const assessmentMetrics = useMemo(
    () => ({
      total: assessmentPage.items.length,
      drafts: assessmentPage.items.filter((assessment) => assessment.status === 'RASCUNHO').length,
      submitted: assessmentPage.items.filter((assessment) => assessment.status === 'ENVIADA')
        .length,
      published: assessmentPage.items.filter((assessment) => assessment.status === 'PUBLICADA')
        .length,
    }),
    [assessmentPage.items],
  )

  const loadAssessments = useCallback(
    async (cursor?: string, reset = false) => {
      try {
        const loadedPage = await api.listAssessments({ limit: assessmentsPageSize, cursor })
        // Compatibilidade transitória com respostas de builds locais anteriores ao cursor.
        const page = Array.isArray(loadedPage)
          ? { items: loadedPage, page: { limit: assessmentsPageSize, nextCursor: null } }
          : loadedPage
        setAssessmentPage(page)
        if (reset) {
          setPageNumber(1)
          setCursorHistory([])
        }
      } catch (requestError) {
        if (isAuthenticationError(requestError)) {
          onSessionExpired()
          return
        }
        setError(safeErrorMessage(requestError))
      } finally {
        isPageNavigationPending.current = false
        setIsLoading(false)
      }
    },
    [api, onSessionExpired],
  )

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Network loading is asynchronous.
    void loadAssessments(undefined, true)
  }, [loadAssessments])

  useEffect(() => {
    if (!canCreateSelfAssessment && !canCreateManagerAssessment) {
      return undefined
    }

    let isCurrent = true
    async function loadCycles() {
      setIsLoadingCycles(true)
      setCreationError(undefined)
      try {
        const availableCycles = await api.listAllCycles()
        if (isCurrent) {
          setCycles(availableCycles)
        }
      } catch (requestError) {
        if (isAuthenticationError(requestError)) {
          onSessionExpired()
          return
        }
        if (isCurrent) {
          setCreationError(safeErrorMessage(requestError))
        }
      } finally {
        if (isCurrent) {
          setIsLoadingCycles(false)
        }
      }
    }

    // oxlint-disable-next-line react/set-state-in-effect -- Network loading is asynchronous.
    void loadCycles()
    return () => {
      isCurrent = false
    }
  }, [api, canCreateManagerAssessment, canCreateSelfAssessment, onSessionExpired])

  useEffect(() => {
    if (!canCreateManagerAssessment || !selectedManagerCycleId) {
      return undefined
    }

    let isCurrent = true
    async function loadManagerCollaborators() {
      setIsLoadingManagerCollaborators(true)
      setManagerCreationError(undefined)
      try {
        const collaborators = await api.listManagerAssessmentCreationOptions(selectedManagerCycleId)
        if (isCurrent) {
          setManagerCollaborators(collaborators)
          setSelectedManagerCollaboratorId('')
        }
      } catch (requestError) {
        if (isAuthenticationError(requestError)) {
          onSessionExpired()
          return
        }
        if (isCurrent) {
          setManagerCollaborators([])
          setManagerCreationError(safeErrorMessage(requestError))
        }
      } finally {
        if (isCurrent) {
          setIsLoadingManagerCollaborators(false)
        }
      }
    }

    // oxlint-disable-next-line react/set-state-in-effect -- Network loading is asynchronous.
    void loadManagerCollaborators()
    return () => {
      isCurrent = false
    }
  }, [api, canCreateManagerAssessment, onSessionExpired, selectedManagerCycleId])

  function refreshAssessments() {
    if (isPageNavigationPending.current) {
      return
    }
    isPageNavigationPending.current = true
    setIsLoading(true)
    setError(undefined)
    void loadAssessments(undefined, true)
  }

  function goToNextPage() {
    const nextCursor = assessmentPage.page.nextCursor
    if (!nextCursor || isPageNavigationPending.current) {
      return
    }
    isPageNavigationPending.current = true
    setIsLoading(true)
    setError(undefined)
    setCursorHistory((current) => [...current, nextCursor])
    setPageNumber((current) => current + 1)
    void loadAssessments(nextCursor)
  }

  function goToPreviousPage() {
    if (isPageNavigationPending.current) {
      return
    }
    isPageNavigationPending.current = true
    const previousCursor = cursorHistory.at(-2)
    if (pageNumber <= 2 || !previousCursor) {
      setCursorHistory([])
      setPageNumber(1)
      setIsLoading(true)
      setError(undefined)
      void loadAssessments()
      return
    }
    setCursorHistory((current) => current.slice(0, -1))
    setPageNumber((current) => current - 1)
    setIsLoading(true)
    setError(undefined)
    void loadAssessments(previousCursor)
  }

  function selectManagerCycle(cycleId: string) {
    setSelectedManagerCycleId(cycleId)
    setManagerCollaborators([])
    setSelectedManagerCollaboratorId('')
    setManagerCreationError(undefined)
  }

  async function createSelfAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreationError(undefined)
    if (!selectedCycleId) {
      setCreationError('Selecione o ciclo para criar sua autoavaliação.')
      return
    }

    setIsCreating(true)
    try {
      const created = await api.createAssessment({
        type: 'AUTOAVALIACAO',
        cycleId: selectedCycleId,
      })
      setSelectedCycleId('')
      onSelectAssessment(created.id)
      refreshAssessments()
    } catch (requestError) {
      if (isAuthenticationError(requestError)) {
        onSessionExpired()
        return
      }
      setCreationError(safeErrorMessage(requestError))
    } finally {
      setIsCreating(false)
    }
  }

  async function createManagerAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setManagerCreationError(undefined)
    if (!selectedManagerCycleId) {
      setManagerCreationError('Selecione o ciclo para criar a avaliação de gestor.')
      return
    }
    if (!selectedManagerCollaboratorId) {
      setManagerCreationError('Selecione um colaborador autorizado pelo servidor.')
      return
    }

    setIsCreatingManagerAssessment(true)
    try {
      const created = await api.createAssessment({
        type: 'GESTOR',
        cycleId: selectedManagerCycleId,
        collaboratorId: selectedManagerCollaboratorId,
      })
      setSelectedManagerCollaboratorId('')
      onSelectAssessment(created.id)
      refreshAssessments()
    } catch (requestError) {
      if (isAuthenticationError(requestError)) {
        onSessionExpired()
        return
      }
      setManagerCreationError(safeErrorMessage(requestError))
    } finally {
      setIsCreatingManagerAssessment(false)
    }
  }

  if (assessmentId) {
    return (
      <AssessmentEditor
        api={api}
        assessmentId={assessmentId}
        canEditManagerAssessment={canCreateManagerAssessment}
        canEditSelfAssessment={canCreateSelfAssessment}
        canPublish={canPublishAssessments}
        canReopen={canReopenAssessments}
        canSubmitSelfAssessment={canSubmitSelfAssessment}
        onBack={onExitEditor}
        onChanged={refreshAssessments}
        onSessionExpired={onSessionExpired}
      />
    )
  }

  return (
    <section aria-labelledby="assessments-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Minhas avaliações</p>
          <h2 id="assessments-title">Avaliações autorizadas</h2>
          <p className="muted">
            A lista é definida pelo servidor conforme seu vínculo e suas permissões.
          </p>
        </div>
        <button className="button" type="button" onClick={refreshAssessments} disabled={isLoading}>
          <RefreshCw aria-hidden="true" size={17} strokeWidth={2} />
          Atualizar
        </button>
      </div>

      {!isLoading && !error ? (
        <dl className="kpi-grid kpi-grid--summary" aria-label="Resumo de avaliações">
          <Metric label="Total" value={assessmentMetrics.total} icon={<ClipboardList />} />
          <Metric label="Rascunhos" value={assessmentMetrics.drafts} icon={<Plus />} />
          <Metric label="Enviadas" value={assessmentMetrics.submitted} icon={<Send />} />
          <Metric label="Publicadas" value={assessmentMetrics.published} icon={<CheckCircle2 />} />
        </dl>
      ) : null}

      {canCreateManagerAssessment || canCreateSelfAssessment ? (
        <div className="assessment-creation-grid">
          {canCreateManagerAssessment ? (
            <section
              className="card assessment-creation-card"
              aria-labelledby="create-manager-assessment-title"
            >
              <div className="assessment-creation-card__header">
                <h3 id="create-manager-assessment-title">Criar avaliação de gestor</h3>
                <p className="muted">
                  {journey === 'EQUIPE' ? (
                    <span className="assessment-creation-card__journey">Jornada: Equipe</span>
                  ) : null}{' '}
                  O servidor confirma o questionário pela atribuição ativa e apresenta somente
                  colaboradores com vínculo ativo e questionário atribuído no ciclo selecionado.
                </p>
              </div>
              <form
                className="stack-form assessment-creation-form assessment-creation-form--manager"
                onSubmit={createManagerAssessment}
                noValidate
                aria-busy={isCreatingManagerAssessment}
              >
                {managerCreationError ? (
                  <FeedbackMessage kind="error">{managerCreationError}</FeedbackMessage>
                ) : null}
                <div className="field">
                  <label htmlFor={managerCycleId}>Ciclo para avaliação de gestor</label>
                  <select
                    id={managerCycleId}
                    value={selectedManagerCycleId}
                    onChange={(event) => selectManagerCycle(event.target.value)}
                    disabled={isLoadingCycles || isCreatingManagerAssessment}
                    required
                  >
                    <option value="">Selecione um ciclo</option>
                    {cycles.map((cycle) => (
                      <option key={cycle.id} value={cycle.id}>
                        {cycle.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={managerCollaboratorId}>Colaborador autorizado</label>
                  <select
                    id={managerCollaboratorId}
                    value={selectedManagerCollaboratorId}
                    onChange={(event) => setSelectedManagerCollaboratorId(event.target.value)}
                    disabled={
                      !selectedManagerCycleId ||
                      isLoadingManagerCollaborators ||
                      isCreatingManagerAssessment
                    }
                    required
                  >
                    <option value="">Selecione um colaborador</option>
                    {managerCollaborators.map((collaborator) => (
                      <option key={collaborator.id} value={collaborator.id}>
                        {collaborator.displayName}
                      </option>
                    ))}
                  </select>
                  {isLoadingManagerCollaborators ? (
                    <p className="field-hint">Carregando colaboradores autorizados…</p>
                  ) : null}
                  {selectedManagerCycleId &&
                  !isLoadingManagerCollaborators &&
                  managerCollaborators.length === 0 ? (
                    <p className="field-hint">
                      Não há colaboradores elegíveis para uma nova avaliação neste ciclo.
                    </p>
                  ) : null}
                </div>
                <div className="action-row">
                  <button
                    className="button button--primary"
                    type="submit"
                    disabled={
                      !selectedManagerCycleId ||
                      !selectedManagerCollaboratorId ||
                      isLoadingCycles ||
                      isLoadingManagerCollaborators ||
                      isCreatingManagerAssessment
                    }
                  >
                    <Plus aria-hidden="true" size={17} strokeWidth={2} />
                    {isCreatingManagerAssessment ? 'Criando…' : 'Criar avaliação de gestor'}
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          {canCreateSelfAssessment ? (
            <section
              className="card assessment-creation-card"
              aria-labelledby="create-self-assessment-title"
            >
              <div className="assessment-creation-card__header">
                <h3 id="create-self-assessment-title">Criar autoavaliação</h3>
                <p className="muted">
                  Escolha um ciclo autorizado. Sua avaliação será criada em rascunho para
                  preenchimento.
                </p>
              </div>
              <form
                className="stack-form"
                onSubmit={createSelfAssessment}
                noValidate
                aria-busy={isCreating}
              >
                {creationError ? (
                  <FeedbackMessage kind="error">{creationError}</FeedbackMessage>
                ) : null}
                <div className="field">
                  <label htmlFor={selfCycleId}>Ciclo para autoavaliação</label>
                  <select
                    id={selfCycleId}
                    value={selectedCycleId}
                    onChange={(event) => setSelectedCycleId(event.target.value)}
                    disabled={isLoadingCycles || isCreating}
                    required
                  >
                    <option value="">Selecione um ciclo</option>
                    {cycles.map((cycle) => (
                      <option key={cycle.id} value={cycle.id}>
                        {cycle.name}
                      </option>
                    ))}
                  </select>
                  {isLoadingCycles ? (
                    <p className="field-hint">Carregando ciclos autorizados…</p>
                  ) : null}
                </div>
                <div className="action-row">
                  <button
                    className="button button--primary"
                    type="submit"
                    disabled={isLoadingCycles || isCreating || cycles.length === 0}
                  >
                    <Plus aria-hidden="true" size={17} strokeWidth={2} />
                    {isCreating ? 'Criando…' : 'Criar autoavaliação'}
                  </button>
                </div>
              </form>
            </section>
          ) : null}
        </div>
      ) : null}

      {isLoading ? <FeedbackMessage kind="info">Carregando avaliações…</FeedbackMessage> : null}
      {error ? <FeedbackMessage kind="error">{error}</FeedbackMessage> : null}

      {!isLoading && !error && assessmentPage.items.length === 0 ? (
        <FeedbackMessage kind="warning">
          Não há avaliações disponíveis para sua conta neste momento.
        </FeedbackMessage>
      ) : null}

      <ul className="assessment-list" aria-busy={isLoading}>
        {assessmentPage.items.map((assessment) => (
          <li className="card assessment-list__item" key={assessment.id}>
            <div>
              <h3>{assessment.evaluated.displayName}</h3>
              <p id={`assessment-${assessment.id}-summary`}>
                {assessment.cycle.name} · {formatAssessmentType(assessment.type)}
              </p>
              <span className={`status-badge status-badge--${assessment.status.toLowerCase()}`}>
                {formatAssessmentStatus(assessment.status)}
              </span>
            </div>
            <button
              className="button button--primary"
              type="button"
              aria-describedby={`assessment-${assessment.id}-summary`}
              onClick={() => onSelectAssessment(assessment.id)}
            >
              Abrir avaliação
            </button>
          </li>
        ))}
      </ul>
      <Pagination
        currentPage={pageNumber}
        hasNextPage={assessmentPage.page.nextCursor !== null}
        itemCountOnPage={assessmentPage.items.length}
        itemLabel="avaliações"
        isLoading={isLoading}
        onNextPage={goToNextPage}
        onPreviousPage={goToPreviousPage}
      />
    </section>
  )
}

function Metric({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="kpi-card">
      <dt>{label}</dt>
      <dd>{value}</dd>
      <span aria-hidden="true" className="kpi-card__icon">
        {icon}
      </span>
    </div>
  )
}

function formatAssessmentStatus(status: string): string {
  const labels: Record<string, string> = {
    RASCUNHO: 'Rascunho',
    ENVIADA: 'Enviada',
    PUBLICADA: 'Publicada',
  }
  return labels[status] ?? status
}

function formatAssessmentType(type: string): string {
  return type === 'AUTOAVALIACAO' ? 'Autoavaliação' : 'Avaliação de gestor'
}
