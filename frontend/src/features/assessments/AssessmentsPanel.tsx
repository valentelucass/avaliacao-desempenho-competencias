import { ActionButton } from '../../ui/ActionButton'
import { createPortal } from 'react-dom'
import { Badge, type BadgeVariant } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { CheckCircle2, ClipboardList, ListChecks, Plus, RefreshCw, Send } from 'lucide-react'
import type { FormEvent, ReactNode } from 'react'
import { isAuthenticationError } from '../../api/client'
import type { ApiClient } from '../../api/client'
import type {
  AssessmentDetail,
  AssessmentCreationCycleOption,
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
import { safeErrorMessage, safeLoadErrorMessage } from '../../ui/safeErrorMessage'
import { AssessmentEditor } from './AssessmentEditor'
import { IndividualAssessmentSummary } from './IndividualAssessmentSummary'
import { AssessmentListFilters, type AssessmentFilters } from './AssessmentListFilters'
import { AssessmentExportButton } from './AssessmentExportButton'
import { AssessmentCoveragePanel } from './AssessmentCoveragePanel'

type AssessmentsPanelProps = {
  api: ApiClient
  headerHost?: HTMLElement | null
  canCreateManagerAssessment: boolean
  canCreateDirectorAssessment: boolean
  canCreateSelfAssessment: boolean
  canSubmitSelfAssessment: boolean
  canPublishAssessments: boolean
  canReopenAssessments: boolean
  canRecordFeedback: boolean
  isAdministrativeView: boolean
  canUseAdministrativeFilters: boolean
  canExportAssessments?: boolean
  canTrackCoverage?: boolean
  canPrintAssessment?: boolean
  journey?: 'EQUIPE' | 'AUTOAVALIACAO'
  assessmentId?: string
  onExitEditor: () => void
  onSelectAssessment: (assessmentId: string) => void
  onSessionExpired: () => void
}

const assessmentGridBreakpoint = {
  twoColumns: '(min-width: 48.0625rem)',
  threeColumns: '(min-width: 80rem)',
} as const

function pageSizeForAssessmentGrid(): number {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 2
  }
  if (window.matchMedia(assessmentGridBreakpoint.threeColumns).matches) {
    return 6
  }
  return window.matchMedia(assessmentGridBreakpoint.twoColumns).matches ? 4 : 2
}

function useAssessmentGridPageSize(): number {
  const [pageSize, setPageSize] = useState(pageSizeForAssessmentGrid)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return undefined
    }
    const mediaQueries = Object.values(assessmentGridBreakpoint).map((query) =>
      window.matchMedia(query),
    )
    const syncPageSize = () => {
      const nextPageSize = pageSizeForAssessmentGrid()
      setPageSize((currentPageSize) =>
        currentPageSize === nextPageSize ? currentPageSize : nextPageSize,
      )
    }
    mediaQueries.forEach((mediaQuery) => mediaQuery.addEventListener('change', syncPageSize))
    syncPageSize()
    return () =>
      mediaQueries.forEach((mediaQuery) => mediaQuery.removeEventListener('change', syncPageSize))
  }, [])

  return pageSize
}

