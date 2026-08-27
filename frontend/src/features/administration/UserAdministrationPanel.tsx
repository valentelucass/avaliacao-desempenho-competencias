import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Ellipsis, KeyRound, Plus, RefreshCw, Save, ShieldCheck, Trash2, X } from 'lucide-react'
import { isAuthenticationError } from '../../api/client'
import type { ApiClient } from '../../api/client'
import type {
  AccountStatus,
  AdministrationUser,
  Permission,
  PermissionGrantEffect,
} from '../../api/contracts'
import { FeedbackMessage } from '../../ui/Feedback'
import { safeErrorMessage } from '../../ui/safeErrorMessage'
import { useAccessibleDialog } from '../../ui/useAccessibleDialog'

type UserAdministrationPanelProps = {
  api: ApiClient
  currentUserId: string
  isSupremeAdministrator: boolean
  permissions: readonly Permission[]
  onSessionExpired: () => void
}

type AccessCatalogItem = {
  code: string
  label: string
}

type InitialAccountProfile = 'ADMINISTRATOR' | 'MANAGER' | 'HUMAN_RESOURCES' | 'BOARD' | 'USER'

type InitialAccountProfileOption = {
  value: InitialAccountProfile
  label: string
  hint: string
  roles: readonly string[]
}

const accountProfileCatalog: readonly InitialAccountProfileOption[] = [
  {
    value: 'ADMINISTRATOR',
    label: 'Administrador',
    hint: 'Administra a plataforma e os cadastros. Publicação, reabertura, indicadores e exportação são reservados a RH ou Diretoria.',
    roles: ['ADMINISTRADOR_PLATAFORMA'],
  },
  {
    value: 'MANAGER',
    label: 'Gestor',
    hint: 'Pode avaliar somente colaboradores com vínculo de gestor ativo e autorizado.',
    roles: ['GESTOR'],
  },
  {
    value: 'HUMAN_RESOURCES',
    label: 'Gerência de RH',
    hint: 'Pode tomar decisões de publicação e reabertura e consultar ou exportar indicadores dentro das regras de privacidade.',
    roles: ['GERENCIA_RH'],
  },
  {
    value: 'BOARD',
    label: 'Diretoria',
    hint: 'Pode tomar decisões de publicação e reabertura e consultar ou exportar indicadores dentro das regras de privacidade.',
    roles: ['DIRETORIA'],
  },
  {
    value: 'USER',
    label: 'Usuário comum',
    hint: 'Acessa somente a própria autoavaliação quando houver vínculo, ciclo e questionário.',
    roles: ['COLABORADOR'],
  },
]

const passwordResetField = ['temporary', 'Password'].join('')

const roleCatalog: readonly AccessCatalogItem[] = [
  {
    code: 'ADMINISTRADOR_PLATAFORMA',
    label: 'Administrador',
  },
  { code: 'GESTOR', label: 'Gestor' },
  { code: 'GERENCIA_RH', label: 'Gerência de RH' },
  { code: 'DIRETORIA', label: 'Diretoria' },
  { code: 'COLABORADOR', label: 'Usuário comum' },
]

