import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Archive, ClipboardList, MapPin, Plus, Power, RefreshCw, Trash2 } from 'lucide-react'
import { isAuthenticationError } from '../../api/client'
import type { ApiClient } from '../../api/client'
import type {
  ActiveAllocation,
  ActiveQuestionnaireAssignment,
  AdministrativeCollaborator,
  AdministrativeNamedResource,
  Permission,
  QuestionnaireAssignmentOption,
} from '../../api/contracts'
import { FeedbackMessage } from '../../ui/Feedback'
import { Pagination } from '../../ui/Pagination'
import { safeErrorMessage } from '../../ui/safeErrorMessage'

type MasterDataAdministrationPanelProps = {
  api: ApiClient
  permissions: readonly Permission[]
  onSessionExpired: () => void
}

type PendingAction =
  | {
      kind: 'DEACTIVATE_BRANCH'
      id: string
      subject: string
    }
  | {
      kind: 'DELETE_BRANCH'
      id: string
      subject: string
    }
  | {
      kind: 'DEACTIVATE_AREA'
      id: string
      subject: string
    }
  | {
      kind: 'DEACTIVATE_COLLABORATOR'
      id: string
      subject: string
    }
  | {
      kind: 'CLOSE_ALLOCATION'
      id: string
      subject: string
      endsOn: string
    }
  | {
      kind: 'REVOKE_QUESTIONNAIRE_ASSIGNMENT'
      id: string
      subject: string
      reason: string
    }

/**
 * Cadastros de apoio e atribuições de questionário. A API é a fonte de verdade para
 * autorização, integridade, vigência e auditoria; este painel apenas evita entrada
 * manual de identificadores e confirma operações de encerramento.
 */