export function AssessmentsPanel({
  api,
  headerHost,
  canCreateManagerAssessment,
  canCreateDirectorAssessment,
  canCreateSelfAssessment,
  canSubmitSelfAssessment,
  canPublishAssessments,
  canReopenAssessments,
  canRecordFeedback,
  isAdministrativeView,
  canUseAdministrativeFilters,
  canExportAssessments = false,
  canTrackCoverage = false,
  canPrintAssessment = true,
  journey,
  assessmentId,
  onExitEditor,
  onSelectAssessment,
  onSessionExpired,
}: AssessmentsPanelProps) {
  const assessmentsPageSize = useAssessmentGridPageSize()
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
  const [listFilters, setListFilters] = useState<AssessmentFilters>({})
  const listRequestId = useRef(0)
  const hasListFilters = Object.values(listFilters).some(Boolean)
  const [selfCreationCycles, setSelfCreationCycles] = useState<
    readonly AssessmentCreationCycleOption[]
  >([])
  const [managerCreationCycles, setManagerCreationCycles] = useState<
    readonly AssessmentCreationCycleOption[]
  >([])
  const [directorCreationCycles, setDirectorCreationCycles] = useState<
    readonly AssessmentCreationCycleOption[]
  >([])
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
  const [creationOptionsRevision, setCreationOptionsRevision] = useState(0)
  const [creationCyclesError, setCreationCyclesError] = useState<string>()
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

  const [showCoverage, setShowCoverage] = useState(false)
  const [coverageRevision, setCoverageRevision] = useState(0)
  const coverageActive = canTrackCoverage && showCoverage
  const assessmentMetrics = assessmentPage.totals

  const loadAssessments = useCallback(
    async (cursor?: string, reset = false) => {
      const requestId = ++listRequestId.current
      isPageNavigationPending.current = true
      setIsLoading(true)
      setError(undefined)
      if (reset) {
        setPageNumber(1)
        setCursorHistory([])
        setAssessmentPage({ items: [], page: { limit: assessmentsPageSize, nextCursor: null } })
        setPreviewedAssessmentId(undefined)
        setPreviewAssessment(undefined)
        setPreviewError(undefined)
      }
      try {
        const loadedPage = await api.listAssessments({
          ...listFilters,
          limit: assessmentsPageSize,
          cursor,
          cycleId: canUseAdministrativeFilters ? administrativeCycleId || undefined : undefined,
          collaboratorId: canUseAdministrativeFilters
            ? administrativeCollaboratorId || undefined
            : undefined,
        })
        if (requestId !== listRequestId.current) return
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
      } catch (requestError) {
        if (requestId !== listRequestId.current) return
        if (isAuthenticationError(requestError)) {
          onSessionExpired()
          return
        }
        setError(safeLoadErrorMessage(requestError, 'as avaliações'))
      } finally {
        if (requestId === listRequestId.current) {
          isPageNavigationPending.current = false
          setIsLoading(false)
        }
      }
    },
    [
      administrativeCollaboratorId,
      administrativeCycleId,
      api,
      canUseAdministrativeFilters,
      listFilters,
      onSessionExpired,
      assessmentsPageSize,
    ],
  )

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Network loading is asynchronous.
    void loadAssessments(undefined, true)
    return () => {
      listRequestId.current += 1
    }
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
          setError(safeLoadErrorMessage(requestError, 'as opções de avaliação'))
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
    if (
      assessmentId ||
      (!canCreateSelfAssessment && !canCreateManagerAssessment && !canCreateDirectorAssessment)
    ) {
      return undefined
    }

    let isCurrent = true
    async function loadCreationCycles() {
      setIsLoadingCycles(true)
      setCreationCyclesError(undefined)
      setSelfCreationCycles([])
      setManagerCreationCycles([])
      setDirectorCreationCycles([])
      try {
        const [selfCycles, managerCycles, directorCycles] = await Promise.all([
          canCreateSelfAssessment
            ? api.listAssessmentCreationCycleOptions('AUTOAVALIACAO')
            : Promise.resolve([]),
          canCreateManagerAssessment
            ? api.listAssessmentCreationCycleOptions('GESTOR')
            : Promise.resolve([]),
          canCreateDirectorAssessment
            ? api.listAssessmentCreationCycleOptions('DIRETORIA_GERENCIA')
            : Promise.resolve([]),
        ])
        if (isCurrent) {
          setSelfCreationCycles(selfCycles)
          setManagerCreationCycles(managerCycles)
          setDirectorCreationCycles(directorCycles)
          setSelectedCycleId((current) =>
            selfCycles.some((cycle) => cycle.id === current) ? current : '',
          )
          setSelectedManagerCycleId((current) =>
            managerCycles.some((cycle) => cycle.id === current) ? current : '',
          )
          setSelectedDirectorCycleId((current) =>
            directorCycles.some((cycle) => cycle.id === current) ? current : '',
          )
        }
      } catch (requestError) {
        if (isAuthenticationError(requestError)) {
          onSessionExpired()
          return
        }
        if (isCurrent) {
          setCreationCyclesError(
            safeLoadErrorMessage(requestError, 'os ciclos para iniciar avaliações'),
          )
        }
      } finally {
        if (isCurrent) {
          setIsLoadingCycles(false)
        }
      }
    }

    // oxlint-disable-next-line react/set-state-in-effect -- Network loading is asynchronous.
    void loadCreationCycles()
    return () => {
      isCurrent = false
    }
  }, [
    api,
    assessmentId,
    canCreateDirectorAssessment,
    canCreateManagerAssessment,
    canCreateSelfAssessment,
    creationOptionsRevision,
    onSessionExpired,
  ])

  useEffect(() => {
    if (assessmentId || !canCreateManagerAssessment) {
      return undefined
    }

    let isCurrent = true
    async function loadManagerCollaborators() {
      setManagerCreationError(undefined)
      setManagerCollaborators([])
      setSelectedManagerCollaboratorId('')
      if (!selectedManagerCycleId) {
        setIsLoadingManagerCollaborators(false)
        return
      }
      setIsLoadingManagerCollaborators(true)
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
  }, [
    api,
    assessmentId,
    canCreateManagerAssessment,
    creationOptionsRevision,
    onSessionExpired,
    selectedManagerCycleId,
  ])

  useEffect(() => {
    if (assessmentId || !canCreateDirectorAssessment) {
      return undefined
    }

    let isCurrent = true
    async function loadDirectorCollaborators() {
      setDirectorCreationError(undefined)
      setDirectorCollaborators([])
      setSelectedDirectorCollaboratorId('')
      if (!selectedDirectorCycleId) {
        setIsLoadingDirectorCollaborators(false)
        return
      }
      setIsLoadingDirectorCollaborators(true)
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
  }, [
    api,
    assessmentId,
    canCreateDirectorAssessment,
    creationOptionsRevision,
    onSessionExpired,
    selectedDirectorCycleId,
  ])

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
    setCreationOptionsRevision((current) => current + 1)
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
        canPrint={canPrintAssessment}
        onBack={onExitEditor}
        onChanged={refreshAssessments}
        onSessionExpired={onSessionExpired}
      />
    )
  }

  const heading = (
    <div className="ev-page-head">
      <div className="ev-header-title">
        <span>{isAdministrativeView ? 'Administração' : 'Minhas avaliações'}</span>
        <div className="ev-heading-help">
          <Heading level={headerHost ? 1 : 2} id="assessments-title">
            {isAdministrativeView ? 'Avaliações individuais' : 'Avaliações autorizadas'}
          </Heading>
          <ContextHelp title="Entenda a situação das avaliações">
            <ul>
              <li>
                <span>Rascunho: </span>permanece em preenchimento pelo responsável.
              </li>
              <li>
                <span>Enviada: </span>aguarda a decisão de publicação dentro do escopo autorizado.
              </li>
              <li>
                <span>Publicada: </span>mantém o resultado disponível; qualquer reabertura é
                registrada.
              </li>
            </ul>
            <p className="context-help__note">
              A lista e as ações possíveis são definidas pelo seu perfil, vínculos e ciclo.
            </p>
            <p>
              {isAdministrativeView
                ? canUseAdministrativeFilters
                  ? 'Selecione o ciclo e o colaborador para pré-visualizar o resumo individual; a lista continua disponível para abrir o formulário completo.'
                  : 'A lista é definida pelo servidor conforme seu escopo de supervisão, vínculos e permissões.'
                : 'A lista é definida pelo servidor conforme seu vínculo e suas permissões.'}
            </p>
          </ContextHelp>
        </div>
      </div>
      <Button
        label="Atualizar"
        size="sm"
        variant="secondary"
        className="ev-refresh"
        icon={<RefreshCw size={16} aria-hidden="true" />}
        isDisabled={!coverageActive && isLoading}
        onClick={() => {
          if (coverageActive) setCoverageRevision((revision) => revision + 1)
          else refreshAssessments()
        }}
      />
    </div>
  )
  return (
    <section aria-labelledby="assessments-title" className="ev-assessments">
      {headerHost ? createPortal(heading, headerHost) : heading}

      {!coverageActive && (!isLoading || assessmentPage.items.length > 0) && !error ? (
        <dl className="ev-metrics" aria-label="Resumo de avaliações">
          <Metric
            label="Total"
            value={assessmentMetrics?.total ?? '—'}
            icon={<ClipboardList />}
            help="Total em todas as páginas, respeitando os filtros e o seu escopo."
          />
          <Metric
            label="Rascunhos"
            value={assessmentMetrics?.drafts ?? '—'}
            icon={<Plus />}
            help="Ainda estão em preenchimento e não possuem resultado final nem classificação."
          />
          <Metric
            label="Enviadas"
            value={assessmentMetrics?.submitted ?? '—'}
            icon={<Send />}
            help="Foram enviadas pelo responsável e aguardam a publicação dentro do escopo de RH ou Diretoria autorizado."
          />
          <Metric
            label="Publicadas"
            value={assessmentMetrics?.published ?? '—'}
            icon={<CheckCircle2 />}
            help="O resultado está concluído para consulta no escopo permitido. Uma reabertura preserva o histórico."
          />
        </dl>
      ) : null}

      {!coverageActive && !isLoading && !error && assessmentMetrics?.total === null ? (
        <p className="muted" role="status">
          Não há dados suficientes para preservar a confidencialidade dos totais.
        </p>
      ) : null}
      {canUseAdministrativeFilters && !coverageActive ? (
        <section className="ev-create-region" aria-labelledby="individual-filter-title">
          <Card padding={4} className="ev-create-card">
            <div className="assessment-creation-card__header">
              <div className="context-help__heading">
                <h3 id="individual-filter-title">Localizar avaliação</h3>
                <ContextHelp title="Como funcionam estes filtros">
                  <p>
                    Os filtros reduzem somente a lista visualizada. Eles não ampliam seu acesso e
                    são reaplicados pelo servidor a cada consulta.
                  </p>
                </ContextHelp>
              </div>
              <p className="muted">
                Selecione o ciclo, o colaborador ou ambos. O servidor só devolve avaliações dentro
                do seu escopo autorizado.
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
          </Card>
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
          {previewError ? (
            <FeedbackMessage kind="error" onDismiss={() => setPreviewError(undefined)}>
              {previewError}
            </FeedbackMessage>
          ) : null}
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

      {creationCyclesError ? (
        <FeedbackMessage kind="error" onDismiss={() => setCreationCyclesError(undefined)}>
          {creationCyclesError}
        </FeedbackMessage>
      ) : null}

      {canCreateManagerAssessment || canCreateDirectorAssessment || canCreateSelfAssessment ? (
        <div className="assessment-creation-grid">
          {canCreateManagerAssessment ? (
            <section
              className="ev-create-region"
              aria-labelledby="create-manager-assessment-title"
              ref={managerCreationCardRef}
              tabIndex={-1}
            >
              <Card padding={4} className="ev-create-card">
                <div className="assessment-creation-card__header">
                  <div className="context-help__heading">
                    <h3 id="create-manager-assessment-title">Criar avaliação de gestor</h3>
                    <ContextHelp title="Quem pode ser avaliado">
                      <p>
                        A lista contém apenas colaboradores com vínculo ativo à sua gestão e
                        questionário atribuído ao ciclo selecionado.
                      </p>
                    </ContextHelp>
                  </div>
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
                    <FeedbackMessage
                      kind="error"
                      onDismiss={() => setManagerCreationError(undefined)}
                    >
                      {managerCreationError}
                    </FeedbackMessage>
                  ) : null}
                  {isLoadingCycles ? (
                    <p className="field-hint">Verificando ciclos elegíveis…</p>
                  ) : null}
                  {!isLoadingCycles &&
                  !creationCyclesError &&
                  managerCreationCycles.length === 0 ? (
                    <FeedbackMessage kind="info">
                      Não há ciclos disponíveis para uma nova avaliação de gestor. Quando houver um
                      vínculo ativo, questionário atribuído e ciclo vigente, ele aparecerá aqui.
                    </FeedbackMessage>
                  ) : null}
                  {managerCreationCycles.length > 0 ? (
                    <>
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
                          {managerCreationCycles.map((cycle) => (
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
                            As opções mudaram. Escolha outro ciclo elegível para continuar.
                          </p>
                        ) : null}
                      </div>
                      <div className="action-row">
                        <ActionButton
                          size="sm"
                          variant="primary"
                          label={
                            isCreatingManagerAssessment ? 'Criando…' : 'Criar avaliação de gestor'
                          }
                          icon={<Plus aria-hidden="true" size={17} strokeWidth={2} />}
                          type="submit"
                          disabled={
                            !selectedManagerCycleId ||
                            !selectedManagerCollaboratorId ||
                            isLoadingCycles ||
                            isLoadingManagerCollaborators ||
                            isCreatingManagerAssessment
                          }
                        />
                      </div>
                    </>
                  ) : null}
                </form>
              </Card>
            </section>
          ) : null}

          {canCreateDirectorAssessment ? (
            <section
              className="ev-create-region"
              aria-labelledby="create-director-assessment-title"
            >
              <Card padding={4} className="ev-create-card">
                <div className="assessment-creation-card__header">
                  <div className="context-help__heading">
                    <h3 id="create-director-assessment-title">Criar avaliação de Diretoria</h3>
                    <ContextHelp title="Como a Diretoria escolhe uma gerência">
                      <p>
                        A plataforma mostra somente as gerências vinculadas à Diretoria ativa e
                        elegíveis no ciclo. Essa relação é validada pelo servidor.
                      </p>
                    </ContextHelp>
                  </div>
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
                    <FeedbackMessage
                      kind="error"
                      onDismiss={() => setDirectorCreationError(undefined)}
                    >
                      {directorCreationError}
                    </FeedbackMessage>
                  ) : null}
                  {isLoadingCycles ? (
                    <p className="field-hint">Verificando ciclos elegíveis…</p>
                  ) : null}
                  {!isLoadingCycles &&
                  !creationCyclesError &&
                  directorCreationCycles.length === 0 ? (
                    <FeedbackMessage kind="info">
                      Não há ciclos disponíveis para uma nova avaliação de Diretoria. Quando houver
                      uma gerência vinculada, questionário atribuído e ciclo vigente, ele aparecerá
                      aqui.
                    </FeedbackMessage>
                  ) : null}
                  {directorCreationCycles.length > 0 ? (
                    <>
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
                          {directorCreationCycles.map((cycle) => (
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
                          onChange={(event) =>
                            setSelectedDirectorCollaboratorId(event.target.value)
                          }
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
                            As opções mudaram. Escolha outro ciclo elegível para continuar.
                          </p>
                        ) : null}
                      </div>
                      <div className="action-row">
                        <ActionButton
                          size="sm"
                          variant="primary"
                          label={
                            isCreatingDirectorAssessment
                              ? 'Criando…'
                              : 'Criar avaliação de Diretoria'
                          }
                          icon={<Plus aria-hidden="true" size={17} strokeWidth={2} />}
                          type="submit"
                          disabled={
                            !selectedDirectorCycleId ||
                            !selectedDirectorCollaboratorId ||
                            isLoadingCycles ||
                            isLoadingDirectorCollaborators ||
                            isCreatingDirectorAssessment
                          }
                        />
                      </div>
                    </>
                  ) : null}
                </form>
              </Card>
            </section>
          ) : null}

          {canCreateSelfAssessment ? (
            <section
              className="ev-create-region"
              aria-labelledby="create-self-assessment-title"
              ref={selfCreationCardRef}
              tabIndex={-1}
            >
              <Card padding={4} className="ev-create-card">
                <div className="assessment-creation-card__header">
                  <div className="context-help__heading">
                    <h3 id="create-self-assessment-title">Criar autoavaliação</h3>
                    <ContextHelp title="Quando a autoavaliação fica disponível">
                      <p>
                        Ela depende de o ciclo permitir autoavaliação e de haver questionário
                        atribuído à sua conta. A criação começa sempre em rascunho.
                      </p>
                    </ContextHelp>
                  </div>
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
                    <FeedbackMessage kind="error" onDismiss={() => setCreationError(undefined)}>
                      {creationError}
                    </FeedbackMessage>
                  ) : null}
                  {isLoadingCycles ? (
                    <p className="field-hint">Verificando ciclos elegíveis…</p>
                  ) : null}
                  {!isLoadingCycles && !creationCyclesError && selfCreationCycles.length === 0 ? (
                    <FeedbackMessage kind="info">
                      Não há ciclos disponíveis para sua autoavaliação. Ela aparece quando sua conta
                      possui vínculo ativo, questionário atribuído e autoavaliação habilitada em um
                      ciclo vigente.
                    </FeedbackMessage>
                  ) : null}
                  {selfCreationCycles.length > 0 ? (
                    <>
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
                          {selfCreationCycles.map((cycle) => (
                            <option key={cycle.id} value={cycle.id}>
                              {cycle.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="action-row">
                        <ActionButton
                          size="sm"
                          variant="primary"
                          label={isCreating ? 'Criando…' : 'Criar autoavaliação'}
                          icon={<Plus aria-hidden="true" size={17} strokeWidth={2} />}
                          type="submit"
                          disabled={
                            isLoadingCycles || isCreating || selfCreationCycles.length === 0
                          }
                        />
                      </div>
                    </>
                  ) : null}
                </form>
              </Card>
            </section>
          ) : null}
        </div>
      ) : null}

      {coverageActive ? (
        <AssessmentCoveragePanel
          api={api}
          canExport={canExportAssessments}
          refreshRevision={coverageRevision}
          onClose={() => setShowCoverage(false)}
          onSelectAssessment={onSelectAssessment}
          onSessionExpired={onSessionExpired}
        />
      ) : (
        <>
          <AssessmentListFilters
            onApply={setListFilters}
            appliedFilters={listFilters}
            coverageAction={
              canTrackCoverage ? (
                <ActionButton
                  type="button"
                  label="Acompanhar início"
                  size="sm"
                  variant="secondary"
                  icon={<ListChecks size={16} aria-hidden="true" />}
                  onClick={() => setShowCoverage(true)}
                />
              ) : undefined
            }
            exportAction={
              canExportAssessments ? (
                <AssessmentExportButton
                  requestExport={() =>
                    api.exportAssessments({
                      ...listFilters,
                      cycleId: administrativeCycleId || undefined,
                      collaboratorId: administrativeCollaboratorId || undefined,
                    })
                  }
                  disabled={isLoading || !!error}
                  onSessionExpired={onSessionExpired}
                />
              ) : undefined
            }
          />

          {isLoading && assessmentPage.items.length === 0 ? (
            <FeedbackMessage kind="info">Carregando avaliações…</FeedbackMessage>
          ) : null}
          {error ? (
            <FeedbackMessage kind="error" onDismiss={() => setError(undefined)}>
              {error}
            </FeedbackMessage>
          ) : null}

          {!isLoading && !error && assessmentPage.items.length === 0 ? (
            <EmptyState
              title={
                hasListFilters ? 'Nenhuma avaliação encontrada' : 'Nenhuma avaliação disponível'
              }
            >
              {hasListFilters
                ? 'Nenhuma avaliação autorizada corresponde aos filtros. Ajuste os campos ou limpe os filtros para consultar novamente.'
                : 'Não há avaliações no seu escopo neste momento. A disponibilidade depende do perfil, dos vínculos ativos, do ciclo e do questionário atribuídos pelo servidor.'}
            </EmptyState>
          ) : null}

          {assessmentPage.items.length > 0 && (
            <Card padding={0} className="ev-table-card">
              <Table aria-label="Lista de avaliações" className="ev-table" aria-busy={isLoading}>
                <TableHeader>
                  <TableRow isHeaderRow>
                    <TableHeaderCell scope="col">Colaborador avaliado</TableHeaderCell>
                    <TableHeaderCell scope="col">Status da avaliação</TableHeaderCell>
                    <TableHeaderCell scope="col">Tipo</TableHeaderCell>
                    <TableHeaderCell scope="col">Feedback</TableHeaderCell>
                    <TableHeaderCell scope="col">
                      <span className="visually-hidden">Ações</span>
                    </TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assessmentPage.items.map((assessment) => (
                    <TableRow key={assessment.id}>
                      <TableCell className="ev-person">
                        <strong title={assessment.evaluated.displayName}>
                          {assessment.evaluated.displayName}
                        </strong>
                        <span
                          className="visually-hidden"
                          id={`assessment-${assessment.id}-summary`}
                        >
                          {`${formatAssessmentType(assessment.type)}. Situação: ${formatAssessmentStatus(assessment.status)}.${assessment.feedbackStatus === 'NAO_APLICAVEL' ? '' : ` Feedback ${formatFeedbackStatus(assessment.feedbackStatus)}.`}`}
                        </span>
                      </TableCell>
                      <TableCell className="ev-status">
                        <Badge
                          label={formatAssessmentStatus(assessment.status)}
                          aria-label={`Situação: ${formatAssessmentStatus(assessment.status)}`}
                          variant={assessmentTone[assessment.status] ?? 'neutral'}
                          className="dashboard-status-badge"
                        />
                      </TableCell>
                      <TableCell className="ev-type">
                        {formatAssessmentType(assessment.type)}
                      </TableCell>
                      <TableCell className="ev-feedback">
                        {assessment.feedbackStatus === 'NAO_APLICAVEL'
                          ? 'Não aplicável'
                          : assessment.feedbackStatus === 'CONCLUIDO'
                            ? 'Concluído'
                            : 'Pendente'}
                      </TableCell>
                      <TableCell className="ev-row-actions">
                        <Button
                          variant="ghost"
                          size="sm"
                          label="Abrir avaliação"
                          aria-describedby={`assessment-${assessment.id}-summary`}
                          onClick={() => onSelectAssessment(assessment.id)}
                        />
                        {canUseAdministrativeFilters &&
                          administrativeCycleId &&
                          administrativeCollaboratorId &&
                          (assessment.status === 'ENVIADA' ||
                            assessment.status === 'PUBLICADA') && (
                            <Button
                              variant="secondary"
                              size="sm"
                              label="Pré-visualizar"
                              onClick={() => setPreviewedAssessmentId(assessment.id)}
                            />
                          )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
          <Pagination
            currentPage={pageNumber}
            hasNextPage={assessmentPage.page.nextCursor !== null}
            itemCountOnPage={assessmentPage.items.length}
            itemLabel="avaliações"
            isLoading={isLoading}
            onNextPage={goToNextPage}
            onPreviousPage={goToPreviousPage}
            showItemCount={false}
            totalPages={assessmentPage.page.totalPages}
          />
        </>
      )}
    </section>
  )
}

function Metric({
  label,
  value,
  icon,
  help,
}: {
  label: string
  value: number | string
  icon: ReactNode
  help: string
}) {
  return (
    <Card padding={4} className="ev-metric">
      <dt>
        <span className="ev-metric-label">
          {label}
          <ContextHelp title={`O que representa ${label}`}>
            <p>{help}</p>
          </ContextHelp>
        </span>
      </dt>
      <dd>{value}</dd>
      <span aria-hidden="true" className="ev-metric-icon">
        {icon}
      </span>
    </Card>
  )
}

const assessmentTone: Record<string, BadgeVariant> = {
  PUBLICADA: 'success',
  ENVIADA: 'info',
  RASCUNHO: 'warning',
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
