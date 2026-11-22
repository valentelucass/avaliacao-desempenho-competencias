import { Badge } from '@astryxdesign/core/Badge'
import { WorkspacePageHeader } from '../../ui/WorkspacePageHeader'
import { ActionButton } from '../../ui/ActionButton'
import { AdministrativeTable } from '@/components/ui/administrative-table'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { CheckCircle2, Eye, Pencil, Plus, RefreshCw, XCircle } from 'lucide-react'
import { isAuthenticationError } from '../../api/client'
import type { ApiClient } from '../../api/client'
import type {
  ApprovedQuestionnaireVersion,
  AppliedCycleQuestionnaire,
  CycleQuestionnaireInput,
  DraftCycleConfiguration,
  EvaluationCycle,
  EvaluationCycleAdministrationConfiguration,
  EvaluationCycleWindowStatus,
  Permission,
} from '../../api/contracts'
import { FeedbackMessage } from '../../ui/Feedback'
import { EmptyState } from '../../ui/EmptyState'
import { ContextHelp } from '../../ui/ContextHelp'
import { Pagination } from '../../ui/Pagination'
import { safeErrorMessage } from '../../ui/safeErrorMessage'
import { useTableQuery } from '../../ui/useTableQuery'
import { useInlinePanelFocus } from '../../ui/useInlinePanelFocus'
import { administrativeRead, useAdministrativeLoad } from './useAdministrativeLoad'

type CycleAdministrationPanelProps = {
  api: ApiClient
  permissions: readonly Permission[]
  onSessionExpired: () => void
}

type CycleForm = {
  code: string
  name: string
  openingAtLocal: string
  closingAtLocal: string
  timeZone: string
  selfAssessmentEnabled: boolean
}

const emptyForm: CycleForm = {
  code: '',
  name: '',
  openingAtLocal: '',
  closingAtLocal: '',
  timeZone: 'America/Sao_Paulo',
  selfAssessmentEnabled: false,
}

/**
 * Configura rascunhos, consulta ciclos e permite prorrogar o encerramento de
 * ciclos abertos. As alterações são autorizadas, validadas e auditadas pela API.
 */