export function MasterDataAdministrationPanel({
  api,
  permissions,
  onSessionExpired,
}: MasterDataAdministrationPanelProps) {
  const branchNameId = useId()
  const areaNameId = useId()
  const collaboratorNameId = useId()
  const allocationCollaboratorId = useId()
  const allocationBranchId = useId()
  const allocationAreaId = useId()
  const allocationManagerId = useId()
  const allocationStartsOnId = useId()
  const assignmentCycleId = useId()
  const assignmentCollaboratorId = useId()
  const assignmentQuestionnaireId = useId()
  const confirmationEndsOnId = useId()
  const confirmationReasonId = useId()

  const [branches, setBranches] = useState<readonly AdministrativeNamedResource[]>([])
  const [areas, setAreas] = useState<readonly AdministrativeNamedResource[]>([])
  const [collaborators, setCollaborators] = useState<readonly AdministrativeCollaborator[]>([])
  const [allocations, setAllocations] = useState<readonly ActiveAllocation[]>([])
  const [questionnaireAssignments, setQuestionnaireAssignments] = useState<
    readonly ActiveQuestionnaireAssignment[]
  >([])
  const [assignmentOptions, setAssignmentOptions] = useState<
    readonly QuestionnaireAssignmentOption[]
  >([])
  const [isLoading, setIsLoading] = useState(false)
  const [isWriting, setIsWriting] = useState(false)
  const [loadError, setLoadError] = useState<string>()
  const [operationError, setOperationError] = useState<string>()
  const [confirmationError, setConfirmationError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [pendingAction, setPendingAction] = useState<PendingAction>()

  const [branchName, setBranchName] = useState('')
  const [areaName, setAreaName] = useState('')
  const [collaboratorName, setCollaboratorName] = useState('')
  const [allocationCollaborator, setAllocationCollaborator] = useState('')
  const [allocationBranch, setAllocationBranch] = useState('')
  const [allocationArea, setAllocationArea] = useState('')
  const [allocationManager, setAllocationManager] = useState('')
  const [allocationStartsOn, setAllocationStartsOn] = useState('')
  const [assignmentCycle, setAssignmentCycle] = useState('')
  const [assignmentCollaborator, setAssignmentCollaborator] = useState('')
  const [assignmentQuestionnaire, setAssignmentQuestionnaire] = useState('')

  const canManageMasterData = permissions.includes('CADASTROS.GERIR')

  const activeBranches = useMemo(() => branches.filter((branch) => branch.active), [branches])
  const activeAreas = useMemo(() => areas.filter((area) => area.active), [areas])
  const activeCollaborators = useMemo(
    () => collaborators.filter((collaborator) => collaborator.active),
    [collaborators],
  )
  const branchNames = useMemo(() => namesById(branches), [branches])
  const areaNames = useMemo(() => namesById(areas), [areas])
  const collaboratorNames = useMemo(() => namesById(collaborators), [collaborators])
  const selectedCycleOption = useMemo(
    () => assignmentOptions.find((option) => option.cycleId === assignmentCycle),
    [assignmentCycle, assignmentOptions],
  )
  const selectedCycleQuestionnaires = selectedCycleOption?.questionnaires ?? []

  const loadMasterData = useCallback(async () => {
    if (!canManageMasterData) {
      return
    }

    setIsLoading(true)
    setLoadError(undefined)
    try {
      const [
        loadedBranches,
        loadedAreas,
        loadedCollaborators,
        loadedAllocations,
        loadedAssignments,
        options,
      ] = await Promise.all([
        api.listBranches(),
        api.listAreas(),
        api.listCollaborators(),
        api.listActiveAllocations(),
        api.listActiveQuestionnaireAssignments(),
        api.listQuestionnaireAssignmentOptions(),
      ])
      setBranches(loadedBranches)
      setAreas(loadedAreas)
      setCollaborators(loadedCollaborators)
      setAllocations(loadedAllocations)
      setQuestionnaireAssignments(loadedAssignments)
      setAssignmentOptions(options)
    } catch (requestError) {
      if (isAuthenticationError(requestError)) {
        onSessionExpired()
        return
      }
      setLoadError(safeErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [api, canManageMasterData, onSessionExpired])

  useEffect(() => {
    if (!canManageMasterData) {
      return
    }
    // oxlint-disable-next-line react/set-state-in-effect -- Network loading is asynchronous.
    void loadMasterData()
  }, [canManageMasterData, loadMasterData])

  const runWrite = useCallback(
    async (operation: () => Promise<unknown>, successMessage: string): Promise<boolean> => {
      setOperationError(undefined)
      setNotice(undefined)
      setIsWriting(true)
      try {
        await operation()
        setNotice(successMessage)
        await loadMasterData()
        return true
      } catch (requestError) {
        if (isAuthenticationError(requestError)) {
          onSessionExpired()
          return false
        }
        setOperationError(safeErrorMessage(requestError))
        return false
      } finally {
        setIsWriting(false)
      }
    },
    [loadMasterData, onSessionExpired],
  )

  function clearFeedbackForNewAction() {
    setOperationError(undefined)
    setNotice(undefined)
  }

  async function createBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = branchName.trim()
    clearFeedbackForNewAction()
    if (!name) {
      setOperationError('Informe o nome da filial.')
      return
    }
    if (await runWrite(() => api.createBranch({ name }), 'Filial criada.')) {
      setBranchName('')
    }
  }

  async function createArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = areaName.trim()
    clearFeedbackForNewAction()
    if (!name) {
      setOperationError('Informe o nome da área.')
      return
    }
    if (await runWrite(() => api.createArea({ name }), 'Área criada.')) {
      setAreaName('')
    }
  }

  async function createCollaborator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const displayName = collaboratorName.trim()
    clearFeedbackForNewAction()
    if (!displayName) {
      setOperationError('Informe o nome de exibição do colaborador.')
      return
    }
    if (await runWrite(() => api.createCollaborator({ displayName }), 'Colaborador criado.')) {
      setCollaboratorName('')
    }
  }

  async function createAllocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    clearFeedbackForNewAction()
    if (!allocationCollaborator || !allocationStartsOn) {
      setOperationError('Selecione o colaborador e informe o início da lotação.')
      return
    }

    const managerText = allocationManager.trim()
    if (
      await runWrite(
        () =>
          api.createAllocation({
            collaboratorId: allocationCollaborator,
            branchId: allocationBranch || undefined,
            areaId: allocationArea || undefined,
            managerText: managerText || undefined,
            startsOn: allocationStartsOn,
          }),
        'Lotação criada.',
      )
    ) {
      setAllocationCollaborator('')
      setAllocationBranch('')
      setAllocationArea('')
      setAllocationManager('')
      setAllocationStartsOn('')
    }
  }

  async function createQuestionnaireAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    clearFeedbackForNewAction()
    if (!assignmentCycle || !assignmentCollaborator || !assignmentQuestionnaire) {
      setOperationError('Selecione ciclo, colaborador e questionário aplicado ao ciclo.')
      return
    }

    if (
      await runWrite(
        () =>
          api.createQuestionnaireAssignment({
            cycleId: assignmentCycle,
            collaboratorId: assignmentCollaborator,
            cycleQuestionnaireId: assignmentQuestionnaire,
          }),
        'Atribuição de questionário criada.',
      )
    ) {
      setAssignmentCycle('')
      setAssignmentCollaborator('')
      setAssignmentQuestionnaire('')
    }
  }

  function requestConfirmation(action: PendingAction) {
    clearFeedbackForNewAction()
    setConfirmationError(undefined)
    setPendingAction(action)
  }

  function cancelConfirmation() {
    setConfirmationError(undefined)
    setPendingAction(undefined)
  }

  async function confirmPendingAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!pendingAction) {
      return
    }

    setConfirmationError(undefined)
    let completed = false

    if (pendingAction.kind === 'DEACTIVATE_BRANCH') {
      completed = await runWrite(
        () => api.deactivateBranch(pendingAction.id),
        'Filial desativada. O histórico não foi removido.',
      )
    }
    if (pendingAction.kind === 'DELETE_BRANCH') {
      completed = await runWrite(
        () => api.deleteInactiveUnusedBranch(pendingAction.id),
        'Filial excluída permanentemente. O histórico administrativo foi preservado.',
      )
    }
    if (pendingAction.kind === 'DEACTIVATE_AREA') {
      completed = await runWrite(
        () => api.deactivateArea(pendingAction.id),
        'Área desativada. O histórico não foi removido.',
      )
    }
    if (pendingAction.kind === 'DEACTIVATE_COLLABORATOR') {
      completed = await runWrite(
        () => api.deactivateCollaborator(pendingAction.id),
        'Colaborador desativado. O histórico não foi removido.',
      )
    }
    if (pendingAction.kind === 'CLOSE_ALLOCATION') {
      if (!pendingAction.endsOn) {
        setConfirmationError('Informe a data de encerramento da lotação.')
        return
      }
      completed = await runWrite(
        () => api.closeAllocation(pendingAction.id, { endsOn: pendingAction.endsOn }),
        'Lotação encerrada. O histórico foi preservado.',
      )
    }
    if (pendingAction.kind === 'REVOKE_QUESTIONNAIRE_ASSIGNMENT') {
      const reason = pendingAction.reason.trim()
      if (!reason) {
        setConfirmationError('Informe o motivo da revogação.')
        return
      }
      completed = await runWrite(
        () => api.revokeQuestionnaireAssignment(pendingAction.id, { reason }),
        'Atribuição de questionário revogada. O histórico foi preservado.',
      )
    }

    if (completed) {
      setPendingAction(undefined)
    }
  }

  function changePendingEndsOn(endsOn: string) {
    setPendingAction((current) =>
      current?.kind === 'CLOSE_ALLOCATION' ? { ...current, endsOn } : current,
    )
  }

  function changePendingReason(reason: string) {
    setPendingAction((current) =>
      current?.kind === 'REVOKE_QUESTIONNAIRE_ASSIGNMENT' ? { ...current, reason } : current,
    )
  }

  if (!canManageMasterData) {
    return (
      <section
        className="master-data-administration"
        aria-labelledby="master-data-administration-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Administração de cadastros</p>
            <h2 id="master-data-administration-title">Cadastros e atribuições</h2>
          </div>
        </div>
        <FeedbackMessage kind="error">
          Você não possui permissão para consultar ou gerir os cadastros de apoio.
        </FeedbackMessage>
      </section>
    )
  }

  return (
    <section
      className="master-data-administration"
      aria-labelledby="master-data-administration-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Administração de cadastros</p>
          <h2 id="master-data-administration-title">Cadastros e atribuições</h2>
          <p className="muted">
            Use os nomes disponíveis nas listas. O servidor valida permissão, vigência, duplicidade
            e integridade antes de gravar cada alteração.
          </p>
        </div>
        <button
          className="button"
          type="button"
          onClick={() => void loadMasterData()}
          disabled={isLoading || isWriting}
        >
          <RefreshCw aria-hidden="true" size={17} strokeWidth={2} />
          {isLoading ? 'Atualizando…' : 'Atualizar cadastros'}
        </button>
      </div>

      {notice ? <FeedbackMessage kind="status">{notice}</FeedbackMessage> : null}
      {loadError ? <FeedbackMessage kind="error">{loadError}</FeedbackMessage> : null}
      {operationError ? <FeedbackMessage kind="error">{operationError}</FeedbackMessage> : null}
      {isLoading ? (
        <FeedbackMessage kind="info">Carregando cadastros autorizados…</FeedbackMessage>
      ) : null}

      <div className="master-data-quick-grid">
        <section className="card" aria-labelledby="branches-title">
          <div className="card-title-row">
            <h3 id="branches-title">Filiais</h3>
            <MapPin aria-hidden="true" size={19} strokeWidth={2} />
          </div>
          <form
            className="stack-form master-data-quick-form"
            onSubmit={createBranch}
            noValidate
            aria-busy={isWriting}
          >
            <div className="field">
              <label htmlFor={branchNameId}>Nome da filial</label>
              <input
                id={branchNameId}
                value={branchName}
                onChange={(event) => setBranchName(event.target.value)}
                disabled={isLoading || isWriting}
                maxLength={200}
                required
              />
            </div>
            <div className="action-row">
              <button
                className="button button--primary"
                type="submit"
                disabled={isLoading || isWriting}
              >
                <Plus aria-hidden="true" size={17} strokeWidth={2} />
                Criar filial
              </button>
            </div>
          </form>
          <NamedResourcesTable
            caption="Filiais cadastradas"
            resources={branches}
            resourceLabel="filial"
            isBusy={isLoading || isWriting}
            onDeactivate={(branch) =>
              requestConfirmation({
                kind: 'DEACTIVATE_BRANCH',
                id: branch.id,
                subject: branch.name,
              })
            }
            onDeleteInactive={(branch) =>
              requestConfirmation({
                kind: 'DELETE_BRANCH',
                id: branch.id,
                subject: branch.name,
              })
            }
          />
        </section>

        <section className="card" aria-labelledby="areas-title">
          <div className="card-title-row">
            <h3 id="areas-title">Áreas</h3>
            <ClipboardList aria-hidden="true" size={19} strokeWidth={2} />
          </div>
          <form
            className="stack-form master-data-quick-form"
            onSubmit={createArea}
            noValidate
            aria-busy={isWriting}
          >
            <div className="field">
              <label htmlFor={areaNameId}>Nome da área</label>
              <input
                id={areaNameId}
                value={areaName}
                onChange={(event) => setAreaName(event.target.value)}
                disabled={isLoading || isWriting}
                maxLength={200}
                required
              />
            </div>
            <div className="action-row">
              <button
                className="button button--primary"
                type="submit"
                disabled={isLoading || isWriting}
              >
                <Plus aria-hidden="true" size={17} strokeWidth={2} />
                Criar área
              </button>
            </div>
          </form>
          <NamedResourcesTable
            caption="Áreas cadastradas"
            resources={areas}
            resourceLabel="área"
            isBusy={isLoading || isWriting}
            onDeactivate={(area) =>
              requestConfirmation({ kind: 'DEACTIVATE_AREA', id: area.id, subject: area.name })
            }
          />
        </section>
      </div>

      <section className="card" aria-labelledby="collaborators-title">
        <div className="card-title-row">
          <h3 id="collaborators-title">Colaboradores</h3>
          <ClipboardList aria-hidden="true" size={19} strokeWidth={2} />
        </div>
        <form
          className="stack-form master-data-quick-form"
          onSubmit={createCollaborator}
          noValidate
          aria-busy={isWriting}
        >
          <div className="field">
            <label htmlFor={collaboratorNameId}>Nome de exibição do colaborador</label>
            <input
              id={collaboratorNameId}
              value={collaboratorName}
              onChange={(event) => setCollaboratorName(event.target.value)}
              disabled={isLoading || isWriting}
              maxLength={200}
              required
            />
          </div>
          <div className="action-row">
            <button
              className="button button--primary"
              type="submit"
              disabled={isLoading || isWriting}
            >
              <Plus aria-hidden="true" size={17} strokeWidth={2} />
              Criar colaborador
            </button>
          </div>
        </form>
        <CollaboratorsTable
          collaborators={collaborators}
          isBusy={isLoading || isWriting}
          onDeactivate={(collaborator) =>
            requestConfirmation({
              kind: 'DEACTIVATE_COLLABORATOR',
              id: collaborator.id,
              subject: collaborator.displayName,
            })
          }
        />
      </section>

      <section className="card" aria-labelledby="allocations-title">
        <div className="card-title-row">
          <h3 id="allocations-title">Lotações</h3>
          <MapPin aria-hidden="true" size={19} strokeWidth={2} />
        </div>
        <p className="muted">
          Selecione recursos ativos. Filial, área e gestor em texto são opcionais; a vigência é
          validada pelo servidor.
        </p>
        <form
          className="stack-form master-data-allocation-form"
          onSubmit={createAllocation}
          noValidate
          aria-busy={isWriting}
        >
          <div className="field">
            <label htmlFor={allocationCollaboratorId}>Colaborador da lotação</label>
            <select
              id={allocationCollaboratorId}
              value={allocationCollaborator}
              onChange={(event) => setAllocationCollaborator(event.target.value)}
              disabled={isLoading || isWriting}
              required
            >
              <option value="">Selecione um colaborador</option>
              {activeCollaborators.map((collaborator) => (
                <option key={collaborator.id} value={collaborator.id}>
                  {collaborator.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={allocationBranchId}>Filial</label>
            <select
              id={allocationBranchId}
              value={allocationBranch}
              onChange={(event) => setAllocationBranch(event.target.value)}
              disabled={isLoading || isWriting}
            >
              <option value="">Não informar filial</option>
              {activeBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={allocationAreaId}>Área</label>
            <select
              id={allocationAreaId}
              value={allocationArea}
              onChange={(event) => setAllocationArea(event.target.value)}
              disabled={isLoading || isWriting}
            >
              <option value="">Não informar área</option>
              {activeAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={allocationManagerId}>Gestor informado</label>
            <input
              id={allocationManagerId}
              value={allocationManager}
              onChange={(event) => setAllocationManager(event.target.value)}
              disabled={isLoading || isWriting}
              maxLength={200}
            />
          </div>
          <div className="field">
            <label htmlFor={allocationStartsOnId}>Início da lotação</label>
            <input
              id={allocationStartsOnId}
              type="date"
              value={allocationStartsOn}
              onChange={(event) => setAllocationStartsOn(event.target.value)}
              disabled={isLoading || isWriting}
              required
            />
          </div>
          <div className="action-row">
            <button
              className="button button--primary"
              type="submit"
              disabled={isLoading || isWriting}
            >
              <Plus aria-hidden="true" size={17} strokeWidth={2} />
              Criar lotação
            </button>
          </div>
        </form>
        <AllocationsTable
          allocations={allocations}
          branchNames={branchNames}
          areaNames={areaNames}
          collaboratorNames={collaboratorNames}
          isBusy={isLoading || isWriting}
          onClose={(allocation) =>
            requestConfirmation({
              kind: 'CLOSE_ALLOCATION',
              id: allocation.id,
              subject:
                collaboratorNames.get(allocation.collaboratorId) ?? 'colaborador selecionado',
              endsOn: '',
            })
          }
        />
      </section>

      <section className="card" aria-labelledby="questionnaire-assignments-title">
        <div className="card-title-row">
          <h3 id="questionnaire-assignments-title">Atribuições de questionário</h3>
          <ClipboardList aria-hidden="true" size={19} strokeWidth={2} />
        </div>
        <p className="muted">
          A atribuição utiliza somente questionários já aplicados em ciclos de rascunho e
          colaboradores ativos. A API continua verificando todas as regras antes de confirmar.
        </p>
        <form
          className="stack-form master-data-assignment-form"
          onSubmit={createQuestionnaireAssignment}
          noValidate
          aria-busy={isWriting}
        >
          <div className="field">
            <label htmlFor={assignmentCycleId}>Ciclo em rascunho</label>
            <select
              id={assignmentCycleId}
              value={assignmentCycle}
              onChange={(event) => {
                setAssignmentCycle(event.target.value)
                setAssignmentQuestionnaire('')
              }}
              disabled={isLoading || isWriting || assignmentOptions.length === 0}
              required
            >
              <option value="">Selecione um ciclo</option>
              {assignmentOptions.map((option) => (
                <option key={option.cycleId} value={option.cycleId}>
                  {formatCycleOption(option)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={assignmentCollaboratorId}>Colaborador para atribuição</label>
            <select
              id={assignmentCollaboratorId}
              value={assignmentCollaborator}
              onChange={(event) => setAssignmentCollaborator(event.target.value)}
              disabled={isLoading || isWriting}
              required
            >
              <option value="">Selecione um colaborador</option>
              {activeCollaborators.map((collaborator) => (
                <option key={collaborator.id} value={collaborator.id}>
                  {collaborator.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={assignmentQuestionnaireId}>Questionário aplicado ao ciclo</label>
            <select
              id={assignmentQuestionnaireId}
              value={assignmentQuestionnaire}
              onChange={(event) => setAssignmentQuestionnaire(event.target.value)}
              disabled={
                isLoading ||
                isWriting ||
                !assignmentCycle ||
                selectedCycleQuestionnaires.length === 0
              }
              required
            >
              <option value="">Selecione um questionário</option>
              {selectedCycleQuestionnaires.map((questionnaire) => (
                <option
                  key={questionnaire.cycleQuestionnaireId}
                  value={questionnaire.cycleQuestionnaireId}
                >
                  {questionnaire.title}
                </option>
              ))}
            </select>
          </div>
          <div className="action-row">
            <button
              className="button button--primary"
              type="submit"
              disabled={isLoading || isWriting || assignmentOptions.length === 0}
            >
              <Plus aria-hidden="true" size={17} strokeWidth={2} />
              Criar atribuição
            </button>
          </div>
        </form>
        {assignmentOptions.length === 0 ? (
          <FeedbackMessage kind="warning">
            Para criar uma atribuição, primeiro crie um ciclo em rascunho e aplique ao menos um
            questionário aprovado nele.
          </FeedbackMessage>
        ) : null}
        {activeCollaborators.length === 0 ? (
          <FeedbackMessage kind="warning">
            Cadastre e mantenha ao menos um colaborador ativo antes de atribuir um questionário.
          </FeedbackMessage>
        ) : null}
        <QuestionnaireAssignmentsTable
          assignments={questionnaireAssignments}
          collaboratorNames={collaboratorNames}
          isBusy={isLoading || isWriting}
          onRevoke={(assignment) =>
            requestConfirmation({
              kind: 'REVOKE_QUESTIONNAIRE_ASSIGNMENT',
              id: assignment.id,
              subject: questionnaireAssignmentSubject(assignment, collaboratorNames),
              reason: '',
            })
          }
        />
      </section>

      {pendingAction ? (
        <div className="confirmation-dialog-backdrop">
          <section
            className="card confirmation-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="master-data-confirmation-title"
            aria-describedby="master-data-confirmation-description"
          >
            <div className="card-title-row">
              <h3 id="master-data-confirmation-title">Confirmação necessária</h3>
              <Archive aria-hidden="true" size={19} strokeWidth={2} />
            </div>
            <p id="master-data-confirmation-description">
              {confirmationDescription(pendingAction)} <strong>{pendingAction.subject}</strong>.
            </p>
            <p className="muted">
              {pendingAction.kind === 'DELETE_BRANCH'
                ? 'A exclusão é definitiva e só é permitida para filial inativa sem lotações. O histórico administrativo permanece.'
                : 'Esta operação não exclui histórico. Confirme somente após verificar os dados.'}
            </p>
            <form
              className="stack-form"
              onSubmit={confirmPendingAction}
              noValidate
              aria-busy={isWriting}
            >
              {pendingAction.kind === 'CLOSE_ALLOCATION' ? (
                <div className="field">
                  <label htmlFor={confirmationEndsOnId}>Data de encerramento</label>
                  <input
                    id={confirmationEndsOnId}
                    type="date"
                    value={pendingAction.endsOn}
                    onChange={(event) => changePendingEndsOn(event.target.value)}
                    disabled={isWriting}
                    required
                  />
                </div>
              ) : null}
              {pendingAction.kind === 'REVOKE_QUESTIONNAIRE_ASSIGNMENT' ? (
                <div className="field">
                  <label htmlFor={confirmationReasonId}>Motivo da revogação</label>
                  <textarea
                    id={confirmationReasonId}
                    value={pendingAction.reason}
                    onChange={(event) => changePendingReason(event.target.value)}
                    disabled={isWriting}
                    maxLength={500}
                    required
                  />
                  <p className="field-hint">O motivo é registrado pelo servidor com a auditoria.</p>
                </div>
              ) : null}
              {confirmationError ? (
                <FeedbackMessage kind="error">{confirmationError}</FeedbackMessage>
              ) : null}
              <div className="action-row">
                <button
                  className="button"
                  type="button"
                  onClick={cancelConfirmation}
                  disabled={isWriting}
                >
                  Cancelar
                </button>
                <button className="button button--primary" type="submit" disabled={isWriting}>
                  <Archive aria-hidden="true" size={17} strokeWidth={2} />
                  {confirmationButtonLabel(pendingAction)}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  )
}

function NamedResourcesTable({
  caption,
  resources,
  resourceLabel,
  isBusy,
  onDeactivate,
  onDeleteInactive,
}: {
  caption: string
  resources: readonly AdministrativeNamedResource[]
  resourceLabel: string
  isBusy: boolean
  onDeactivate: (resource: AdministrativeNamedResource) => void
  onDeleteInactive?: (resource: AdministrativeNamedResource) => void
}) {
  const pageSize = 5
  const [currentPage, setCurrentPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(resources.length / pageSize))
  const displayedPage = Math.min(currentPage, totalPages)
  const currentResources = resources.slice((displayedPage - 1) * pageSize, displayedPage * pageSize)
  const emptyRowsCount = pageSize - currentResources.length

  if (resources.length === 0) {
    return (
      <FeedbackMessage kind="warning">
        Não há {resourceLabel === 'filial' ? 'filiais' : 'áreas'} cadastradas.
      </FeedbackMessage>
    )
  }

  return (
    <div className="administration-users">
      <table>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Nome</th>
            <th scope="col">Situação</th>
            <th scope="col">Ação</th>
          </tr>
        </thead>
        <tbody>
          {currentResources.map((resource) => (
            <tr key={resource.id}>
              <td data-label="Nome">{resource.name}</td>
              <td data-label="Situação">
                <span
                  className={`status-badge ${
                    resource.active ? 'status-badge--active' : 'status-badge--disabled'
                  }`}
                >
                  {resource.active ? 'Ativa' : 'Desativada'}
                </span>
              </td>
              <td data-label="Ação">
                {resource.active ? (
                  <div
                    className="table-actions"
                    aria-label={`Ações da ${resourceLabel} ${resource.name}`}
                  >
                    <button
                      aria-label={`Desativar ${resourceLabel} ${resource.name}`}
                      className="button button--quiet"
                      type="button"
                      onClick={() => onDeactivate(resource)}
                      disabled={isBusy}
                    >
                      <Power aria-hidden="true" size={16} strokeWidth={2} />
                      Desativar
                    </button>
                  </div>
                ) : onDeleteInactive ? (
                  <div className="table-actions" aria-label={`Ações da filial ${resource.name}`}>
                    <button
                      aria-label={`Excluir filial ${resource.name}`}
                      className="button button--danger"
                      type="button"
                      onClick={() => onDeleteInactive(resource)}
                      disabled={isBusy}
                    >
                      <Trash2 aria-hidden="true" size={16} strokeWidth={2} />
                      Excluir
                    </button>
                  </div>
                ) : (
                  <span className="field-hint">Sem ação disponível</span>
                )}
              </td>
            </tr>
          ))}
          {Array.from({ length: emptyRowsCount }, (_, index) => (
            <tr className="pagination-placeholder" aria-hidden="true" key={`placeholder-${index}`}>
              <td colSpan={3} />
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination
        currentPage={displayedPage}
        hasNextPage={displayedPage < totalPages}
        isLoading={isBusy}
        itemCountOnPage={currentResources.length}
        itemLabel={resourceLabel === 'filial' ? 'filiais' : 'áreas'}
        onNextPage={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
        onPreviousPage={() => setCurrentPage((page) => Math.max(page - 1, 1))}
        totalPages={totalPages}
      />
    </div>
  )
}

function CollaboratorsTable({
  collaborators,
  isBusy,
  onDeactivate,
}: {
  collaborators: readonly AdministrativeCollaborator[]
  isBusy: boolean
  onDeactivate: (collaborator: AdministrativeCollaborator) => void
}) {
  if (collaborators.length === 0) {
    return <FeedbackMessage kind="warning">Não há colaboradores cadastrados.</FeedbackMessage>
  }

  return (
    <div className="administration-users">
      <table>
        <caption className="visually-hidden">Colaboradores cadastrados</caption>
        <thead>
          <tr>
            <th scope="col">Nome de exibição</th>
            <th scope="col">Situação</th>
            <th scope="col">Ação</th>
          </tr>
        </thead>
        <tbody>
          {collaborators.map((collaborator) => (
            <tr key={collaborator.id}>
              <td data-label="Nome">{collaborator.displayName}</td>
              <td data-label="Situação">
                <span
                  className={`status-badge ${
                    collaborator.active ? 'status-badge--active' : 'status-badge--disabled'
                  }`}
                >
                  {collaborator.active ? 'Ativo' : 'Desativado'}
                </span>
              </td>
              <td data-label="Ação">
                {collaborator.active ? (
                  <div
                    className="table-actions"
                    aria-label={`Ações do colaborador ${collaborator.displayName}`}
                  >
                    <button
                      aria-label={`Desativar colaborador ${collaborator.displayName}`}
                      className="button button--quiet"
                      type="button"
                      onClick={() => onDeactivate(collaborator)}
                      disabled={isBusy}
                    >
                      <Power aria-hidden="true" size={16} strokeWidth={2} />
                      Desativar
                    </button>
                  </div>
                ) : (
                  <span className="field-hint">Sem ação disponível</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AllocationsTable({
  allocations,
  branchNames,
  areaNames,
  collaboratorNames,
  isBusy,
  onClose,
}: {
  allocations: readonly ActiveAllocation[]
  branchNames: ReadonlyMap<string, string>
  areaNames: ReadonlyMap<string, string>
  collaboratorNames: ReadonlyMap<string, string>
  isBusy: boolean
  onClose: (allocation: ActiveAllocation) => void
}) {
  if (allocations.length === 0) {
    return <FeedbackMessage kind="warning">Não há lotações ativas.</FeedbackMessage>
  }

  return (
    <div className="administration-users">
      <table>
        <caption className="visually-hidden">Lotações ativas</caption>
        <thead>
          <tr>
            <th scope="col">Colaborador</th>
            <th scope="col">Filial</th>
            <th scope="col">Área</th>
            <th scope="col">Gestor</th>
            <th scope="col">Início</th>
            <th scope="col">Ação</th>
          </tr>
        </thead>
        <tbody>
          {allocations.map((allocation) => {
            const collaborator = nameFor(
              collaboratorNames,
              allocation.collaboratorId,
              'Não disponível',
            )
            return (
              <tr key={allocation.id}>
                <td data-label="Colaborador">{collaborator}</td>
                <td data-label="Filial">{optionalNameFor(branchNames, allocation.branchId)}</td>
                <td data-label="Área">{optionalNameFor(areaNames, allocation.areaId)}</td>
                <td data-label="Gestor">{allocation.managerText || 'Não informado'}</td>
                <td data-label="Início">{formatDate(allocation.startsOn)}</td>
                <td data-label="Ação">
                  <button
                    className="button button--quiet"
                    type="button"
                    onClick={() => onClose(allocation)}
                    disabled={isBusy}
                  >
                    Encerrar lotação de {collaborator}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function QuestionnaireAssignmentsTable({
  assignments,
  collaboratorNames,
  isBusy,
  onRevoke,
}: {
  assignments: readonly ActiveQuestionnaireAssignment[]
  collaboratorNames: ReadonlyMap<string, string>
  isBusy: boolean
  onRevoke: (assignment: ActiveQuestionnaireAssignment) => void
}) {
  if (assignments.length === 0) {
    return (
      <FeedbackMessage kind="warning">Não há atribuições de questionário ativas.</FeedbackMessage>
    )
  }

  return (
    <div className="administration-users">
      <table>
        <caption className="visually-hidden">Atribuições de questionário ativas</caption>
        <thead>
          <tr>
            <th scope="col">Colaborador</th>
            <th scope="col">Ciclo e questionário</th>
            <th scope="col">Ação</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((assignment) => {
            const subject = questionnaireAssignmentSubject(assignment, collaboratorNames)
            return (
              <tr key={assignment.id}>
                <td data-label="Colaborador">
                  {nameFor(collaboratorNames, assignment.collaboratorId, 'Não disponível')}
                </td>
                <td data-label="Ciclo e questionário">
                  {formatQuestionnaireAssignment(assignment)}
                </td>
                <td data-label="Ação">
                  <button
                    className="button button--quiet"
                    type="button"
                    onClick={() => onRevoke(assignment)}
                    disabled={isBusy}
                  >
                    Revogar atribuição de {subject}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function namesById(
  resources: readonly { id: string; name?: string; displayName?: string }[],
): ReadonlyMap<string, string> {
  return new Map(
    resources.map((resource) => [
      resource.id,
      resource.name ?? resource.displayName ?? 'Não disponível',
    ]),
  )
}

function nameFor(names: ReadonlyMap<string, string>, id: string, unavailable: string): string {
  return names.get(id) ?? unavailable
}

function optionalNameFor(names: ReadonlyMap<string, string>, id: string | null): string {
  if (!id) {
    return 'Não informada'
  }
  return nameFor(names, id, 'Não disponível')
}

function formatCycleOption(option: QuestionnaireAssignmentOption): string {
  return `${option.cycleCode} — ${option.cycleName}`
}

function questionnaireAssignmentSubject(
  assignment: ActiveQuestionnaireAssignment,
  collaboratorNames: ReadonlyMap<string, string>,
): string {
  const collaborator = nameFor(
    collaboratorNames,
    assignment.collaboratorId,
    'colaborador não disponível',
  )
  return `${collaborator}: ${formatQuestionnaireAssignment(assignment)}`
}

function formatQuestionnaireAssignment(assignment: ActiveQuestionnaireAssignment): string {
  return `${assignment.cycleCode} — ${assignment.cycleName} — ${assignment.questionnaireTitle}`
}

function confirmationDescription(action: PendingAction): string {
  const labels: Record<PendingAction['kind'], string> = {
    DEACTIVATE_BRANCH: 'Você está prestes a desativar a filial',
    DELETE_BRANCH: 'Você está prestes a excluir permanentemente a filial',
    DEACTIVATE_AREA: 'Você está prestes a desativar a área',
    DEACTIVATE_COLLABORATOR: 'Você está prestes a desativar o colaborador',
    CLOSE_ALLOCATION: 'Você está prestes a encerrar a lotação de',
    REVOKE_QUESTIONNAIRE_ASSIGNMENT: 'Você está prestes a revogar a atribuição de',
  }
  return labels[action.kind]
}

function confirmationButtonLabel(action: PendingAction): string {
  const labels: Record<PendingAction['kind'], string> = {
    DEACTIVATE_BRANCH: 'Confirmar desativação da filial',
    DELETE_BRANCH: 'Confirmar exclusão definitiva da filial',
    DEACTIVATE_AREA: 'Confirmar desativação da área',
    DEACTIVATE_COLLABORATOR: 'Confirmar desativação do colaborador',
    CLOSE_ALLOCATION: 'Confirmar encerramento da lotação',
    REVOKE_QUESTIONNAIRE_ASSIGNMENT: 'Confirmar revogação da atribuição',
  }
  return labels[action.kind]
}

function formatDate(value: string | null): string {
  if (!value) {
    return 'Não informada'
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}
