import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ClipboardList, Plus, RefreshCw, Send } from 'lucide-react'
import type { FormEvent, ReactNode } from 'react'
import { isAuthenticationError } from '../../api/client'
import type { ApiClient } from '../../api/client'
import type {
  AssessmentDetail,
  AssessmentSummary,
  AdministrativeCollaborator,
  EvaluationCycle,
  ManagerAssessmentCreationOption,
  Page,
} from '../../api/contracts'
import { FeedbackMessage } from '../../ui/Feedback'
import { ContextHelp } from '../../ui/ContextHelp'
import { EmptyState } from '../../ui/EmptyState'
import { Pagination } from '../../ui/Pagination'
import { safeErrorMessage } from '../../ui/safeErrorMessage'
import { AssessmentEditor } from './AssessmentEditor'
import { IndividualAssessmentSummary } from './IndividualAssessmentSummary'

type AssessmentsPanelProps = {
  api: ApiClient
  canCreateManagerAssessment: boolean
  canCreateDirectorAssessment: boolean
  canCreateSelfAssessment: boolean
  canSubmitSelfAssessment: boolean
  canPublishAssessments: boolean
  canReopenAssessments: boolean
  canRecordFeedback: boolean
  isAdministrativeView: boolean
  canUseAdministrativeFilters: boolean
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
  canCreateDirectorAssessment,
  canCreateSelfAssessment,
  canSubmitSelfAssessment,
  canPublishAssessments,
  canReopenAssessments,
  canRecordFeedback,
  isAdministrativeView,
  canUseAdministrativeFilters,
  journey,
  assessmentId,
  onExitEditor,
  onSelectAssessment,
  onSessionExpired,
}: AssessmentsPanelProps) {
  const selfCycleId = useId()
  const managerCycleId = useId()
  const managerCollaboratorId = useId()
  const directorCycleId = useId()
  const directorCollaboratorId = useId()
  const [assessmentPage, setAssessmentPage] = useState<Page<AssessmentSummary>>({
    items: [],
    page: { limit: assessmentsPageSize, nextCursor: null },
  })
  const [pageNumber, setPageNumber] = useState(1)
  const [cursorHistory, setCursorHistory] = useState<readonly string[]>([])
  const [cycles, setCycles] = useState<readonly EvaluationCycle[]>([])
  const [administrativeCycles, setAdministrativeCycles] = useState<readonly EvaluationCycle[]>([])
  const [administrativeCollaborators, setAdministrativeCollaborators] = useState<
    readonly AdministrativeCollaborator[]
  >([])
  const [administrativeCycleId, setAdministrativeCycleId] = useState('')
  const [administrativeCollaboratorId, setAdministrativeCollaboratorId] = useState('')
  const [previewedAssessmentId, setPreviewedAssessmentId] = useState<string>()
  const [previewAssessment, setPreviewAssessment] = useState<AssessmentDetail>()
  const [previewError, setPreviewError] = useState<string>()
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [selectedCycleId, setSelectedCycleId] = useState('')
  const [selectedManagerCycleId, setSelectedManagerCycleId] = useState('')
  const [managerCollaborators, setManagerCollaborators] = useState<
    readonly ManagerAssessmentCreationOption[]
  >([])
  const [selectedManagerCollaboratorId, setSelectedManagerCollaboratorId] = useState('')
  const [selectedDirectorCycleId, setSelectedDirectorCycleId] = useState('')
  const [directorCollaborators, setDirectorCollaborators] = useState<
    readonly ManagerAssessmentCreationOption[]
  >([])
  const [selectedDirectorCollaboratorId, setSelectedDirectorCollaboratorId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingCycles, setIsLoadingCycles] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isLoadingManagerCollaborators, setIsLoadingManagerCollaborators] = useState(false)
  const [isCreatingManagerAssessment, setIsCreatingManagerAssessment] = useState(false)
  const [isLoadingDirectorCollaborators, setIsLoadingDirectorCollaborators] = useState(false)
  const [isCreatingDirectorAssessment, setIsCreatingDirectorAssessment] = useState(false)
  const [error, setError] = useState<string>()
  const [creationError, setCreationError] = useState<string>()
  const [managerCreationError, setManagerCreationError] = useState<string>()
  const [directorCreationError, setDirectorCreationError] = useState<string>()
  const isPageNavigationPending = useRef(false)
  const managerCreationCardRef = useRef<HTMLElement>(null)
  const selfCreationCardRef = useRef<HTMLElement>(null)

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
        const loadedPage = await api.listAssessments({
          limit: assessmentsPageSize,
          cursor,
          cycleId: canUseAdministrativeFilters ? administrativeCycleId || undefined : undefined,
          collaboratorId: canUseAdministrativeFilters
            ? administrativeCollaboratorId || undefined
            : undefined,
        })
        // Compatibilidade transitória com respostas de builds locais anteriores ao cursor.
        const page = Array.isArray(loadedPage)
          ? { items: loadedPage, page: { limit: assessmentsPageSize, nextCursor: null } }
          : loadedPage
        setAssessmentPage(page)
        if (canUseAdministrativeFilters && administrativeCycleId && administrativeCollaboratorId) {
          const completedAssessments = page.items.filter(
            (assessment) => assessment.status === 'ENVIADA' || assessment.status === 'PUBLICADA',
          )
          setPreviewedAssessmentId((current) =>
            completedAssessments.some((assessment) => assessment.id === current)
              ? current
              : completedAssessments[0]?.id,
          )
        } else {
          setPreviewedAssessmentId(undefined)
          setPreviewAssessment(undefined)
          setPreviewError(undefined)
        }
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
    [
      administrativeCollaboratorId,
      administrativeCycleId,
      api,
      canUseAdministrativeFilters,
      onSessionExpired,
    ],
  )

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Network loading is asynchronous.
    void loadAssessments(undefined, true)
  }, [loadAssessments])

  useEffect(() => {
    if (!canUseAdministrativeFilters) {
      return undefined
    }

    let isCurrent = true
    async function loadAdministrativeFilters() {
      try {
        const [loadedCycles, loadedCollaborators] = await Promise.all([
          api.listAllCycles(),
          api.listCollaborators(),
        ])
        if (isCurrent) {
          setAdministrativeCycles(loadedCycles)
          setAdministrativeCollaborators(
            loadedCollaborators.filter((collaborator) => collaborator.active),
          )
        }
      } catch (requestError) {
        if (isAuthenticationError(requestError)) {
          onSessionExpired()
        } else if (isCurrent) {
          setError(safeErrorMessage(requestError))
        }
      }
    }

    void loadAdministrativeFilters()
    return () => {
      isCurrent = false
    }
  }, [api, canUseAdministrativeFilters, onSessionExpired])

  useEffect(() => {
    if (!previewedAssessmentId) {
      return undefined
    }

    const assessmentIdForPreview = previewedAssessmentId
    let isCurrent = true
    async function loadPreview() {
      setIsLoadingPreview(true)
      setPreviewError(undefined)
      setPreviewAssessment(undefined)
      try {
        const detail = await api.getAssessment(assessmentIdForPreview)
        if (isCurrent) {
          setPreviewAssessment(detail)
        }
      } catch (requestError) {
        if (isAuthenticationError(requestError)) {
          onSessionExpired()
          return
        }
        if (isCurrent) {
          setPreviewError(safeErrorMessage(requestError))
        }
      } finally {
        if (isCurrent) {
          setIsLoadingPreview(false)
        }
      }
    }

    void loadPreview()
    return () => {
      isCurrent = false
    }
  }, [api, onSessionExpired, previewedAssessmentId])

  useEffect(() => {
    if (!canCreateSelfAssessment && !canCreateManagerAssessment && !canCreateDirectorAssessment) {
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
  }, [
    api,
    canCreateDirectorAssessment,
    canCreateManagerAssessment,
    canCreateSelfAssessment,
    onSessionExpired,
  ])

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

  useEffect(() => {
    if (!canCreateDirectorAssessment || !selectedDirectorCycleId) {
      return undefined
    }

    let isCurrent = true
    async function loadDirectorCollaborators() {
      setIsLoadingDirectorCollaborators(true)
      setDirectorCreationError(undefined)
      try {
        const collaborators =
          await api.listDirectorAssessmentCreationOptions(selectedDirectorCycleId)
        if (isCurrent) {
          setDirectorCollaborators(collaborators)
          setSelectedDirectorCollaboratorId('')
        }
      } catch (requestError) {
        if (isAuthenticationError(requestError)) {
          onSessionExpired()
          return
        }
        if (isCurrent) {
          setDirectorCollaborators([])
          setDirectorCreationError(safeErrorMessage(requestError))
        }
      } finally {
        if (isCurrent) {
          setIsLoadingDirectorCollaborators(false)
        }
      }
    }

    void loadDirectorCollaborators()
    return () => {
      isCurrent = false
    }
  }, [api, canCreateDirectorAssessment, onSessionExpired, selectedDirectorCycleId])

  useEffect(() => {
    const destination =
      journey === 'EQUIPE' ? managerCreationCardRef.current : selfCreationCardRef.current
    if (!destination || !journey) {
      return undefined
    }

    const animationFrame = window.requestAnimationFrame(() => {
      destination.focus({ preventScroll: true })
      destination.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(animationFrame)
  }, [journey])

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

  function selectDirectorCycle(cycleId: string) {
    setSelectedDirectorCycleId(cycleId)
    setDirectorCollaborators([])
    setSelectedDirectorCollaboratorId('')
    setDirectorCreationError(undefined)
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

  async function createDirectorAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setDirectorCreationError(undefined)
    if (!selectedDirectorCycleId) {
      setDirectorCreationError('Selecione o ciclo para criar a avaliação de Diretoria.')
      return
    }
    if (!selectedDirectorCollaboratorId) {
      setDirectorCreationError('Selecione uma gerência autorizada pelo servidor.')
      return
    }

    setIsCreatingDirectorAssessment(true)
    try {
      const created = await api.createAssessment({
        type: 'DIRETORIA_GERENCIA',
        cycleId: selectedDirectorCycleId,
        collaboratorId: selectedDirectorCollaboratorId,
      })
      setSelectedDirectorCollaboratorId('')
      onSelectAssessment(created.id)
      refreshAssessments()
    } catch (requestError) {
      if (isAuthenticationError(requestError)) {
        onSessionExpired()
        return
      }
      setDirectorCreationError(safeErrorMessage(requestError))
    } finally {
      setIsCreatingDirectorAssessment(false)
    }
  }

  if (assessmentId) {
    return (
      <AssessmentEditor
        api={api}
        assessmentId={assessmentId}
        canEditManagerAssessment={canCreateManagerAssessment}
        canEditDirectorAssessment={canCreateDirectorAssessment}
        canEditSelfAssessment={canCreateSelfAssessment}
        canPublish={canPublishAssessments}
        canReopen={canReopenAssessments}
        canRecordFeedback={canRecordFeedback}
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
          <p className="eyebrow">{isAdministrativeView ? 'Administração' : 'Minhas avaliações'}</p>
          <div className="context-help__heading">
            <h2 id="assessments-title">
              {isAdministrativeView ? 'Avaliações individuais' : 'Avaliações autorizadas'}
            </h2>
            <ContextHelp title="Entenda a situação das avaliações">
              <ul>
                <li>
                  <span>Rascunho: </span>
                  permanece em preenchimento pelo responsável.
                </li>
                <li>
                  <span>Enviada: </span>
                  aguarda a decisão de publicação dentro do escopo autorizado.
                </li>
                <li>
                  <span>Publicada: </span>
                  mantém o resultado disponível; qualquer reabertura é registrada.
                </li>
              </ul>
              <p className="context-help__note">
                A lista e as ações possíveis são definidas pelo seu perfil, vínculos e ciclo.
              </p>
            </ContextHelp>
          </div>
          <p className="muted">
            {isAdministrativeView
              ? canUseAdministrativeFilters
                ? 'Selecione o ciclo e o colaborador para pré-visualizar o resumo individual; a lista continua disponível para abrir o formulário completo.'
                : 'A lista é definida pelo servidor conforme seu escopo de supervisão, vínculos e permissões.'
              : 'A lista é definida pelo servidor conforme seu vínculo e suas permissões.'}
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

      {canUseAdministrativeFilters ? (
        <section
          className="card assessment-creation-card"
          aria-labelledby="individual-filter-title"
        >
          <div className="assessment-creation-card__header">
            <h3 id="individual-filter-title">Localizar avaliação</h3>
            <p className="muted">
              Selecione o ciclo, o colaborador ou ambos. O servidor só devolve avaliações dentro do
              seu escopo autorizado.
            </p>
          </div>
          <div className="stack-form assessment-creation-form assessment-creation-form--manager">
            <div className="field">
              <label htmlFor="individual-assessment-cycle">Ciclo</label>
              <select
                id="individual-assessment-cycle"
                value={administrativeCycleId}
                onChange={(event) => {
                  setAdministrativeCycleId(event.target.value)
                  setPreviewedAssessmentId(undefined)
                  setPreviewAssessment(undefined)
                  setPreviewError(undefined)
                }}
              >
                <option value="">Todos os ciclos</option>
                {administrativeCycles.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="individual-assessment-collaborator">Colaborador</label>
              <select
                id="individual-assessment-collaborator"
                value={administrativeCollaboratorId}
                onChange={(event) => {
                  setAdministrativeCollaboratorId(event.target.value)
                  setPreviewedAssessmentId(undefined)
                  setPreviewAssessment(undefined)
                  setPreviewError(undefined)
                }}
              >
                <option value="">Todos os colaboradores</option>
                {administrativeCollaborators.map((collaborator) => (
                  <option key={collaborator.id} value={collaborator.id}>
                    {collaborator.displayName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>
      ) : null}

      {canUseAdministrativeFilters && administrativeCycleId && administrativeCollaboratorId ? (
        <section
          aria-label="Pré-visualização da avaliação individual"
          className="assessment-preview"
        >
          {isLoadingPreview ? (
            <FeedbackMessage kind="info">Carregando pré-visualização da avaliação…</FeedbackMessage>
          ) : null}
          {previewError ? <FeedbackMessage kind="error">{previewError}</FeedbackMessage> : null}
          {!isLoading &&
          !isLoadingPreview &&
          !previewError &&
          !previewedAssessmentId &&
          assessmentPage.items.length > 0 ? (
            <FeedbackMessage kind="warning">
              Há avaliação localizada, mas ela ainda está em rascunho. O gráfico aparece depois do
              envio.
            </FeedbackMessage>
          ) : null}
          {!isLoading && !isLoadingPreview && !previewError && assessmentPage.items.length === 0 ? (
            <FeedbackMessage kind="warning">
              Nenhuma avaliação foi localizada para este ciclo e colaborador.
            </FeedbackMessage>
          ) : null}
          {previewedAssessmentId && previewAssessment ? (
            <IndividualAssessmentSummary assessment={previewAssessment} />
          ) : null}
        </section>
      ) : null}

      {canCreateManagerAssessment || canCreateDirectorAssessment || canCreateSelfAssessment ? (
        <div className="assessment-creation-grid">
          {canCreateManagerAssessment ? (
            <section
              className="card assessment-creation-card"
              aria-labelledby="create-manager-assessment-title"
              ref={managerCreationCardRef}
              tabIndex={-1}
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
                    className="button button--success"
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

          {canCreateDirectorAssessment ? (
            <section
              className="card assessment-creation-card"
              aria-labelledby="create-director-assessment-title"
            >
              <div className="assessment-creation-card__header">
                <h3 id="create-director-assessment-title">Criar avaliação de Diretoria</h3>
                <p className="muted">
                  O servidor mostra somente gerências vinculadas à sua Diretoria, com questionário
                  atribuído e vigência ativa no ciclo escolhido.
                </p>
              </div>
              <form
                className="stack-form assessment-creation-form assessment-creation-form--manager"
                onSubmit={createDirectorAssessment}
                noValidate
                aria-busy={isCreatingDirectorAssessment}
              >
                {directorCreationError ? (
                  <FeedbackMessage kind="error">{directorCreationError}</FeedbackMessage>
                ) : null}
                <div className="field">
                  <label htmlFor={directorCycleId}>Ciclo para avaliação de Diretoria</label>
                  <select
                    id={directorCycleId}
                    value={selectedDirectorCycleId}
                    onChange={(event) => selectDirectorCycle(event.target.value)}
                    disabled={isLoadingCycles || isCreatingDirectorAssessment}
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
                  <label htmlFor={directorCollaboratorId}>Gerência autorizada</label>
                  <select
                    id={directorCollaboratorId}
                    value={selectedDirectorCollaboratorId}
                    onChange={(event) => setSelectedDirectorCollaboratorId(event.target.value)}
                    disabled={
                      !selectedDirectorCycleId ||
                      isLoadingDirectorCollaborators ||
                      isCreatingDirectorAssessment
                    }
                    required
                  >
                    <option value="">Selecione uma gerência</option>
                    {directorCollaborators.map((collaborator) => (
                      <option key={collaborator.id} value={collaborator.id}>
                        {collaborator.displayName}
                      </option>
                    ))}
                  </select>
                  {isLoadingDirectorCollaborators ? (
                    <p className="field-hint">Carregando gerências autorizadas…</p>
                  ) : null}
                  {selectedDirectorCycleId &&
                  !isLoadingDirectorCollaborators &&
                  directorCollaborators.length === 0 ? (
                    <p className="field-hint">
                      Não há gerências elegíveis para uma nova avaliação neste ciclo.
                    </p>
                  ) : null}
                </div>
                <div className="action-row">
                  <button
                    className="button button--success"
                    type="submit"
                    disabled={
                      !selectedDirectorCycleId ||
                      !selectedDirectorCollaboratorId ||
                      isLoadingCycles ||
                      isLoadingDirectorCollaborators ||
                      isCreatingDirectorAssessment
                    }
                  >
                    <Plus aria-hidden="true" size={17} strokeWidth={2} />
                    {isCreatingDirectorAssessment ? 'Criando…' : 'Criar avaliação de Diretoria'}
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          {canCreateSelfAssessment ? (
            <section
              className="card assessment-creation-card"
              aria-labelledby="create-self-assessment-title"
              ref={selfCreationCardRef}
              tabIndex={-1}
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
                    className="button button--success"
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
        <EmptyState title="Nenhuma avaliação disponível">
          Não há avaliações no seu escopo neste momento. A disponibilidade depende do perfil, dos
          vínculos ativos, do ciclo e do questionário atribuídos pelo servidor.
        </EmptyState>
      ) : null}

      <ul className="assessment-list" aria-busy={isLoading}>
        {assessmentPage.items.map((assessment) => (
          <li className="card assessment-list__item" key={assessment.id}>
            <div className="assessment-list__details">
              <div className="assessment-list__title">
                <h3>{assessment.evaluated.displayName}</h3>
                <span
                  aria-label={`Situação: ${formatAssessmentStatus(assessment.status)}`}
                  className={`status-badge status-badge--${assessment.status.toLowerCase()}`}
                >
                  {formatAssessmentStatus(assessment.status)}
                </span>
              </div>
              <p className="assessment-list__type">{formatAssessmentType(assessment.type)}</p>
              {assessment.feedbackStatus !== 'NAO_APLICAVEL' ? (
                <p className="assessment-list__feedback-status">
                  Feedback {formatFeedbackStatus(assessment.feedbackStatus)}
                </p>
              ) : null}
              <span className="visually-hidden" id={`assessment-${assessment.id}-summary`}>
                {`${formatAssessmentType(assessment.type)}. Situação: ${formatAssessmentStatus(assessment.status)}.${
                  assessment.feedbackStatus === 'NAO_APLICAVEL'
                    ? ''
                    : ` Feedback ${formatFeedbackStatus(assessment.feedbackStatus)}.`
                }`}
              </span>
            </div>
            <div className="assessment-list__actions">
              <button
                className="button button--primary"
                type="button"
                aria-describedby={`assessment-${assessment.id}-summary`}
                onClick={() => onSelectAssessment(assessment.id)}
              >
                Abrir avaliação
              </button>
              {canUseAdministrativeFilters &&
              administrativeCycleId &&
              administrativeCollaboratorId &&
              (assessment.status === 'ENVIADA' || assessment.status === 'PUBLICADA') ? (
                <button
                  className="button"
                  type="button"
                  onClick={() => setPreviewedAssessmentId(assessment.id)}
                >
                  Pré-visualizar
                </button>
              ) : null}
            </div>
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
  if (type === 'AUTOAVALIACAO') {
    return 'Autoavaliação'
  }
  if (type === 'DIRETORIA_GERENCIA') {
    return 'Avaliação de Diretoria'
  }
  return 'Avaliação de gestor'
}

function formatFeedbackStatus(status: 'PENDENTE' | 'CONCLUIDO'): string {
  return status === 'CONCLUIDO' ? 'concluído' : 'pendente'
}