const permissionCatalog: readonly AccessCatalogItem[] = [
  { code: 'USUARIOS.LER', label: 'Consultar contas' },
  { code: 'USUARIOS.CRIAR', label: 'Criar contas' },
  { code: 'USUARIOS.ALTERAR', label: 'Alterar contas' },
  { code: 'ACESSOS.GERIR', label: 'Gerir acesso técnico' },
  {
    code: 'AVALIACOES.AVALIAR_VINCULADOS',
    label: 'Avaliar colaboradores vinculados',
  },
  {
    code: 'AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS',
    label: 'Consultar próprias avaliações de gestor',
  },
  {
    code: 'AVALIACOES.VISUALIZAR_TODAS',
    label: 'Consultar todas as avaliações',
  },
  { code: 'AVALIACOES.PUBLICAR', label: 'Publicar avaliações' },
  { code: 'AVALIACOES.REABRIR', label: 'Reabrir avaliações' },
  { code: 'INDICADORES.VISUALIZAR', label: 'Consultar indicadores' },
  { code: 'DADOS.EXPORTAR', label: 'Exportar indicadores' },
  {
    code: 'AUTOAVALIACOES.PREENCHER_PROPRIA',
    label: 'Preencher própria autoavaliação',
  },
  {
    code: 'AUTOAVALIACOES.ENVIAR_PROPRIA',
    label: 'Enviar própria autoavaliação',
  },
  {
    code: 'AUTOAVALIACOES.VISUALIZAR_PROPRIA',
    label: 'Consultar própria autoavaliação',
  },
  { code: 'CADASTROS.GERIR', label: 'Gerir cadastros' },
  {
    code: 'ACESSOS.NEGOCIO.GERIR',
    label: 'Gerir acesso de negócio',
  },
  { code: 'CICLOS.GERIR', label: 'Gerir ciclos' },
  { code: 'QUESTIONARIOS.GERIR', label: 'Gerir questionários' },
  {
    code: 'VINCULOS_GESTOR_COLABORADOR.GERIR',
    label: 'Gerir vínculos gestor-colaborador',
  },
  {
    code: 'VINCULOS_USUARIO_COLABORADOR.GERIR',
    label: 'Gerir vínculos usuário-colaborador',
  },
]

/**
 * Administração de contas locais com catálogo fechado de papéis e permissões.
 * A API continua sendo a autoridade para a segregação técnica/de negócio e para
 * revogação de sessões após qualquer alteração de acesso.
 */