export function CycleAdministrationPanel({
  api,
  permissions,
  onSessionExpired,
}: CycleAdministrationPanelProps) {
  const codeId = useId()
  const nameId = useId()
  const openingId = useId()
  const closingId = useId()
  const timeZoneId = useId()
  const selfAssessmentId = useId()
  const questionnairesFieldsetId = useId()
  const formErrorId = useId()
  const extensionClosingId = useId()
  const extensionReasonId = useId()
  const extensionErrorId = useId()
  const [cycles, setCycles] = useState<readonly EvaluationCycle[]>([])
  const [versions, setVersions] = useState<readonly ApprovedQuestionnaireVersion[]>([])
  const [selectedCycle, setSelectedCycle] = useState<EvaluationCycle>()
  const [cycleConfiguration, setCycleConfiguration] = useState<
    DraftCycleConfiguration | EvaluationCycleAdministrationConfiguration
  >()
  const [appliedQuestionnaire, setAppliedQuestionnaire] = useState<AppliedCycleQuestionnaire>()
  const [form, setForm] = useState<CycleForm>(emptyForm)
  const [selectedOptionKeys, setSelectedOptionKeys] = useState<readonly string[]>([])
  const {
    load,
    isLoading,
    isAvailable,
    errors: loadErrors,
  } = useAdministrativeLoad(onSessionExpired)
  const [isLoadingConfiguration, setIsLoadingConfiguration] = useState(false)
  const [isLoadingAppliedQuestionnaire, setIsLoadingAppliedQuestionnaire] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isExtendingClosing, setIsExtendingClosing] = useState(false)
  const [extensionClosingAtLocal, setExtensionClosingAtLocal] = useState('')
  const [extensionReason, setExtensionReason] = useState('')
  const [extensionError, setExtensionError] = useState<string>()
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const configurationRequestId = useRef(0)
  const appliedQuestionnaireRequestId = useRef(0)
  const extensionRequestId = useRef(0)
  const extensionInFlight = useRef(false)
  const {
    highlightPulse,
    isFieldHighlighted,
    isHighlighted,
    panelRef: configurationPanelRef,
    revealInlinePanel,
  } = useInlinePanelFocus<HTMLFormElement>()
  const configurationFieldIds = useMemo(
    () => [
      codeId,
      nameId,
      timeZoneId,
      openingId,
      closingId,
      selfAssessmentId,
      questionnairesFieldsetId,
    ],
    [closingId, codeId, nameId, openingId, questionnairesFieldsetId, selfAssessmentId, timeZoneId],
  )

  const canManageCycles = permissions.includes('CICLOS.GERIR')
  const optionIndex = useMemo(
    () =>
      new Map(
        versions.flatMap((version) =>
          version.configurationOptions.map((option) => [
            optionKey(version.questionnaireVersionId, option),
            {
              questionnaireVersionId: version.questionnaireVersionId,
              calculationConfigurationVersionId: option.calculationConfigurationVersionId,
              classificationMatrixVersionId: option.classificationMatrixVersionId,
            } satisfies CycleQuestionnaireInput,
          ]),
        ),
      ),
    [versions],
  )
  const selectedQuestionnaires = useMemo(
    () =>
      selectedOptionKeys
        .map((key) => optionIndex.get(key))
        .filter((option): option is CycleQuestionnaireInput => option !== undefined),
    [optionIndex, selectedOptionKeys],
  )
  const cyclesPagination = useTableQuery(
    cycles,
    [
      { key: 'name', label: 'Ciclo', value: (item) => item.name },
      {
        key: 'status',
        label: 'Situação',
        value: (item) => formatCycleStatus(item.status, item.windowStatus),
        kind: 'choice',
      },
      { key: 'actions', label: 'Ação' },
    ],
    10,
  )
  const versionsPagination = useTableQuery(
    versions,
    [
      {
        key: 'name',
        label: 'Questionário',
        value: (item) => item.questionnaireName + ' ' + item.title,
      },
      { key: 'version', label: 'Versão', value: (item) => item.versionNumber, kind: 'number' },
      {
        key: 'configuration',
        label: 'Configuração',
        value: (item) => item.configurationOptions.map(formatConfigurationOption).join(' '),
      },
      { key: 'actions', label: 'Aplicar' },
    ],
    5,
  )

  const loadData = useCallback(async () => {
    if (!canManageCycles) {
      return
    }

    await load([
      administrativeRead('cycles', 'os ciclos', () => api.listAllCycles(), setCycles),
      administrativeRead(
        'versions',
        'os questionários aprovados',
        () => api.listApprovedQuestionnaireVersions(),
        setVersions,
      ),
    ])
  }, [api, canManageCycles, load])

  useEffect(() => {
    if (!canManageCycles) {
      return
    }
    // oxlint-disable-next-line react/set-state-in-effect -- A leitura é assíncrona.
    void loadData()
  }, [canManageCycles, loadData])

  const resetForm = useCallback(() => {
    configurationRequestId.current += 1
    appliedQuestionnaireRequestId.current += 1
    extensionRequestId.current += 1
    extensionInFlight.current = false
    setIsExtendingClosing(false)
    setExtensionClosingAtLocal('')
    setExtensionReason('')
    setExtensionError(undefined)
    setSelectedCycle(undefined)
    setCycleConfiguration(undefined)
    setAppliedQuestionnaire(undefined)
    setIsLoadingConfiguration(false)
    setIsLoadingAppliedQuestionnaire(false)
    setForm(emptyForm)
    setSelectedOptionKeys([])
    setError(undefined)
    setNotice(undefined)
  }, [])

  useEffect(
    () => () => {
      configurationRequestId.current += 1
      appliedQuestionnaireRequestId.current += 1
      extensionRequestId.current += 1
    },
    [],
  )

  const startNewCycle = useCallback(() => {
    if (extensionInFlight.current) return
    resetForm()
    revealInlinePanel([codeId])
  }, [codeId, resetForm, revealInlinePanel])

  const selectCycle = useCallback(
    async (cycle: EvaluationCycle, refreshAfterExtension = false) => {
      if (extensionInFlight.current && !refreshAfterExtension) return false
      const requestId = ++configurationRequestId.current
      appliedQuestionnaireRequestId.current += 1
      extensionRequestId.current += 1
      extensionInFlight.current = false
      setIsExtendingClosing(false)
      setExtensionClosingAtLocal('')
      setExtensionReason('')
      setExtensionError(undefined)
      setSelectedCycle(cycle)
      setCycleConfiguration(undefined)
      setAppliedQuestionnaire(undefined)
      setIsLoadingAppliedQuestionnaire(false)
      setForm(emptyForm)
      setSelectedOptionKeys([])
      setError(undefined)
      setNotice(undefined)
      setIsLoadingConfiguration(true)
      try {
        let loadedConfiguration:
          DraftCycleConfiguration | EvaluationCycleAdministrationConfiguration
        let loadedAdministrationConfiguration:
          EvaluationCycleAdministrationConfiguration | undefined
        if (cycle.status === 'RASCUNHO') {
          loadedConfiguration = await api.getEvaluationCycleAdministrationDraft(cycle.id)
        } else {
          loadedAdministrationConfiguration =
            await api.getEvaluationCycleAdministrationConfiguration(cycle.id)
          loadedConfiguration = loadedAdministrationConfiguration
        }
        if (requestId !== configurationRequestId.current) return false
        setCycleConfiguration(loadedConfiguration)
        if (loadedAdministrationConfiguration) {
          const updatedCycle = {
            ...cycle,
            name: loadedConfiguration.name,
            status: loadedAdministrationConfiguration.status,
            windowStatus: loadedAdministrationConfiguration.windowStatus,
            closingAt:
              loadedAdministrationConfiguration.closingAt !== undefined
                ? loadedAdministrationConfiguration.closingAt
                : cycle.closingAt,
          }
          setSelectedCycle(updatedCycle)
          setCycles((current) =>
            current.map((item) => (item.id === cycle.id ? updatedCycle : item)),
          )
        }
        setForm({
          code: loadedConfiguration.code,
          name: loadedConfiguration.name,
          openingAtLocal: loadedConfiguration.openingAtLocal ?? '',
          closingAtLocal: loadedConfiguration.closingAtLocal ?? '',
          timeZone: loadedConfiguration.timeZone,
          selfAssessmentEnabled: loadedConfiguration.selfAssessmentEnabled,
        })
        setSelectedOptionKeys(
          loadedConfiguration.questionnaires.map((questionnaire) =>
            optionKey(questionnaire.questionnaireVersionId, questionnaire),
          ),
        )
        revealInlinePanel(configurationFieldIds)
        return true
      } catch (requestError) {
        if (requestId !== configurationRequestId.current) return false
        if (isAuthenticationError(requestError)) {
          onSessionExpired()
          return false
        }
        setError(safeErrorMessage(requestError))
        revealInlinePanel()
        return false
      } finally {
        if (requestId === configurationRequestId.current) setIsLoadingConfiguration(false)
      }
    },
    [api, configurationFieldIds, onSessionExpired, revealInlinePanel],
  )

  function updateForm<K extends keyof CycleForm>(field: K, value: CycleForm[K]) {
    // Capture o valor no evento; o updater pode rodar após o DOM ser restaurado.
    setForm((current) => ({ ...current, [field]: value }))
  }

  const configuredClosingAt =
    cycleConfiguration &&
    'closingAt' in cycleConfiguration &&
    typeof cycleConfiguration.closingAt === 'string'
      ? cycleConfiguration.closingAt
      : undefined
  const canExtendClosing =
    selectedCycle?.status === 'ABERTO' &&
    cycleConfiguration?.closingAtLocal &&
    configuredClosingAt &&
    !Number.isNaN(Date.parse(configuredClosingAt))

  async function extendClosing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      !canManageCycles ||
      !canExtendClosing ||
      !configuredClosingAt ||
      !selectedCycle ||
      extensionInFlight.current
    )
      return
    const reason = extensionReason.trim()
    setExtensionError(undefined)
    setNotice(undefined)
    if (
      !extensionClosingAtLocal ||
      extensionClosingAtLocal <= (cycleConfiguration?.closingAtLocal ?? '')
    ) {
      setExtensionError('Informe um novo encerramento posterior ao prazo atual.')
      return
    }
    if (reason.length < 10 || reason.length > 500) {
      setExtensionError('Informe um motivo entre 10 e 500 caracteres.')
      return
    }
    const requestId = ++extensionRequestId.current
    extensionInFlight.current = true
    setIsExtendingClosing(true)
    try {
      await api.extendEvaluationCycleClosing(selectedCycle.id, {
        closingAtLocal: extensionClosingAtLocal,
        expectedClosingAt: configuredClosingAt,
        reason,
      })
      if (requestId !== extensionRequestId.current) return
      await loadData()
      if (requestId !== extensionRequestId.current) return
      if (await selectCycle(selectedCycle, true)) {
        setNotice('Encerramento prorrogado. A vigência e a configuração foram atualizadas.')
      }
    } catch (requestError) {
      if (requestId !== extensionRequestId.current) return
      if (isAuthenticationError(requestError)) {
        onSessionExpired()
        return
      }
      setExtensionError(safeErrorMessage(requestError))
    } finally {
      if (requestId === extensionRequestId.current) {
        extensionInFlight.current = false
        setIsExtendingClosing(false)
      }
    }
  }

  async function saveCycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canManageCycles) {
      return
    }

    const code = form.code.trim()
    const name = form.name.trim()
    setError(undefined)
    setNotice(undefined)
    if (!name || (!selectedCycle && !code)) {
      setError('Informe o código e o nome do ciclo.')
      return
    }
    if (!selectedCycle && !/^[A-Za-z0-9_.-]+$/.test(code)) {
      setError('Use somente letras sem acentos, números, ponto, hífen ou sublinhado no código.')
      return
    }
    if (!form.openingAtLocal || !form.closingAtLocal) {
      setError('Informe as datas de abertura e encerramento do ciclo.')
      return
    }
    if (form.openingAtLocal >= form.closingAtLocal) {
      setError('O encerramento deve ocorrer depois da abertura.')
      return
    }
    if (form.timeZone.trim() !== 'America/Sao_Paulo') {
      setError('O fuso horário do ciclo deve ser America/Sao_Paulo.')
      return
    }
    if (!isAvailable('versions')) {
      setError('Atualize os questionários aprovados antes de salvar o ciclo.')
      return
    }
    if (
      selectedQuestionnaires.length > 20 ||
      new Set(selectedQuestionnaires.map((item) => item.questionnaireVersionId)).size !==
        selectedQuestionnaires.length
    ) {
      setError('Selecione no máximo 20 questionários, com uma configuração por versão.')
      return
    }
    if (selectedQuestionnaires.length === 0) {
      setError('Selecione ao menos um questionário aprovado para o ciclo.')
      return
    }
    if (selectedQuestionnaires.length !== selectedOptionKeys.length) {
      setError('Uma configuração selecionada não está mais disponível. Atualize a tela.')
      return
    }

    const configuration = {
      name,
      openingAtLocal: form.openingAtLocal,
      closingAtLocal: form.closingAtLocal,
      timeZone: form.timeZone.trim(),
      selfAssessmentEnabled: form.selfAssessmentEnabled,
      questionnaires: selectedQuestionnaires,
    }

    setIsSaving(true)
    try {
      if (selectedCycle) {
        if (selectedCycle.status !== 'RASCUNHO') {
          setError('Somente um ciclo em rascunho pode ter a configuração alterada.')
          return
        }
        await api.replaceEvaluationCycle(selectedCycle.id, { configuration })
        await selectCycle(selectedCycle)
        setNotice('Configuração do ciclo em rascunho atualizada.')
      } else {
        const created = await api.createEvaluationCycle({ code, configuration })
        const newCycle: EvaluationCycle = { id: created.cycleId, name, status: 'RASCUNHO' }
        setCycles((currentCycles) => [newCycle, ...currentCycles])
        setSelectedCycle(newCycle)
        setCycleConfiguration({
          cycleId: created.cycleId,
          code,
          ...configuration,
          questionnaires: created.questionnaires.map((questionnaire) => ({
            cycleQuestionnaireId: questionnaire.cycleQuestionnaireId,
            questionnaireVersionId: questionnaire.questionnaireVersionId,
            calculationConfigurationVersionId:
              selectedQuestionnaires.find(
                (selected) =>
                  selected.questionnaireVersionId === questionnaire.questionnaireVersionId,
              )?.calculationConfigurationVersionId ?? '',
            classificationMatrixVersionId:
              selectedQuestionnaires.find(
                (selected) =>
                  selected.questionnaireVersionId === questionnaire.questionnaireVersionId,
              )?.classificationMatrixVersionId ?? '',
          })),
        })
        setForm((currentForm) => ({ ...currentForm, code }))
        setNotice('Ciclo criado como rascunho. Revise-o antes de abrir.')
      }
    } catch (requestError) {
      if (isAuthenticationError(requestError)) {
        onSessionExpired()
        return
      }
      setError(safeErrorMessage(requestError))
    } finally {
      setIsSaving(false)
    }
  }

  async function transitionCycle(action: 'open' | 'close') {
    if (!selectedCycle || !canManageCycles || extensionInFlight.current) {
      return
    }
    const verb = action === 'open' ? 'abrir' : 'encerrar'
    if (!window.confirm(`Confirma ${verb} o ciclo “${selectedCycle.name}”?`)) {
      return
    }

    setError(undefined)
    setNotice(undefined)
    setIsTransitioning(true)
    try {
      if (action === 'open') {
        await api.openEvaluationCycle(selectedCycle.id)
      } else {
        await api.closeEvaluationCycle(selectedCycle.id)
      }
      const status = action === 'open' ? 'ABERTO' : 'ENCERRADO'
      const updatedCycle = { ...selectedCycle, status }
      setSelectedCycle(updatedCycle)
      setCycles((currentCycles) =>
        currentCycles.map((cycle) => (cycle.id === updatedCycle.id ? updatedCycle : cycle)),
      )
      setNotice(action === 'open' ? 'Ciclo aberto.' : 'Ciclo encerrado.')
    } catch (requestError) {
      if (isAuthenticationError(requestError)) {
        onSessionExpired()
        return
      }
      setError(safeErrorMessage(requestError))
    } finally {
      setIsTransitioning(false)
    }
  }

  async function viewAppliedQuestionnaire(cycleQuestionnaireId: string) {
    if (!selectedCycle) {
      return
    }

    const requestId = ++appliedQuestionnaireRequestId.current
    setError(undefined)
    setNotice(undefined)
    setIsLoadingAppliedQuestionnaire(true)
    try {
      const loadedQuestionnaire = await api.getAppliedCycleQuestionnaire(
        selectedCycle.id,
        cycleQuestionnaireId,
      )
      if (requestId === appliedQuestionnaireRequestId.current) {
        setAppliedQuestionnaire(loadedQuestionnaire)
      }
    } catch (requestError) {
      if (requestId !== appliedQuestionnaireRequestId.current) return
      if (isAuthenticationError(requestError)) {
        onSessionExpired()
        return
      }
      setError(safeErrorMessage(requestError))
    } finally {
      if (requestId === appliedQuestionnaireRequestId.current) {
        setIsLoadingAppliedQuestionnaire(false)
      }
    }
  }

  function toggleQuestionnaireOption(key: string, checked: boolean) {
    setSelectedOptionKeys((currentKeys) =>
      checked
        ? [...new Set([...currentKeys, key])]
        : currentKeys.filter((currentKey) => currentKey !== key),
    )
  }

  if (!canManageCycles) {
    return (
      <FeedbackMessage kind="error">
        Você não possui permissão para administrar ciclos de avaliação.
      </FeedbackMessage>
    )
  }

  const inlineRevealClassName = (fieldId: string, baseClassName: string) => {
    if (!isFieldHighlighted(fieldId)) {
      return baseClassName
    }

    return `${baseClassName} field--inline-reveal inline-reveal-pulse--${highlightPulse % 2 === 0 ? 'even' : 'odd'}`
  }

  const fieldClassName = (fieldId: string) => inlineRevealClassName(fieldId, 'field')
  const questionnairesAreHighlighted = isFieldHighlighted(questionnairesFieldsetId)
  const questionnaireRevealClassName = (isSelected: boolean) =>
    questionnairesAreHighlighted && isSelected
      ? `cycle-questionnaire-table__row--inline-reveal inline-reveal-pulse--${
          highlightPulse % 2 === 0 ? 'even' : 'odd'
        }`
      : undefined

  return (
    <section aria-labelledby="cycle-administration-title" className="stack-form">
      <WorkspacePageHeader
        id="cycle-administration-title"
        title="Ciclos de avaliação"
        group="Administração de ciclos"
        help={
          <ContextHelp title="Como funciona o ciclo">
            <ul>
              <li>
                <span>Rascunho: </span>
                permite revisar a janela e os questionários aplicados.
              </li>
              <li>
                <span>Aberto: </span>
                permite criar avaliações dentro da vigência configurada.
              </li>
              <li>
                <span>Encerrado: </span>
                impede novas avaliações para aquele ciclo.
              </li>
            </ul>
            <p className="context-help__note">
              Versões aprovadas de questionário ficam vinculadas ao ciclo e não são alteradas.
            </p>
          </ContextHelp>
        }
        actions={
          <>
            {' '}
            <div className="action-row">
              <ActionButton
                size="sm"
                variant="secondary"
                label="Atualizar"
                icon={<RefreshCw aria-hidden="true" size={17} strokeWidth={2} />}
                type="button"
                disabled={isLoading || isExtendingClosing}
                onClick={() => void loadData()}
              />
              <ActionButton
                size="sm"
                variant="primary"
                label="Novo ciclo"
                icon={<Plus aria-hidden="true" size={17} strokeWidth={2} />}
                type="button"
                onClick={startNewCycle}
                disabled={isExtendingClosing || isSaving || isTransitioning}
              />
            </div>{' '}
          </>
        }
      >
        <p className="ev-page-description">
          Um ciclo usa versões aprovadas e imutáveis de questionário. A API valida o estado e
          registra cada alteração administrativa.
        </p>
      </WorkspacePageHeader>

      {error ? (
        <FeedbackMessage kind="error" id={formErrorId} onDismiss={() => setError(undefined)}>
          {error}
        </FeedbackMessage>
      ) : null}
      {loadErrors.map((message) => (
        <FeedbackMessage kind="error" key={message}>
          {message}
        </FeedbackMessage>
      ))}
      {notice ? (
        <FeedbackMessage kind="status" onDismiss={() => setNotice(undefined)}>
          {notice}
        </FeedbackMessage>
      ) : null}
      {isLoading ? (
        <FeedbackMessage kind="info">Carregando ciclos e versões aprovadas…</FeedbackMessage>
      ) : null}

      <section className="card" aria-labelledby="cycle-list-title">
        <div className="context-help__heading">
          <h3 id="cycle-list-title">Ciclos disponíveis</h3>
          <ContextHelp title="Quando consultar ou configurar um ciclo">
            <p>
              Ciclos em rascunho podem ser configurados. A configuração de ciclos abertos ou
              encerrados pode ser consultada. Ciclos abertos também permitem prorrogar o
              encerramento, com registro no histórico.
            </p>
          </ContextHelp>
        </div>
        {isAvailable('cycles') && cycles.length === 0 ? (
          <EmptyState className="empty-state--compact" title="Nenhum ciclo disponível">
            Ainda não há ciclos que esta conta possa consultar. Crie um ciclo para iniciar a
            configuração de questionários e jornadas.
          </EmptyState>
        ) : null}
        {isAvailable('cycles') && cycles.length > 0 ? (
          <div className="administration-users">
            <AdministrativeTable>
              <caption className="visually-hidden">Ciclos disponíveis</caption>
              <AdministrativeTable.Head>
                <AdministrativeTable.Row className="table-query-title-row">
                  {cyclesPagination.headings()}
                </AdministrativeTable.Row>
                <AdministrativeTable.Row className="table-query-filter-row">
                  {cyclesPagination.filterCells()}
                </AdministrativeTable.Row>
              </AdministrativeTable.Head>
              <AdministrativeTable.Body>
                {cyclesPagination.emptyRow()}
                {cyclesPagination.items.map((cycle) => (
                  <AdministrativeTable.Row key={cycle.id}>
                    <AdministrativeTable.Cell data-label="Ciclo">
                      {cycle.name}
                      {cycle.openingAt || cycle.closingAt ? (
                        <p className="field-hint">
                          Abertura: {formatCycleInstant(cycle.openingAt)}. Encerramento:{' '}
                          {formatCycleInstant(cycle.closingAt)} (Brasília).
                        </p>
                      ) : null}
                    </AdministrativeTable.Cell>
                    <AdministrativeTable.Cell data-label="Situação">
                      <Badge
                        className="dashboard-status-badge"
                        label={formatCycleStatus(cycle.status, cycle.windowStatus)}
                        variant={
                          cycle.status === 'RASCUNHO'
                            ? 'warning'
                            : cycle.status === 'ABERTO'
                              ? 'success'
                              : 'neutral'
                        }
                      />
                    </AdministrativeTable.Cell>
                    <AdministrativeTable.Cell data-label="Ação">
                      <div className="table-actions">
                        <ActionButton
                          size="sm"
                          variant="secondary"
                          label={cycle.status === 'RASCUNHO' ? 'Configurar' : 'Consultar'}
                          icon={<Pencil aria-hidden="true" size={16} strokeWidth={2} />}
                          type="button"
                          onClick={() => void selectCycle(cycle)}
                          disabled={isSaving || isTransitioning || isExtendingClosing}
                        />
                      </div>
                    </AdministrativeTable.Cell>
                  </AdministrativeTable.Row>
                ))}
              </AdministrativeTable.Body>
            </AdministrativeTable>
            <Pagination
              currentPage={cyclesPagination.currentPage}
              hasNextPage={cyclesPagination.hasNextPage}
              isLoading={isLoading || isLoadingConfiguration}
              itemCountOnPage={cyclesPagination.items.length}
              itemLabel="ciclos"
              onNextPage={cyclesPagination.onNextPage}
              onPreviousPage={cyclesPagination.onPreviousPage}
              totalPages={cyclesPagination.totalPages}
            />
          </div>
        ) : null}
      </section>

      <form
        aria-labelledby="cycle-configuration-title"
        aria-describedby={error ? formErrorId : undefined}
        className={`card stack-form cycle-configuration-form inline-panel-focus${
          isHighlighted ? ' inline-panel-focus--highlighted' : ''
        }`}
        onSubmit={saveCycle}
        noValidate
        aria-busy={isSaving || isLoadingConfiguration}
        ref={configurationPanelRef}
        tabIndex={-1}
      >
        <div className="card-title-row">
          <div>
            <div className="context-help__heading">
              <h3 id="cycle-configuration-title">
                {selectedCycle ? `Configuração: ${selectedCycle.name}` : 'Novo ciclo'}
              </h3>
              <ContextHelp title="O que pode ser configurado">
                <p>
                  Código, abertura, autoavaliação e questionários são definidos no rascunho. Depois
                  da abertura, somente a ação de prorrogar pode ampliar o encerramento, com registro
                  no histórico.
                </p>
              </ContextHelp>
            </div>
            {selectedCycle && selectedCycle.status !== 'RASCUNHO' ? (
              <p className="muted">
                A configuração deste ciclo é somente leitura.
                {canExtendClosing ? ' Use a seção abaixo para prorrogar o encerramento.' : ''}
              </p>
            ) : (
              <p className="muted">Inclua ao menos uma combinação de questionário aprovada.</p>
            )}
          </div>
        </div>
        {isLoadingConfiguration ? (
          <FeedbackMessage kind="info">Carregando configuração do ciclo…</FeedbackMessage>
        ) : null}
        {cycleConfiguration && selectedCycle?.windowStatus ? (
          <p className="muted">
            {formatWindowStatus(selectedCycle.windowStatus)}. Abertura:{' '}
            {formatLocalCycleDateTime(cycleConfiguration.openingAtLocal)}. Encerramento:{' '}
            {formatLocalCycleDateTime(cycleConfiguration.closingAtLocal)} (Brasília).
          </p>
        ) : null}
        {selectedCycle && !isLoadingConfiguration && !cycleConfiguration ? (
          <p className="muted">
            A configuração não foi carregada. Consulte o ciclo novamente para tentar recuperar os
            dados.
          </p>
        ) : null}
        {!selectedCycle || cycleConfiguration ? (
          <>
            <div className="cycle-configuration-form__details-grid">
              <div className={fieldClassName(codeId)}>
                <label htmlFor={codeId}>Código do ciclo</label>
                <input
                  id={codeId}
                  value={form.code}
                  maxLength={100}
                  aria-describedby={`${codeId}-hint`}
                  disabled={Boolean(selectedCycle) || isLoadingConfiguration || isSaving}
                  onChange={(event) => updateForm('code', event.currentTarget.value)}
                />
                <p className="field-hint" id={`${codeId}-hint`}>
                  Letras sem acentos, números, ponto, hífen ou sublinhado.
                </p>
              </div>
              <div className={fieldClassName(nameId)}>
                <label htmlFor={nameId}>Nome do ciclo</label>
                <input
                  id={nameId}
                  value={form.name}
                  maxLength={200}
                  disabled={
                    selectedCycle?.status !== undefined && selectedCycle.status !== 'RASCUNHO'
                  }
                  onChange={(event) => updateForm('name', event.currentTarget.value)}
                />
              </div>
              <div className={fieldClassName(timeZoneId)}>
                <label htmlFor={timeZoneId}>Fuso horário</label>
                <input
                  id={timeZoneId}
                  value={form.timeZone}
                  aria-describedby={`${timeZoneId}-hint`}
                  maxLength={100}
                  disabled={
                    selectedCycle?.status !== undefined && selectedCycle.status !== 'RASCUNHO'
                  }
                  onChange={(event) => updateForm('timeZone', event.currentTarget.value)}
                />
                <p className="field-hint" id={`${timeZoneId}-hint`}>
                  Fuso exigido: America/Sao_Paulo.
                </p>
              </div>
              <div className={fieldClassName(openingId)}>
                <label htmlFor={openingId}>Abertura</label>
                <input
                  id={openingId}
                  type="datetime-local"
                  value={form.openingAtLocal}
                  aria-describedby={`${openingId}-hint`}
                  disabled={
                    selectedCycle?.status !== undefined && selectedCycle.status !== 'RASCUNHO'
                  }
                  onChange={(event) => updateForm('openingAtLocal', event.currentTarget.value)}
                />
                <p className="field-hint" id={`${openingId}-hint`}>
                  Data e horário de início do ciclo.
                </p>
              </div>
              <div className={fieldClassName(closingId)}>
                <label htmlFor={closingId}>Encerramento</label>
                <input
                  id={closingId}
                  type="datetime-local"
                  value={form.closingAtLocal}
                  aria-describedby={`${closingId}-hint`}
                  disabled={
                    selectedCycle?.status !== undefined && selectedCycle.status !== 'RASCUNHO'
                  }
                  onChange={(event) => updateForm('closingAtLocal', event.currentTarget.value)}
                />
                <p className="field-hint" id={`${closingId}-hint`}>
                  Deve ser posterior à abertura; o prazo termina neste horário.
                </p>
              </div>
              <label
                className={inlineRevealClassName(selfAssessmentId, 'checkbox-field')}
                htmlFor={selfAssessmentId}
              >
                <input
                  id={selfAssessmentId}
                  type="checkbox"
                  checked={form.selfAssessmentEnabled}
                  disabled={
                    selectedCycle?.status !== undefined && selectedCycle.status !== 'RASCUNHO'
                  }
                  onChange={(event) =>
                    updateForm('selfAssessmentEnabled', event.currentTarget.checked)
                  }
                />
                Permitir autoavaliação neste ciclo
              </label>
            </div>

            <fieldset
              className={`filter-fieldset${
                questionnairesAreHighlighted
                  ? ` fieldset--inline-reveal inline-reveal-pulse--${
                      highlightPulse % 2 === 0 ? 'even' : 'odd'
                    }`
                  : ''
              }`}
              id={questionnairesFieldsetId}
            >
              <legend>Questionários aplicados</legend>
              {isAvailable('versions') && versions.length === 0 ? (
                <EmptyState className="empty-state--compact" title="Nenhuma versão aprovada">
                  Não há versões aprovadas disponíveis para aplicar a um ciclo. Aprove um
                  questionário antes de configurar este ciclo.
                </EmptyState>
              ) : isAvailable('versions') ? (
                <div className="cycle-questionnaire-table">
                  <AdministrativeTable>
                    <caption className="visually-hidden">
                      Questionários e configurações disponíveis para o ciclo
                    </caption>
                    <AdministrativeTable.Head>
                      <AdministrativeTable.Row className="table-query-title-row">
                        {versionsPagination.headings()}
                      </AdministrativeTable.Row>
                      <AdministrativeTable.Row className="table-query-filter-row">
                        {versionsPagination.filterCells()}
                      </AdministrativeTable.Row>
                    </AdministrativeTable.Head>
                    <AdministrativeTable.Body>
                      {versionsPagination.emptyRow()}
                      {versionsPagination.items.map((version) => {
                        const isSelected = version.configurationOptions.some((option) =>
                          selectedOptionKeys.includes(
                            optionKey(version.questionnaireVersionId, option),
                          ),
                        )

                        return (
                          <AdministrativeTable.Row
                            className={questionnaireRevealClassName(isSelected)}
                            key={version.questionnaireVersionId}
                          >
                            <AdministrativeTable.Cell data-label="Questionário">
                              <strong>{version.questionnaireName}</strong>
                              <span className="cycle-questionnaire-table__title">
                                {version.title}
                              </span>
                            </AdministrativeTable.Cell>
                            <AdministrativeTable.Cell data-label="Versão">
                              v{version.versionNumber}
                            </AdministrativeTable.Cell>
                            <AdministrativeTable.Cell data-label="Configuração">
                              {version.configurationOptions.map((option) => (
                                <span
                                  className="cycle-questionnaire-table__configuration"
                                  key={optionKey(version.questionnaireVersionId, option)}
                                >
                                  {formatConfigurationOption(option)}
                                </span>
                              ))}
                            </AdministrativeTable.Cell>
                            <AdministrativeTable.Cell data-label="Aplicar">
                              {version.configurationOptions.map((option) => {
                                const key = optionKey(version.questionnaireVersionId, option)
                                const configurationLabel = formatConfigurationOption(option)
                                return (
                                  <label
                                    className="cycle-questionnaire-table__selection"
                                    htmlFor={key}
                                    key={key}
                                  >
                                    <input
                                      aria-label={configurationLabel}
                                      id={key}
                                      type="checkbox"
                                      disabled={
                                        selectedCycle?.status !== undefined &&
                                        selectedCycle.status !== 'RASCUNHO'
                                      }
                                      checked={selectedOptionKeys.includes(key)}
                                      onChange={(event) =>
                                        toggleQuestionnaireOption(key, event.target.checked)
                                      }
                                    />
                                    <span>Aplicar</span>
                                  </label>
                                )
                              })}
                            </AdministrativeTable.Cell>
                          </AdministrativeTable.Row>
                        )
                      })}
                    </AdministrativeTable.Body>
                  </AdministrativeTable>
                  <Pagination
                    currentPage={versionsPagination.currentPage}
                    hasNextPage={versionsPagination.hasNextPage}
                    isLoading={isLoading || isLoadingConfiguration}
                    itemCountOnPage={versionsPagination.items.length}
                    itemLabel="questionários aprovados"
                    onNextPage={versionsPagination.onNextPage}
                    onPreviousPage={versionsPagination.onPreviousPage}
                    totalPages={versionsPagination.totalPages}
                  />
                </div>
              ) : null}
            </fieldset>

            {selectedCycle?.status === 'RASCUNHO' || !selectedCycle ? (
              <div className="action-row">
                <ActionButton
                  size="sm"
                  variant="primary"
                  label={
                    isSaving ? 'Salvando…' : selectedCycle ? 'Salvar configuração' : 'Criar ciclo'
                  }
                  icon={<CheckCircle2 aria-hidden="true" size={17} strokeWidth={2} />}
                  type="submit"
                  disabled={
                    isSaving || isLoadingConfiguration || isLoading || !isAvailable('versions')
                  }
                />
              </div>
            ) : null}
          </>
        ) : null}
      </form>

      {cycleConfiguration && selectedCycle?.status === 'RASCUNHO' ? (
        <section className="card stack-form" aria-labelledby="cycle-transition-title">
          <div className="context-help__heading">
            <h3 id="cycle-transition-title">Abrir ciclo</h3>
            <ContextHelp title="O efeito de abrir o ciclo">
              <p>
                A abertura é permitida a partir da data e do horário de abertura salvos, antes do
                encerramento, no fuso America/Sao_Paulo. Ela bloqueia a edição da configuração.
              </p>
            </ContextHelp>
          </div>
          <p className="muted">
            Só é possível abrir dentro do período configurado, no fuso America/Sao_Paulo. Salve as
            alterações e revise as datas e os questionários antes de abrir; a configuração deixará
            de ser editável.
          </p>
          <div className="action-row">
            <ActionButton
              size="sm"
              variant="primary"
              label={isTransitioning ? 'Processando…' : 'Abrir ciclo'}
              icon={<CheckCircle2 aria-hidden="true" size={17} strokeWidth={2} />}
              type="button"
              disabled={isTransitioning}
              onClick={() => void transitionCycle('open')}
            />
          </div>
        </section>
      ) : null}
      {canExtendClosing ? (
        <form
          className="card stack-form"
          aria-labelledby="cycle-extension-title"
          aria-describedby={extensionError ? extensionErrorId : undefined}
          aria-busy={isExtendingClosing}
          onSubmit={extendClosing}
          noValidate
        >
          <h3 id="cycle-extension-title">Prorrogar encerramento</h3>
          <p className="muted">
            A prorrogação amplia o prazo para criar avaliações. A alteração e o motivo ficam
            registrados no histórico do ciclo.
          </p>
          <p>
            Encerramento atual:{' '}
            {formatLocalCycleDateTime(cycleConfiguration?.closingAtLocal ?? null)} (Brasília).
          </p>
          {extensionError ? (
            <FeedbackMessage kind="error" id={extensionErrorId}>
              {extensionError}
            </FeedbackMessage>
          ) : null}
          <div className="field">
            <label htmlFor={extensionClosingId}>Novo encerramento (Brasília)</label>
            <input
              id={extensionClosingId}
              type="datetime-local"
              value={extensionClosingAtLocal}
              onChange={(event) => setExtensionClosingAtLocal(event.currentTarget.value)}
              disabled={isExtendingClosing}
              required
              aria-describedby={`${extensionClosingId}-hint`}
            />
            <p className="field-hint" id={`${extensionClosingId}-hint`}>
              Deve ser posterior ao prazo atual e ao horário atual de Brasília. O servidor valida a
              nova data antes de salvar.
            </p>
          </div>
          <div className="field">
            <label htmlFor={extensionReasonId}>Motivo da prorrogação</label>
            <textarea
              id={extensionReasonId}
              value={extensionReason}
              onChange={(event) => setExtensionReason(event.currentTarget.value)}
              disabled={isExtendingClosing}
              minLength={10}
              maxLength={500}
              rows={3}
              required
              aria-describedby={`${extensionReasonId}-hint`}
            />
            <p className="field-hint" id={`${extensionReasonId}-hint`}>
              Descreva o motivo em 10 a 500 caracteres.
            </p>
          </div>
          {extensionClosingAtLocal ? (
            <p>
              Novo encerramento: {formatLocalCycleDateTime(extensionClosingAtLocal)} (Brasília).
            </p>
          ) : null}
          <div className="action-row">
            <ActionButton
              size="sm"
              variant="primary"
              label={isExtendingClosing ? 'Prorrogando…' : 'Prorrogar encerramento'}
              type="submit"
              disabled={isExtendingClosing}
            />
          </div>
        </form>
      ) : null}
      {cycleConfiguration && selectedCycle?.status === 'ABERTO' ? (
        <section className="card stack-form" aria-labelledby="cycle-close-title">
          <div className="context-help__heading">
            <h3 id="cycle-close-title">Encerrar ciclo</h3>
            <ContextHelp title="O efeito de encerrar o ciclo">
              <p>
                O encerramento impede a criação de novas avaliações naquele ciclo. A transição é
                validada e auditada pelo servidor.
              </p>
            </ContextHelp>
          </div>
          <p className="muted">
            O encerramento só é permitido a partir da data e do horário de encerramento salvos, no
            fuso America/Sao_Paulo, e impede novas avaliações.
          </p>
          <div className="action-row">
            <ActionButton
              size="sm"
              variant="destructive"
              label={isTransitioning ? 'Processando…' : 'Encerrar ciclo'}
              icon={<XCircle aria-hidden="true" size={17} strokeWidth={2} />}
              type="button"
              disabled={isTransitioning || isExtendingClosing}
              onClick={() => void transitionCycle('close')}
            />
          </div>
        </section>
      ) : null}
      {cycleConfiguration && selectedCycle ? (
        <section className="card stack-form" aria-labelledby="applied-questionnaire-title">
          <div className="card-title-row">
            <div>
              <div className="context-help__heading">
                <h3 id="applied-questionnaire-title">Questionário aplicado</h3>
                <ContextHelp title="Por que este conteúdo é somente leitura">
                  <p>
                    Esta é a versão que ficou vinculada ao ciclo. Ela pode ser consultada para
                    conferência, mas perguntas, opções e cálculo não podem ser alterados aqui.
                  </p>
                </ContextHelp>
              </div>
              <p className="muted">
                Consulte o conteúdo vinculado ao ciclo. Esta visualização não permite alterar
                perguntas, opções ou regras de cálculo.
              </p>
            </div>
          </div>
          <div className="action-row">
            {cycleConfiguration.questionnaires.map((questionnaire, index) => (
              <button
                className="button"
                disabled={isLoadingAppliedQuestionnaire}
                key={questionnaire.cycleQuestionnaireId}
                onClick={() => void viewAppliedQuestionnaire(questionnaire.cycleQuestionnaireId)}
                type="button"
              >
                <Eye aria-hidden="true" size={17} strokeWidth={2} />
                Visualizar questionário aplicado {index + 1}
              </button>
            ))}
          </div>
          {isLoadingAppliedQuestionnaire ? (
            <FeedbackMessage kind="info">Carregando questionário aplicado…</FeedbackMessage>
          ) : null}
          {appliedQuestionnaire ? (
            <section className="stack-form" aria-labelledby="applied-questionnaire-content-title">
              <div>
                <p className="eyebrow">{appliedQuestionnaire.questionnaireCode}</p>
                <h4 id="applied-questionnaire-content-title">
                  {appliedQuestionnaire.title} · versão{' '}
                  {appliedQuestionnaire.questionnaireVersionNumber}
                </h4>
              </div>
              {appliedQuestionnaire.competencies.map((competency) => (
                <section className="competency-card" key={competency.id}>
                  <h5>{competency.name}</h5>
                  <ol className="questionnaire-preview__questions">
                    {competency.questions.map((question) => (
                      <li key={question.id}>
                        <strong>{question.text}</strong>
                        {question.description ? <p>{question.description}</p> : null}
                        <p className="field-hint">
                          {question.required ? 'Resposta obrigatória' : 'Resposta opcional'}
                        </p>
                        <ul aria-label={`Opções de resposta para ${question.text}`}>
                          {question.options.map((option) => (
                            <li key={option.id}>{option.label}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </section>
          ) : null}
        </section>
      ) : null}
      {cycleConfiguration && selectedCycle?.status === 'RASCUNHO' ? (
        <p className="muted">
          O rascunho selecionado contém {cycleConfiguration.questionnaires.length} questionário(s)
          aplicado(s).
        </p>
      ) : null}
    </section>
  )
}

function optionKey(
  questionnaireVersionId: string,
  option: {
    calculationConfigurationVersionId: string
    classificationMatrixVersionId: string
  },
): string {
  return `${questionnaireVersionId}:${option.calculationConfigurationVersionId}:${option.classificationMatrixVersionId}`
}

function formatConfigurationOption(
  option: ApprovedQuestionnaireVersion['configurationOptions'][number],
) {
  return `${option.calculationCode} v${option.calculationVersionNumber} · ${option.classificationMatrixCode} v${option.classificationMatrixVersionNumber}`
}

function formatCycleStatus(status: string, windowStatus?: EvaluationCycleWindowStatus): string {
  if (status === 'ABERTO' && windowStatus === 'PRAZO_ENCERRADO') {
    return 'Aberto — prazo encerrado'
  }
  const labels: Record<string, string> = {
    RASCUNHO: 'Rascunho',
    ABERTO: 'Aberto',
    ENCERRADO: 'Encerrado',
  }
  return labels[status] ?? status
}

function formatWindowStatus(status: EvaluationCycleWindowStatus): string {
  const labels: Record<EvaluationCycleWindowStatus, string> = {
    AGUARDANDO_ABERTURA: 'Aguardando a data de abertura',
    VIGENTE: 'Dentro do período configurado',
    PRAZO_ENCERRADO: 'Prazo encerrado para criar avaliações',
    SEM_JANELA: 'Período não configurado',
  }
  return labels[status]
}

function formatCycleInstant(instant?: string | null): string {
  if (!instant) return 'Não configurada'
  const date = new Date(instant)
  if (Number.isNaN(date.getTime())) return 'Data indisponível'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date)
}

function formatLocalCycleDateTime(value: string | null): string {
  if (!value) return 'Não configurada'
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
  return match
    ? `${match[3]}/${match[2]}/${match[1]}, ${match[4]}:${match[5]}`
    : 'Data indisponível'
}
