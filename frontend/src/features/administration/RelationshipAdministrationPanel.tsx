import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link2, RefreshCw, Unlink } from 'lucide-react'
import { isAuthenticationError } from '../../api/client'
import type { ApiClient } from '../../api/client'
import type {
  ActiveDirectorManagerAssignment,
  ActiveManagerAssignment,
  ActiveUserCollaboratorLink,
  AdministrativePersonOption,
  DirectorManagerAssignmentOptions,
  ManagerAssignmentOptions,
  Permission,
  UserCollaboratorLinkOptions,
} from '../../api/contracts'
import { FeedbackMessage } from '../../ui/Feedback'
import { Pagination } from '../../ui/Pagination'
import { safeErrorMessage } from '../../ui/safeErrorMessage'
import { useClientPagination } from '../../ui/useClientPagination'

type RelationshipAdministrationPanelProps = {
  api: ApiClient
  permissions: readonly Permission[]
  onSessionExpired: () => void
}

type CloseTarget =
  | { kind: 'MANAGER'; id: string; label: string }
  | { kind: 'DIRECTOR'; id: string; label: string }
  | { kind: 'USER'; id: string; label: string }

/** Vínculos ativos entre contas, gestores e colaboradores, sempre encerrados por data. */
export function RelationshipAdministrationPanel({
  api,
  permissions,
  onSessionExpired,
}: RelationshipAdministrationPanelProps) {
  const managerUserId = useId()
  const managerCollaboratorId = useId()
  const managerStartsOnId = useId()
  const directorUserId = useId()
  const directorManagerCollaboratorId = useId()
  const directorStartsOnId = useId()
  const userId = useId()
  const userCollaboratorId = useId()
  const userStartsOnId = useId()
  const endsOnId = useId()
  const [managerOptions, setManagerOptions] = useState<ManagerAssignmentOptions>({
    managers: [],
    collaborators: [],
  })
  const [directorManagerOptions, setDirectorManagerOptions] =
    useState<DirectorManagerAssignmentOptions>({
      directors: [],
      collaborators: [],
    })
  const [userLinkOptions, setUserLinkOptions] = useState<UserCollaboratorLinkOptions>({
    users: [],
    collaborators: [],
  })
  const [managerAssignments, setManagerAssignments] = useState<readonly ActiveManagerAssignment[]>(
    [],
  )
  const [directorManagerAssignments, setDirectorManagerAssignments] = useState<
    readonly ActiveDirectorManagerAssignment[]
  >([])
  const [userLinks, setUserLinks] = useState<readonly ActiveUserCollaboratorLink[]>([])
  const [managerUser, setManagerUser] = useState('')
  const [managerCollaborator, setManagerCollaborator] = useState('')
  const [managerStartsOn, setManagerStartsOn] = useState('')
  const [directorUser, setDirectorUser] = useState('')
  const [directorManagerCollaborator, setDirectorManagerCollaborator] = useState('')
  const [directorStartsOn, setDirectorStartsOn] = useState('')
  const [linkedUser, setLinkedUser] = useState('')
  const [linkedCollaborator, setLinkedCollaborator] = useState('')
  const [linkedStartsOn, setLinkedStartsOn] = useState('')
  const [closeTarget, setCloseTarget] = useState<CloseTarget>()
  const [endsOn, setEndsOn] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  const canManageManagerAssignments = permissions.includes('VINCULOS_GESTOR_COLABORADOR.GERIR')
  const canManageDirectorManagerAssignments = permissions.includes(
    'VINCULOS_DIRETORIA_GERENCIA.GERIR',
  )
  const canManageUserLinks = permissions.includes('VINCULOS_USUARIO_COLABORADOR.GERIR')
  const canManageRelationships =
    canManageManagerAssignments || canManageDirectorManagerAssignments || canManageUserLinks
  const managerNamesById = useMemo(
    () => new Map(managerOptions.managers.map((person) => [person.id, person])),
    [managerOptions.managers],
  )
  const userNamesById = useMemo(
    () => new Map(userLinkOptions.users.map((person) => [person.id, person])),
    [userLinkOptions.users],
  )
  const directorNamesById = useMemo(
    () => new Map(directorManagerOptions.directors.map((person) => [person.id, person])),
    [directorManagerOptions.directors],
  )
  const collaboratorNamesById = useMemo(
    () =>
      new Map(
        [...managerOptions.collaborators, ...userLinkOptions.collaborators].map((person) => [
          person.id,
          person,
        ]),
      ),
    [managerOptions.collaborators, userLinkOptions.collaborators],
  )

  const loadRelationships = useCallback(async () => {
    if (!canManageRelationships) {
      return
    }

    setIsLoading(true)
    setError(undefined)
    try {
      const [
        loadedManagerOptions,
        loadedDirectorManagerOptions,
        loadedUserLinkOptions,
        loadedManagerAssignments,
        loadedDirectorManagerAssignments,
        loadedUserLinks,
      ] = await Promise.all([
        canManageManagerAssignments
          ? api.getManagerAssignmentOptions()
          : Promise.resolve({ managers: [], collaborators: [] }),
        canManageDirectorManagerAssignments
          ? api.getDirectorManagerAssignmentOptions()
          : Promise.resolve({ directors: [], collaborators: [] }),
        canManageUserLinks
          ? api.getUserCollaboratorLinkOptions()
          : Promise.resolve({ users: [], collaborators: [] }),
        canManageManagerAssignments ? api.listActiveManagerAssignments() : Promise.resolve([]),
        canManageDirectorManagerAssignments
          ? api.listActiveDirectorManagerAssignments()
          : Promise.resolve([]),
        canManageUserLinks ? api.listActiveUserCollaboratorLinks() : Promise.resolve([]),
      ])
      setManagerOptions(loadedManagerOptions)
      setDirectorManagerOptions(loadedDirectorManagerOptions)
      setUserLinkOptions(loadedUserLinkOptions)
      setManagerAssignments(loadedManagerAssignments)
      setDirectorManagerAssignments(loadedDirectorManagerAssignments)
      setUserLinks(loadedUserLinks)
    } catch (requestError) {
      if (isAuthenticationError(requestError)) {
        onSessionExpired()
        return
      }
      setError(safeErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [
    api,
    canManageManagerAssignments,
    canManageDirectorManagerAssignments,
    canManageRelationships,
    canManageUserLinks,
    onSessionExpired,
  ])

  useEffect(() => {
    if (!canManageRelationships) {
      return
    }
    // oxlint-disable-next-line react/set-state-in-effect -- A leitura é assíncrona.
    void loadRelationships()
  }, [canManageRelationships, loadRelationships])

  async function createManagerAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canManageManagerAssignments) {
      return
    }
    setError(undefined)
    setNotice(undefined)
    if (!managerUser || !managerCollaborator || !managerStartsOn) {
      setError('Selecione a conta, o colaborador e a data de início do vínculo de gestão.')
      return
    }

    setIsSaving(true)
    try {
      await api.createManagerAssignment({
        managerUserId: managerUser,
        collaboratorId: managerCollaborator,
        startsOn: managerStartsOn,
      })
      setManagerUser('')
      setManagerCollaborator('')
      setManagerStartsOn('')
      setNotice('Vínculo gestor-colaborador criado.')
      await loadRelationships()
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

  async function createUserLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canManageUserLinks) {
      return
    }
    setError(undefined)
    setNotice(undefined)
    if (!linkedUser || !linkedCollaborator || !linkedStartsOn) {
      setError('Selecione a conta, o colaborador e a data de início do vínculo.')
      return
    }

    setIsSaving(true)
    try {
      await api.createUserCollaboratorLink({
        userId: linkedUser,
        collaboratorId: linkedCollaborator,
        startsOn: linkedStartsOn,
      })
      setLinkedUser('')
      setLinkedCollaborator('')
      setLinkedStartsOn('')
      setNotice('Vínculo conta-colaborador criado.')
      await loadRelationships()
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

  async function createDirectorManagerAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canManageDirectorManagerAssignments) {
      return
    }
    setError(undefined)
    setNotice(undefined)
    if (!directorUser || !directorManagerCollaborator || !directorStartsOn) {
      setError('Selecione a conta de Diretoria, a Gerência e a data de início do vínculo.')
      return
    }

    setIsSaving(true)
    try {
      await api.createDirectorManagerAssignment({
        directorUserId: directorUser,
        managerCollaboratorId: directorManagerCollaborator,
        startsOn: directorStartsOn,
      })
      setDirectorUser('')
      setDirectorManagerCollaborator('')
      setDirectorStartsOn('')
      setNotice('Vínculo Diretoria–Gerência criado.')
      await loadRelationships()
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

  async function closeRelationship(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!closeTarget) {
      return
    }
    setError(undefined)
    setNotice(undefined)
    if (!endsOn) {
      setError('Informe a data de encerramento do vínculo.')
      return
    }

    setIsSaving(true)
    try {
      if (closeTarget.kind === 'MANAGER') {
        await api.closeManagerAssignment(closeTarget.id, { endsOn })
      } else if (closeTarget.kind === 'DIRECTOR') {
        await api.closeDirectorManagerAssignment(closeTarget.id, { endsOn })
      } else {
        await api.closeUserCollaboratorLink(closeTarget.id, { endsOn })
      }
      setCloseTarget(undefined)
      setEndsOn('')
      setNotice('Vínculo encerrado. O histórico não foi removido.')
      await loadRelationships()
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

  if (!canManageRelationships) {
    return (
      <FeedbackMessage kind="error">
        Você não possui permissão para administrar vínculos de pessoas.
      </FeedbackMessage>
    )
  }

  const hasManagerSelectionOptions =
    managerOptions.managers.length > 0 && managerOptions.collaborators.length > 0
  const hasUserLinkSelectionOptions =
    userLinkOptions.users.length > 0 && userLinkOptions.collaborators.length > 0
  const hasDirectorManagerSelectionOptions =
    directorManagerOptions.directors.length > 0 && directorManagerOptions.collaborators.length > 0

  return (
    <section aria-labelledby="relationship-administration-title" className="stack-form">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Administração de vínculos</p>
          <h2 id="relationship-administration-title">Gestão e identidade dos colaboradores</h2>
          <p className="muted">
            Vínculos determinam escopo de acesso. Encerrar mantém o histórico e é validado pelo
            servidor em cada operação.
          </p>
        </div>
        <button
          className="button"
          type="button"
          disabled={isLoading}
          onClick={() => void loadRelationships()}
        >
          <RefreshCw aria-hidden="true" size={17} strokeWidth={2} />
          {isLoading ? 'Atualizando…' : 'Atualizar vínculos'}
        </button>
      </div>

      {error ? <FeedbackMessage kind="error">{error}</FeedbackMessage> : null}
      {notice ? <FeedbackMessage kind="status">{notice}</FeedbackMessage> : null}
      {isLoading ? (
        <FeedbackMessage kind="info">Carregando vínculos ativos…</FeedbackMessage>
      ) : null}
      {!isLoading &&
      ((canManageManagerAssignments && !hasManagerSelectionOptions) ||
        (canManageDirectorManagerAssignments && !hasDirectorManagerSelectionOptions) ||
        (canManageUserLinks && !hasUserLinkSelectionOptions)) ? (
        <FeedbackMessage kind="warning">
          Não há contas e colaboradores ativos suficientes para criar novos vínculos com este
          acesso.
        </FeedbackMessage>
      ) : null}

      {canManageManagerAssignments ? (
        <section className="card stack-form" aria-labelledby="manager-assignment-title">
          <div className="card-title-row">
            <div>
              <h3 id="manager-assignment-title">Vínculo gestor-colaborador</h3>
              <p className="muted">Define quais colaboradores podem ser avaliados pelo gestor.</p>
            </div>
          </div>
          <form
            className="stack-form manager-assignment-form"
            noValidate
            onSubmit={createManagerAssignment}
            aria-busy={isSaving}
          >
            <div className="form-grid">
              <div className="field">
                <label htmlFor={managerUserId}>Conta do gestor</label>
                <select
                  id={managerUserId}
                  value={managerUser}
                  disabled={!hasManagerSelectionOptions || isSaving}
                  onChange={(event) => setManagerUser(event.target.value)}
                >
                  <option value="">Selecione uma conta</option>
                  {managerOptions.managers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={managerCollaboratorId}>Colaborador</label>
                <select
                  id={managerCollaboratorId}
                  value={managerCollaborator}
                  disabled={!hasManagerSelectionOptions || isSaving}
                  onChange={(event) => setManagerCollaborator(event.target.value)}
                >
                  <option value="">Selecione um colaborador</option>
                  {managerOptions.collaborators.map((collaborator) => (
                    <option key={collaborator.id} value={collaborator.id}>
                      {collaborator.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={managerStartsOnId}>Início</label>
                <input
                  id={managerStartsOnId}
                  type="date"
                  value={managerStartsOn}
                  disabled={!hasManagerSelectionOptions || isSaving}
                  onChange={(event) => setManagerStartsOn(event.target.value)}
                />
              </div>
            </div>
            <div className="action-row">
              <button
                className="button button--success"
                type="submit"
                disabled={!hasManagerSelectionOptions || isSaving}
              >
                <Link2 aria-hidden="true" size={17} strokeWidth={2} />
                Criar vínculo de gestão
              </button>
            </div>
          </form>

          <RelationshipTable
            entries={managerAssignments}
            getAccountName={(entry) => accountLabel(managerNamesById, entry.managerUserId)}
            getCollaboratorName={(entry) =>
              collaboratorLabel(collaboratorNamesById, entry.collaboratorId)
            }
            accountColumn="Gestor"
            onClose={(entry) =>
              setCloseTarget({
                kind: 'MANAGER',
                id: entry.id,
                label: `${accountLabel(managerNamesById, entry.managerUserId)} · ${collaboratorLabel(
                  collaboratorNamesById,
                  entry.collaboratorId,
                )}`,
              })
            }
          />
        </section>
      ) : null}

      {canManageDirectorManagerAssignments ? (
        <section className="card stack-form" aria-labelledby="director-manager-assignment-title">
          <div className="card-title-row">
            <div>
              <h3 id="director-manager-assignment-title">Vínculo Diretoria–Gerência</h3>
              <p className="muted">
                Define quais Gerências podem ser avaliadas pela conta de Diretoria selecionada.
              </p>
            </div>
          </div>
          <form
            className="stack-form manager-assignment-form"
            noValidate
            onSubmit={createDirectorManagerAssignment}
            aria-busy={isSaving}
          >
            <div className="form-grid">
              <div className="field">
                <label htmlFor={directorUserId}>Conta de Diretoria</label>
                <select
                  id={directorUserId}
                  value={directorUser}
                  disabled={!hasDirectorManagerSelectionOptions || isSaving}
                  onChange={(event) => setDirectorUser(event.target.value)}
                >
                  <option value="">Selecione uma conta</option>
                  {directorManagerOptions.directors.map((director) => (
                    <option key={director.id} value={director.id}>
                      {director.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={directorManagerCollaboratorId}>Gerência</label>
                <select
                  id={directorManagerCollaboratorId}
                  value={directorManagerCollaborator}
                  disabled={!hasDirectorManagerSelectionOptions || isSaving}
                  onChange={(event) => setDirectorManagerCollaborator(event.target.value)}
                >
                  <option value="">Selecione uma Gerência</option>
                  {directorManagerOptions.collaborators.map((collaborator) => (
                    <option key={collaborator.id} value={collaborator.id}>
                      {collaborator.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={directorStartsOnId}>Início</label>
                <input
                  id={directorStartsOnId}
                  type="date"
                  value={directorStartsOn}
                  disabled={!hasDirectorManagerSelectionOptions || isSaving}
                  onChange={(event) => setDirectorStartsOn(event.target.value)}
                />
              </div>
            </div>
            <div className="action-row">
              <button
                className="button button--success"
                type="submit"
                disabled={!hasDirectorManagerSelectionOptions || isSaving}
              >
                <Link2 aria-hidden="true" size={17} strokeWidth={2} />
                Criar vínculo de Diretoria
              </button>
            </div>
          </form>

          <RelationshipTable
            entries={directorManagerAssignments}
            getAccountName={(entry) => accountLabel(directorNamesById, entry.directorUserId)}
            getCollaboratorName={(entry) =>
              collaboratorLabel(collaboratorNamesById, entry.managerCollaboratorId)
            }
            accountColumn="Diretoria"
            collaboratorColumn="Gerência"
            onClose={(entry) =>
              setCloseTarget({
                kind: 'DIRECTOR',
                id: entry.id,
                label: `${accountLabel(directorNamesById, entry.directorUserId)} · ${collaboratorLabel(
                  collaboratorNamesById,
                  entry.managerCollaboratorId,
                )}`,
              })
            }
          />
        </section>
      ) : null}

      {canManageUserLinks ? (
        <section className="card stack-form" aria-labelledby="user-link-title">
          <div className="card-title-row">
            <div>
              <h3 id="user-link-title">Vínculo conta-colaborador</h3>
              <p className="muted">Associa a identidade de acesso à pessoa correspondente.</p>
            </div>
          </div>
          <form
            className="stack-form user-collaborator-link-form"
            noValidate
            onSubmit={createUserLink}
            aria-busy={isSaving}
          >
            <div className="form-grid">
              <div className="field">
                <label htmlFor={userId}>Conta local</label>
                <select
                  id={userId}
                  value={linkedUser}
                  disabled={!hasUserLinkSelectionOptions || isSaving}
                  onChange={(event) => setLinkedUser(event.target.value)}
                >
                  <option value="">Selecione uma conta</option>
                  {userLinkOptions.users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={userCollaboratorId}>Colaborador</label>
                <select
                  id={userCollaboratorId}
                  value={linkedCollaborator}
                  disabled={!hasUserLinkSelectionOptions || isSaving}
                  onChange={(event) => setLinkedCollaborator(event.target.value)}
                >
                  <option value="">Selecione um colaborador</option>
                  {userLinkOptions.collaborators.map((collaborator) => (
                    <option key={collaborator.id} value={collaborator.id}>
                      {collaborator.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={userStartsOnId}>Início</label>
                <input
                  id={userStartsOnId}
                  type="date"
                  value={linkedStartsOn}
                  disabled={!hasUserLinkSelectionOptions || isSaving}
                  onChange={(event) => setLinkedStartsOn(event.target.value)}
                />
              </div>
            </div>
            <div className="action-row">
              <button
                className="button button--success"
                type="submit"
                disabled={!hasUserLinkSelectionOptions || isSaving}
              >
                <Link2 aria-hidden="true" size={17} strokeWidth={2} />
                Vincular conta ao colaborador
              </button>
            </div>
          </form>

          <RelationshipTable
            entries={userLinks}
            getAccountName={(entry) => accountLabel(userNamesById, entry.userId)}
            getCollaboratorName={(entry) =>
              collaboratorLabel(collaboratorNamesById, entry.collaboratorId)
            }
            accountColumn="Conta"
            onClose={(entry) =>
              setCloseTarget({
                kind: 'USER',
                id: entry.id,
                label: `${accountLabel(userNamesById, entry.userId)} · ${collaboratorLabel(
                  collaboratorNamesById,
                  entry.collaboratorId,
                )}`,
              })
            }
          />
        </section>
      ) : null}

      {closeTarget ? (
        <section className="card stack-form" aria-labelledby="close-relationship-title">
          <h3 id="close-relationship-title">Confirmar encerramento de vínculo</h3>
          <p className="muted">
            {closeTarget.label}. O encerramento conserva o histórico; não exclui avaliações nem
            registros anteriores.
          </p>
          <form className="stack-form" noValidate onSubmit={closeRelationship} aria-busy={isSaving}>
            <div className="field">
              <label htmlFor={endsOnId}>Data de encerramento</label>
              <input
                id={endsOnId}
                type="date"
                value={endsOn}
                disabled={isSaving}
                onChange={(event) => setEndsOn(event.target.value)}
              />
            </div>
            <div className="action-row">
              <button
                className="button"
                type="button"
                disabled={isSaving}
                onClick={() => setCloseTarget(undefined)}
              >
                Cancelar
              </button>
              <button className="button button--danger" type="submit" disabled={isSaving}>
                <Unlink aria-hidden="true" size={17} strokeWidth={2} />
                Confirmar encerramento
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </section>
  )
}

function RelationshipTable<Entry extends { id: string; startsOn: string | null }>({
  entries,
  getAccountName,
  getCollaboratorName,
  accountColumn,
  collaboratorColumn = 'Colaborador',
  onClose,
}: {
  entries: readonly Entry[]
  getAccountName: (entry: Entry) => string
  getCollaboratorName: (entry: Entry) => string
  accountColumn: string
  collaboratorColumn?: string
  onClose: (entry: Entry) => void
}) {
  const pagination = useClientPagination(entries, 5)

  if (entries.length === 0) {
    return <p className="muted">Não há vínculos ativos.</p>
  }

  return (
    <div className="administration-users">
      <table>
        <caption className="visually-hidden">Vínculos ativos</caption>
        <thead>
          <tr>
            <th scope="col">{accountColumn}</th>
            <th scope="col">{collaboratorColumn}</th>
            <th scope="col">Início</th>
            <th scope="col">Ação</th>
          </tr>
        </thead>
        <tbody>
          {pagination.items.map((entry) => (
            <tr key={entry.id}>
              <td data-label={accountColumn}>{getAccountName(entry)}</td>
              <td data-label={collaboratorColumn}>{getCollaboratorName(entry)}</td>
              <td data-label="Início">{entry.startsOn ?? 'Não informado'}</td>
              <td data-label="Ação">
                <div className="table-actions">
                  <button
                    className="button button--danger"
                    type="button"
                    onClick={() => onClose(entry)}
                  >
                    <Unlink aria-hidden="true" size={16} strokeWidth={2} />
                    Encerrar
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination
        currentPage={pagination.currentPage}
        hasNextPage={pagination.hasNextPage}
        itemCountOnPage={pagination.items.length}
        itemLabel={`vínculos de ${accountColumn.toLocaleLowerCase('pt-BR')}`}
        onNextPage={pagination.onNextPage}
        onPreviousPage={pagination.onPreviousPage}
        totalPages={pagination.totalPages}
      />
    </div>
  )
}

function accountLabel(
  usersById: ReadonlyMap<string, AdministrativePersonOption>,
  id: string,
): string {
  return usersById.get(id)?.displayName ?? 'Conta não disponível'
}

function collaboratorLabel(
  collaboratorsById: ReadonlyMap<string, AdministrativePersonOption>,
  id: string,
): string {
  return collaboratorsById.get(id)?.displayName ?? 'Colaborador não disponível'
}