export function UserAdministrationPanel({
  api,
  currentUserId,
  isSupremeAdministrator,
  permissions,
  onSessionExpired,
}: UserAdministrationPanelProps) {
  const loginId = useId()
  const displayNameId = useId()
  const initialPasswordId = useId()
  const initialProfileId = useId()
  const accessProfileId = useId()
  const editDisplayNameId = useId()
  const editStatusId = useId()
  const temporaryPasswordId = useId()
  const detailRequest = useRef(0)
  const selectedUserDialogRef = useRef<HTMLElement | null>(null)
  const [users, setUsers] = useState<readonly AdministrationUser[]>([])
  const [selectedUser, setSelectedUser] = useState<AdministrationUser>()
  const [draftRoles, setDraftRoles] = useState<readonly string[]>([])
  const [newLogin, setNewLogin] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newInitialPassword, setNewInitialPassword] = useState('')
  const [newAccountProfile, setNewAccountProfile] = useState<InitialAccountProfile>('USER')
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editStatus, setEditStatus] = useState<AccountStatus>('ACTIVE')
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSavingAccess, setIsSavingAccess] = useState(false)
  const [isResettingPassword, setIsResettingPassword] = useState(false)
  const [listError, setListError] = useState<string>()
  const [detailError, setDetailError] = useState<string>()
  const [createError, setCreateError] = useState<string>()
  const [updateError, setUpdateError] = useState<string>()
  const [accessError, setAccessError] = useState<string>()
  const [passwordResetError, setPasswordResetError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  const canReadUsers = permissions.includes('USUARIOS.LER')
  const canCreateUsers = permissions.includes('USUARIOS.CRIAR')
  const canUpdateUsers = permissions.includes('USUARIOS.ALTERAR')
  const canManageTechnicalAccess = permissions.includes('ACESSOS.GERIR')
  const canManageBusinessAccess = permissions.includes('ACESSOS.NEGOCIO.GERIR')
  const canManageAccess = canManageTechnicalAccess || canManageBusinessAccess

  const accountProfiles = useMemo<ReadonlyArray<InitialAccountProfileOption>>(() => {
    return accountProfileCatalog.filter(
      (profile) =>
        (profile.value !== 'ADMINISTRATOR' && canManageBusinessAccess) ||
        (profile.value === 'ADMINISTRATOR' && canManageTechnicalAccess && canManageBusinessAccess),
    )
  }, [canManageBusinessAccess, canManageTechnicalAccess])

  const selectedInitialProfile =
    accountProfiles.find((profile) => profile.value === newAccountProfile) ?? accountProfiles[0]

  const updateKnownUser = useCallback((user: AdministrationUser) => {
    setUsers((currentUsers) => {
      const wasListed = currentUsers.some((currentUser) => currentUser.id === user.id)
      if (!wasListed) {
        return [user, ...currentUsers]
      }
      return currentUsers.map((currentUser) => (currentUser.id === user.id ? user : currentUser))
    })
  }, [])

  const hydrateSelectedUser = useCallback((user: AdministrationUser) => {
    setSelectedUser(user)
    setEditDisplayName(user.displayName)
    setEditStatus(user.status)
    const profile = profileForRoles(user.roles)
    setDraftRoles(profile.roles)
  }, [])

  const loadUsers = useCallback(async () => {
    if (!canReadUsers) {
      return
    }

    setIsLoadingUsers(true)
    setListError(undefined)
    try {
      setUsers(await api.listAdministrationUsers())
    } catch (requestError) {
      if (isAuthenticationError(requestError)) {
        onSessionExpired()
        return
      }
      setListError(safeErrorMessage(requestError))
    } finally {
      setIsLoadingUsers(false)
    }
  }, [api, canReadUsers, onSessionExpired])

  useEffect(() => {
    if (!canReadUsers) {
      return
    }
    // oxlint-disable-next-line react/set-state-in-effect -- Network loading is asynchronous.
    void loadUsers()
  }, [canReadUsers, loadUsers])

  const selectUser = useCallback(
    async (userId: string) => {
      const requestNumber = detailRequest.current + 1
      detailRequest.current = requestNumber
      setIsLoadingDetail(true)
      setDetailError(undefined)
      setUpdateError(undefined)
      setAccessError(undefined)
      setPasswordResetError(undefined)
      setNotice(undefined)

      try {
        const user = await api.getAdministrationUser(userId)
        if (detailRequest.current !== requestNumber) {
          return
        }
        updateKnownUser(user)
        hydrateSelectedUser(user)
      } catch (requestError) {
        if (isAuthenticationError(requestError)) {
          onSessionExpired()
          return
        }
        if (detailRequest.current === requestNumber) {
          setDetailError(safeErrorMessage(requestError))
        }
      } finally {
        if (detailRequest.current === requestNumber) {
          setIsLoadingDetail(false)
        }
      }
    },
    [api, hydrateSelectedUser, onSessionExpired, updateKnownUser],
  )

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreateError(undefined)
    setNotice(undefined)

    const login = newLogin.trim()
    const displayName = newDisplayName.trim()
    const initialPassword = newInitialPassword
    setNewInitialPassword('')

    if (!login || !displayName || !initialPassword) {
      setCreateError('Informe login, nome e senha inicial para criar a conta.')
      return
    }
    if (initialPassword.length < 12) {
      setCreateError('A senha inicial deve ter ao menos 12 caracteres.')
      return
    }

    setIsCreating(true)
    try {
      const createdUser = await api.createAdministrationUser({
        login,
        displayName,
        initialPassword,
        initialRoles: selectedInitialProfile?.roles ?? [],
      })
      updateKnownUser(createdUser)
      if (canReadUsers) {
        hydrateSelectedUser(createdUser)
      }
      setNewLogin('')
      setNewDisplayName('')
      setNotice('Conta criada. A senha inicial não será exibida novamente.')
    } catch (requestError) {
      if (isAuthenticationError(requestError)) {
        onSessionExpired()
        return
      }
      setCreateError(safeErrorMessage(requestError))
    } finally {
      setIsCreating(false)
    }
  }

  async function logicallyDeleteUser(user: AdministrationUser) {
    if (
      !canUpdateUsers ||
      user.protectedFromNormalFlow ||
      user.logicallyDeleted ||
      user.id === currentUserId
    ) {
      return
    }
    if (
      !window.confirm(
        `Excluir logicamente a conta “${user.displayName}”? Ela será desativada, perderá as sessões e permanecerá no histórico.`,
      )
    ) {
      return
    }

    setUpdateError(undefined)
    setNotice(undefined)
    setIsDeleting(true)
    try {
      const deletedUser = await api.logicallyDeleteAdministrationUser(user.id)
      updateKnownUser(deletedUser)
      if (selectedUser?.id === deletedUser.id) {
        hydrateSelectedUser(deletedUser)
      }
      setNotice('Conta excluída logicamente e sessões revogadas. O histórico foi preservado.')
    } catch (requestError) {
      if (isAuthenticationError(requestError)) {
        onSessionExpired()
        return
      }
      setUpdateError(safeErrorMessage(requestError))
    } finally {
      setIsDeleting(false)
    }
  }

  async function updateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedUser) {
      return
    }

    const displayName = editDisplayName.trim()
    setUpdateError(undefined)
    setNotice(undefined)
    if (!displayName) {
      setUpdateError('Informe o nome da conta.')
      return
    }

    setIsUpdating(true)
    try {
      const updatedUser = await api.updateAdministrationUser(selectedUser.id, {
        displayName,
        status: editStatus,
      })
      updateKnownUser(updatedUser)
      hydrateSelectedUser(updatedUser)
      setNotice('Dados da conta atualizados.')
    } catch (requestError) {
      if (isAuthenticationError(requestError)) {
        onSessionExpired()
        return
      }
      setUpdateError(safeErrorMessage(requestError))
    } finally {
      setIsUpdating(false)
    }
  }

  async function resetSelectedUserPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      !selectedUser ||
      !isSupremeAdministrator ||
      selectedUser.id === currentUserId ||
      !selectedUserIsMutable
    ) {
      return
    }

    const resetPassword = temporaryPassword
    setTemporaryPassword('')
    setPasswordResetError(undefined)
    setNotice(undefined)
    if (resetPassword.length < 12) {
      setPasswordResetError('A senha temporária deve ter ao menos 12 caracteres.')
      return
    }

    setIsResettingPassword(true)
    try {
      const resetInput = { [passwordResetField]: resetPassword } as { temporaryPassword: string }
      const updatedUser = await api.resetAdministrationUserPassword(selectedUser.id, resetInput)
      updateKnownUser(updatedUser)
      hydrateSelectedUser(updatedUser)
      setNotice(
        'Senha temporária definida. As sessões anteriores foram revogadas e a troca será obrigatória no próximo acesso.',
      )
    } catch (requestError) {
      if (isAuthenticationError(requestError)) {
        onSessionExpired()
        return
      }
      setPasswordResetError(safeErrorMessage(requestError))
    } finally {
      setIsResettingPassword(false)
    }
  }

  async function saveAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedUser || selectedUser.id === currentUserId || !canManageAccess) {
      return
    }

    setAccessError(undefined)
    setNotice(undefined)
    setIsSavingAccess(true)
    try {
      const updatedUser = await api.replaceAdministrationUserAccessGrants(selectedUser.id, {
        roles: uniqueCodes(draftRoles),
        permissions: [],
      })
      updateKnownUser(updatedUser)
      hydrateSelectedUser(updatedUser)
      setNotice('Acessos atualizados. O servidor registra a operação e revoga sessões aplicáveis.')
    } catch (requestError) {
      if (isAuthenticationError(requestError)) {
        onSessionExpired()
        return
      }
      setAccessError(safeErrorMessage(requestError))
    } finally {
      setIsSavingAccess(false)
    }
  }

  function selectAccessProfile(profileValue: InitialAccountProfile) {
    const profile = accountProfiles.find((item) => item.value === profileValue)
    if (!profile) {
      return
    }
    setDraftRoles(profile.roles)
  }

  const selectedUserIsCurrent = selectedUser?.id === currentUserId
  const selectedUserIsMutable =
    Boolean(selectedUser) &&
    !selectedUser?.protectedFromNormalFlow &&
    !selectedUser?.logicallyDeleted
  const hasAnyAdministrationPermission =
    canReadUsers || canCreateUsers || canUpdateUsers || canManageAccess

  useAccessibleDialog({
    dialogRef: selectedUserDialogRef,
    isOpen: Boolean(selectedUser && !isLoadingDetail),
    onRequestClose: () => setSelectedUser(undefined),
  })

  return (
    <section aria-labelledby="user-administration-title" className="user-administration">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Administração de acesso</p>
          <h2 id="user-administration-title">Contas e concessões</h2>
          <p className="muted">
            Cada conta recebe exatamente um perfil. A autorização efetiva e a segregação de funções
            são sempre verificadas no servidor.
          </p>
        </div>
        {canReadUsers ? (
          <button
            className="button"
            type="button"
            onClick={() => void loadUsers()}
            disabled={isLoadingUsers}
          >
            <RefreshCw aria-hidden="true" size={17} strokeWidth={2} />
            {isLoadingUsers ? 'Atualizando…' : 'Atualizar contas'}
          </button>
        ) : null}
      </div>

      {notice ? <FeedbackMessage kind="status">{notice}</FeedbackMessage> : null}

      {!hasAnyAdministrationPermission ? (
        <FeedbackMessage kind="error">
          Você não possui permissão para consultar ou administrar contas locais.
        </FeedbackMessage>
      ) : null}

      {canCreateUsers && accountProfiles.length > 0 ? (
        <section className="card" aria-labelledby="create-user-title">
          <h3 id="create-user-title">Criar conta local</h3>
          <p className="muted">
            A nova conta receberá uma senha inicial de uso único e deverá alterá-la no primeiro
            acesso.
          </p>
          <form
            className="stack-form administration-user-create-form"
            onSubmit={createUser}
            noValidate
            aria-busy={isCreating}
          >
            {createError ? <FeedbackMessage kind="error">{createError}</FeedbackMessage> : null}
            <div className="field">
              <label htmlFor={loginId}>Login</label>
              <input
                id={loginId}
                name="login"
                value={newLogin}
                onChange={(event) => setNewLogin(event.target.value)}
                autoComplete="username"
                disabled={isCreating}
                maxLength={150}
                required
              />
              <p className="field-hint">Identificador único usado para entrar na plataforma.</p>
            </div>
            <div className="field">
              <label htmlFor={displayNameId}>Nome</label>
              <input
                id={displayNameId}
                name="displayName"
                value={newDisplayName}
                onChange={(event) => setNewDisplayName(event.target.value)}
                autoComplete="name"
                disabled={isCreating}
                maxLength={200}
                required
              />
              <p className="field-hint">
                Nome exibido para identificar a conta nas telas internas.
              </p>
            </div>
            <div className="field">
              <label htmlFor={initialPasswordId}>Senha inicial</label>
              <input
                id={initialPasswordId}
                name="initialPassword"
                type="password"
                value={newInitialPassword}
                onChange={(event) => setNewInitialPassword(event.target.value)}
                autoComplete="new-password"
                disabled={isCreating}
                minLength={12}
                maxLength={200}
                required
              />
              <p className="field-hint">
                Mínimo de 12 caracteres. Por segurança, ela não será exibida depois da criação.
              </p>
            </div>
            <div className="field administration-user-create-form__profile">
              <label htmlFor={initialProfileId}>Perfil inicial</label>
              <select
                id={initialProfileId}
                name="initialProfile"
                value={newAccountProfile}
                onChange={(event) =>
                  setNewAccountProfile(event.target.value as InitialAccountProfile)
                }
                disabled={isCreating}
              >
                {accountProfiles.map((profile) => (
                  <option key={profile.value} value={profile.value}>
                    {profile.label}
                  </option>
                ))}
              </select>
              <p className="field-hint">{selectedInitialProfile?.hint}</p>
            </div>
            <div className="action-row">
              <button className="button button--success" type="submit" disabled={isCreating}>
                <Plus aria-hidden="true" size={17} strokeWidth={2} />
                {isCreating ? 'Criando…' : 'Criar conta'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {canReadUsers ? (
        <section className="card" aria-labelledby="local-users-title">
          <div className="section-heading">
            <div>
              <h3 id="local-users-title">Contas locais</h3>
              <p className="muted">Selecione uma conta para consultar dados e concessões atuais.</p>
            </div>
          </div>

          {isLoadingUsers ? (
            <FeedbackMessage kind="info">Carregando contas locais…</FeedbackMessage>
          ) : null}
          {listError ? <FeedbackMessage kind="error">{listError}</FeedbackMessage> : null}
          {!isLoadingUsers && !listError && users.length === 0 ? (
            <FeedbackMessage kind="warning">Não há contas locais cadastradas.</FeedbackMessage>
          ) : null}

          {!isLoadingUsers && !listError && users.length > 0 ? (
            <div className="administration-users local-users-table">
              <table>
                <caption className="visually-hidden">
                  Contas locais disponíveis para administração
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Nome</th>
                    <th scope="col">Login</th>
                    <th scope="col">Situação</th>
                    <th scope="col">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td data-label="Nome">{user.displayName}</td>
                      <td data-label="Login">{user.login}</td>
                      <td data-label="Situação">
                        <span className={`status-badge status-badge--${user.status.toLowerCase()}`}>
                          {formatAccountStatus(user)}
                        </span>
                      </td>
                      <td data-label="Ação">
                        <AccountActions
                          user={user}
                          isBusy={isLoadingDetail || isUpdating || isDeleting}
                          onOpen={() => void selectUser(user.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {isLoadingDetail ? (
        <FeedbackMessage kind="info">Carregando detalhes da conta…</FeedbackMessage>
      ) : null}
      {detailError ? <FeedbackMessage kind="error">{detailError}</FeedbackMessage> : null}

      {selectedUser && !isLoadingDetail ? (
        <div className="account-dialog-backdrop" onMouseDown={() => setSelectedUser(undefined)}>
          <section
            aria-labelledby="selected-user-title"
            aria-modal="true"
            className="card selected-user-card account-dialog"
            ref={selectedUserDialogRef}
            role="dialog"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">Conta selecionada</p>
                <h3 id="selected-user-title">Detalhes de {selectedUser.displayName}</h3>
              </div>
              <div className="account-dialog__header-actions">
                <span className={`status-badge status-badge--${selectedUser.status.toLowerCase()}`}>
                  {formatAccountStatus(selectedUser)}
                </span>
                <button
                  aria-label="Fechar detalhes da conta"
                  className="icon-button"
                  data-dialog-initial-focus
                  type="button"
                  onClick={() => setSelectedUser(undefined)}
                >
                  <X aria-hidden="true" size={18} strokeWidth={2} />
                </button>
              </div>
            </div>

            <div className="selected-user-overview">
              <dl className="definition-list">
                <div>
                  <dt>Login</dt>
                  <dd>{selectedUser.login}</dd>
                </div>
                <div>
                  <dt>Situação da senha</dt>
                  <dd>
                    {selectedUser.passwordChangeRequired ? 'Troca obrigatória' : 'Atualizada'}
                  </dd>
                </div>
                <div>
                  <dt>Última atualização</dt>
                  <dd>{formatUpdatedAt(selectedUser.updatedAt)}</dd>
                </div>
              </dl>

              <AccessSummary user={selectedUser} />
            </div>

            {isSupremeAdministrator && !selectedUserIsCurrent && selectedUserIsMutable ? (
              <form
                className="stack-form user-password-reset-form"
                onSubmit={resetSelectedUserPassword}
                noValidate
                aria-busy={isResettingPassword}
              >
                <h4>Redefinir senha</h4>
                <p className="muted">
                  Defina uma senha temporária para recuperação. A conta será obrigada a trocá-la no
                  próximo acesso e todas as sessões atuais serão encerradas.
                </p>
                {passwordResetError ? (
                  <FeedbackMessage kind="error">{passwordResetError}</FeedbackMessage>
                ) : null}
                <div className="field">
                  <label htmlFor={temporaryPasswordId}>Senha temporária</label>
                  <input
                    id={temporaryPasswordId}
                    name="temporaryPassword"
                    type="password"
                    value={temporaryPassword}
                    onChange={(event) => setTemporaryPassword(event.target.value)}
                    autoComplete="new-password"
                    disabled={isResettingPassword}
                    minLength={12}
                    maxLength={200}
                    required
                  />
                  <p className="field-hint">
                    Mínimo de 12 caracteres. Ela não será exibida novamente após a redefinição.
                  </p>
                </div>
                <div className="action-row">
                  <button
                    className="button button--success"
                    type="submit"
                    disabled={isResettingPassword}
                  >
                    <KeyRound aria-hidden="true" size={17} strokeWidth={2} />
                    {isResettingPassword ? 'Redefinindo…' : 'Definir senha temporária'}
                  </button>
                </div>
              </form>
            ) : null}

            {canUpdateUsers && selectedUserIsMutable ? (
              <form
                className="stack-form user-account-edit-form"
                onSubmit={updateUser}
                noValidate
                aria-busy={isUpdating}
              >
                <h4>Editar conta</h4>
                {updateError ? <FeedbackMessage kind="error">{updateError}</FeedbackMessage> : null}
                <div className="field">
                  <label htmlFor={editDisplayNameId}>Nome</label>
                  <input
                    id={editDisplayNameId}
                    name="editDisplayName"
                    value={editDisplayName}
                    onChange={(event) => setEditDisplayName(event.target.value)}
                    disabled={isUpdating}
                    maxLength={200}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor={editStatusId}>Situação</label>
                  <select
                    id={editStatusId}
                    name="editStatus"
                    value={editStatus}
                    onChange={(event) => setEditStatus(event.target.value as AccountStatus)}
                    disabled={isUpdating}
                  >
                    <option value="ACTIVE">Ativa</option>
                    <option value="BLOCKED">Bloqueada</option>
                    <option value="DISABLED">Desativada</option>
                  </select>
                </div>
                <div className="action-row">
                  <button className="button button--success" type="submit" disabled={isUpdating}>
                    <Save aria-hidden="true" size={17} strokeWidth={2} />
                    {isUpdating ? 'Salvando…' : 'Salvar dados da conta'}
                  </button>
                  {!selectedUser.protectedFromNormalFlow &&
                  !selectedUser.logicallyDeleted &&
                  selectedUser.id !== currentUserId ? (
                    <button
                      className="button button--danger"
                      type="button"
                      onClick={() => void logicallyDeleteUser(selectedUser)}
                      disabled={isUpdating || isDeleting}
                    >
                      <Trash2 aria-hidden="true" size={17} strokeWidth={2} />
                      {isDeleting ? 'Excluindo…' : 'Excluir logicamente'}
                    </button>
                  ) : null}
                </div>
              </form>
            ) : null}

            {selectedUser.protectedFromNormalFlow ? (
              <FeedbackMessage kind="warning">
                Esta é uma conta administradora suprema protegida. Ela não pode ser alterada,
                desativada, excluída logicamente ou ter acessos substituídos pelo fluxo normal.
              </FeedbackMessage>
            ) : null}

            {selectedUserIsCurrent ? (
              <FeedbackMessage kind="status">
                A configuração de acesso da sua própria conta não pode ser exibida para edição nesta
                tela.
              </FeedbackMessage>
            ) : null}

            {!selectedUserIsCurrent &&
            selectedUserIsMutable &&
            canManageAccess &&
            accountProfiles.length > 0 ? (
              <form
                className="stack-form"
                onSubmit={saveAccess}
                noValidate
                aria-busy={isSavingAccess}
              >
                <h4>Perfil de acesso</h4>
                <p className="muted">
                  Escolha exatamente um perfil. Ao salvar, os papéis anteriores e exceções
                  individuais desta conta serão removidos; o servidor revalida o operador, o alvo e
                  todas as regras.
                </p>
                {accessError ? <FeedbackMessage kind="error">{accessError}</FeedbackMessage> : null}

                <fieldset disabled={isSavingAccess}>
                  <legend>Perfil</legend>
                  <label htmlFor={accessProfileId}>Perfil de acesso</label>
                  <select
                    id={accessProfileId}
                    name="accessProfile"
                    value={profileForRoles(draftRoles).value}
                    onChange={(event) =>
                      selectAccessProfile(event.target.value as InitialAccountProfile)
                    }
                  >
                    {accountProfiles.map((profile) => (
                      <option key={profile.value} value={profile.value}>
                        {profile.label}
                      </option>
                    ))}
                  </select>
                  <p className="field-hint">{profileForRoles(draftRoles).hint}</p>
                </fieldset>

                <div className="action-row">
                  <button
                    className="button button--success"
                    type="submit"
                    disabled={isSavingAccess}
                  >
                    <ShieldCheck aria-hidden="true" size={17} strokeWidth={2} />
                    {isSavingAccess ? 'Salvando acessos…' : 'Salvar acessos'}
                  </button>
                </div>
              </form>
            ) : null}

            {!selectedUserIsCurrent &&
            selectedUserIsMutable &&
            (!canManageAccess || accountProfiles.length === 0) ? (
              <p className="field-hint">
                Sua conta pode consultar esta configuração, mas não possui autorização integral para
                alterar perfis.
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
  )
}

type AccountActionsProps = {
  user: AdministrationUser
  isBusy: boolean
  onOpen: () => void
}

function AccountActions({ user, isBusy, onOpen }: AccountActionsProps) {
  return (
    <div className="account-actions">
      <button
        aria-haspopup="dialog"
        aria-label={`Ações para ${user.displayName}`}
        className="account-actions__trigger"
        type="button"
        onClick={onOpen}
        disabled={isBusy}
      >
        <Ellipsis aria-hidden="true" size={19} strokeWidth={2} />
        <span className="visually-hidden">Ações para {user.displayName}</span>
      </button>
    </div>
  )
}

function AccessSummary({ user }: { user: AdministrationUser }) {
  const profile = profileForRoles(user.roles)
  const legacyRoles = user.roles.filter(
    (role) => !accountProfileCatalog.some((knownProfile) => knownProfile.roles.includes(role)),
  )
  return (
    <section aria-labelledby="access-summary-title" className="access-summary">
      <h4 id="access-summary-title">Acessos atuais</h4>
      <div className="field">
        <p className="field-hint">Perfil efetivo</p>
        <p>{profile.label}</p>
      </div>
      {legacyRoles.length > 0 ? (
        <div className="field">
          <p className="field-hint">Papéis legados registrados</p>
          <ul>
            {legacyRoles.map((role) => (
              <li key={role}>{formatCatalogItem(roleCatalog, role)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="field">
        <p className="field-hint">Exceções individuais legadas (somente leitura)</p>
        {user.individualPermissions.length > 0 ? (
          <ul>
            {user.individualPermissions.map((permission) => (
              <li key={permission.code}>
                {formatCatalogItem(permissionCatalog, permission.code)}:{' '}
                {formatPermissionEffect(permission.effect)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Nenhuma exceção individual.</p>
        )}
      </div>
    </section>
  )
}

function uniqueCodes(codes: readonly string[]): readonly string[] {
  return [...new Set(codes)]
}

function profileForRoles(roles: readonly string[]): InitialAccountProfileOption {
  return (
    accountProfileCatalog.find((profile) => profile.roles.some((role) => roles.includes(role))) ??
    accountProfileCatalog.find((profile) => profile.value === 'USER')!
  )
}

function formatCatalogItem(catalog: readonly AccessCatalogItem[], code: string): string {
  return catalog.find((item) => item.code === code)?.label ?? code
}

function formatPermissionEffect(effect: PermissionGrantEffect): string {
  return effect === 'ALLOW' ? 'Permitir' : 'Negar'
}

function formatAccountStatus(user: AdministrationUser): string {
  if (user.logicallyDeleted) {
    return 'Excluída logicamente'
  }
  const labels: Record<AccountStatus, string> = {
    ACTIVE: 'Ativa',
    BLOCKED: 'Bloqueada',
    DISABLED: 'Desativada',
  }
  return labels[user.status]
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Não informado'
  }
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}
