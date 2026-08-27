import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link2, RefreshCw, Unlink } from 'lucide-react'
import { isAuthenticationError } from '../../api/client'
import type { ApiClient } from '../../api/client'
import type {
  ActiveManagerAssignment,
  ActiveUserCollaboratorLink,
  AdministrativePersonOption,
  ManagerAssignmentOptions,
  Permission,
  UserCollaboratorLinkOptions,
} from '../../api/contracts'
import { FeedbackMessage } from '../../ui/Feedback'
import { safeErrorMessage } from '../../ui/safeErrorMessage'

type RelationshipAdministrationPanelProps = {
  api: ApiClient
  permissions: readonly Permission[]
  onSessionExpired: () => void
}

type CloseTarget =
  { kind: 'MANAGER'; id: string; label: string } | { kind: 'USER'; id: string; label: string }

/** Vínculos ativos entre contas, gestores e colaboradores, sempre encerrados por data. */
export function RelationshipAdministrationPanel({
  api,
  permissions,
  onSessionExpired,
}: RelationshipAdministrationPanelProps) {
  const managerUserId = useId()
  const managerCollaboratorId = useId()
  const managerStartsOnId = useId()
  const userId = useId()
  const userCollaboratorId = useId()
  const userStartsOnId = useId()
  const endsOnId = useId()
  const [managerOptions, setManagerOptions] = useState<ManagerAssignmentOptions>({
    managers: [],
    collaborators: [],
  })
  const [userLinkOptions, setUserLinkOptions] = useState<UserCollaboratorLinkOptions>({
    users: [],
    collaborators: [],
  })
  const [managerAssignments, setManagerAssignments] = useState<readonly ActiveManagerAssignment[]>(
    [],
  )
  const [userLinks, setUserLinks] = useState<readonly ActiveUserCollaboratorLink[]>([])
  const [managerUser, setManagerUser] = useState('')
  const [managerCollaborator, setManagerCollaborator] = useState('')
  const [managerStartsOn, setManagerStartsOn] = useState('')
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
  const canManageUserLinks = permissions.includes('VINCULOS_USUARIO_COLABORADOR.GERIR')
  const canManageRelationships = canManageManagerAssignments || canManageUserLinks
  const managerNamesById = useMemo(
    () => new Map(managerOptions.managers.map((person) => [person.id, person])),
    [managerOptions.managers],
  )
  const userNamesById = useMemo(
    () => new Map(userLinkOptions.users.map((person) => [person.id, person])),
    [userLinkOptions.users],
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
        loadedUserLinkOptions,
        loadedManagerAssignments,
        loadedUserLinks,
      ] = await Promise.all([
        canManageManagerAssignments
          ? api.getManagerAssignmentOptions()
          : Promise.resolve({ managers: [], collaborators: [] }),
        canManageUserLinks
          ? api.getUserCollaboratorLinkOptions()
          : Promise.resolve({ users: [], collaborators: [] }),
        canManageManagerAssignments ? api.listActiveManagerAssignments() : Promise.resolve([]),
        canManageUserLinks ? api.listActiveUserCollaboratorLinks() : Promise.resolve([]),
      ])
      setManagerOptions(loadedManagerOptions)
      setUserLinkOptions(loadedUserLinkOptions)
      setManagerAssignments(loadedManagerAssignments)
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

function RelationshipTable<
  Entry extends { id: string; startsOn: string | null; collaboratorId: string },
>({
  entries,
  getAccountName,
  getCollaboratorName,
  accountColumn,
  onClose,
}: {
  entries: readonly Entry[]
  getAccountName: (entry: Entry) => string
  getCollaboratorName: (entry: Entry) => string
  accountColumn: string
  onClose: (entry: Entry) => void
}) {
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
            <th scope="col">Colaborador</th>
            <th scope="col">Início</th>
            <th scope="col">Ação</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>{getAccountName(entry)}</td>
              <td>{getCollaboratorName(entry)}</td>
              <td>{entry.startsOn ?? 'Não informado'}</td>
              <td>
                <button
                  className="button button--danger"
                  type="button"
                  onClick={() => onClose(entry)}
                >
                  <Unlink aria-hidden="true" size={16} strokeWidth={2} />
                  Encerrar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
