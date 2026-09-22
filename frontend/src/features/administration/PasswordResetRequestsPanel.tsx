import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { KeyRound, RefreshCw, Save, UserRound, X } from 'lucide-react'
import { isAuthenticationError, type ApiClient } from '../../api/client'
import type { AdministrationUser, PasswordResetRequest } from '../../api/contracts'
import { AdministrativeTable } from '@/components/ui/administrative-table'
import { FeedbackMessage } from '../../ui/Feedback'
import { Pagination } from '../../ui/Pagination'
import { safeErrorMessage } from '../../ui/safeErrorMessage'
import { useAccessibleDialog } from '../../ui/useAccessibleDialog'
import { useTableQuery } from '../../ui/useTableQuery'
import { TemporaryPasswordReset } from './TemporaryPasswordReset'

export function PasswordResetRequestsPanel({
  api,
  canEditAccount = false,
  onSessionExpired,
}: {
  api: ApiClient
  canEditAccount?: boolean
  onSessionExpired: () => void
}) {
  const id = useId()
  const dialog = useRef<HTMLElement>(null)
  const revision = useRef(0)
  const detailRevision = useRef(0)
  const [requests, setRequests] = useState<readonly PasswordResetRequest[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [user, setUser] = useState<AdministrationUser>()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string>()
  const table = useTableQuery(
    requests,
    [
      { key: 'name', label: 'Nome', value: (item) => item.displayName },
      { key: 'login', label: 'Login', value: (item) => item.login },
      {
        key: 'requested',
        label: 'Solicitada em',
        value: (item) => {
          const date = new Date(item.requestedAt)
          return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0'),
          ].join('-')
        },
        sortValue: (item) => item.requestedAt,
        kind: 'date',
      },
      { key: 'actions', label: 'Ação' },
    ],
    5,
    'requested',
    'desc',
  )
  useAccessibleDialog({
    dialogRef: dialog,
    isOpen: Boolean(user),
    canDismiss: !busy,
    onRequestClose: () => {
      setUser(undefined)
      setError(undefined)
    },
  })

  const load = useCallback(async () => {
    const current = ++revision.current
    setLoading(true)
    setError(undefined)
    try {
      const result = await api.listPasswordResetRequests()
      if (current !== revision.current) return
      setRequests(result)
      setLoaded(true)
    } catch (failure) {
      if (current !== revision.current) return
      setRequests([])
      setUser(undefined)
      setLoaded(false)
      if (isAuthenticationError(failure)) onSessionExpired()
      else setError(safeErrorMessage(failure))
    } finally {
      if (current === revision.current) setLoading(false)
    }
  }, [api, onSessionExpired])

  useEffect(() => {
    let active = true
    const requestRevision = revision
    const pendingDetail = detailRevision
    queueMicrotask(() => {
      if (active) void load()
    })
    return () => {
      active = false
      requestRevision.current++
      pendingDetail.current++
    }
  }, [load])

  async function open(userId: string) {
    const current = ++detailRevision.current
    setError(undefined)
    setNotice(undefined)
    setBusy(true)
    try {
      const found = await api.getAdministrationUser(userId)
      if (current !== detailRevision.current) return
      setName(found.displayName)
      setUser(found)
    } catch (failure) {
      if (current !== detailRevision.current) return
      if (isAuthenticationError(failure)) onSessionExpired()
      else setError(safeErrorMessage(failure))
    } finally {
      if (current === detailRevision.current) setBusy(false)
    }
  }

  async function edit() {
    if (!canEditAccount || !user || busy || !name.trim()) return
    setBusy(true)
    setError(undefined)
    try {
      setUser(
        await api.updateAdministrationUser(user.id, {
          displayName: name.trim(),
          status: user.status,
        }),
      )
      setNotice('Dados da conta atualizados.')
      await load()
    } catch (failure) {
      if (isAuthenticationError(failure)) onSessionExpired()
      else setError(safeErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="stack-form password-reset-requests" aria-labelledby={`${id}-title`}>
      <div className="section-heading">
        <h4 id={`${id}-title`}>
          <KeyRound aria-hidden="true" size={18} />
          Solicitações de redefinição de senha {loaded ? `(${requests.length})` : ''}
        </h4>
        <button
          type="button"
          className="button"
          disabled={loading || busy}
          onClick={() => {
            setUser(undefined)
            setNotice(undefined)
            void load()
          }}
        >
          <RefreshCw aria-hidden="true" size={18} />
          Atualizar solicitações
        </button>
      </div>
      {error && !user ? (
        <FeedbackMessage kind="error" onDismiss={() => setError(undefined)}>
          {error}
        </FeedbackMessage>
      ) : null}
      {loading ? (
        <p role="status">Carregando solicitações…</p>
      ) : loaded && requests.length === 0 ? (
        <p>Nenhuma solicitação pendente.</p>
      ) : null}
      {loaded && requests.length > 0 ? (
        <div className="administration-users">
          <AdministrativeTable>
            <caption className="visually-hidden">Solicitações de redefinição de senha</caption>
            <thead>
              <tr className="table-query-title-row">{table.headings()}</tr>
              <tr className="table-query-filter-row">{table.filterCells()}</tr>
            </thead>
            <tbody>
              {table.emptyRow()}
              {table.items.map((item) => (
                <tr key={item.userId}>
                  <td data-label="Nome">{item.displayName}</td>
                  <td data-label="Login">{item.login}</td>
                  <td data-label="Solicitada em" className="password-reset-requests__date">
                    {new Date(item.requestedAt).toLocaleString('pt-BR')}
                  </td>
                  <td data-label="Ação" className="password-reset-requests__action">
                    <button
                      type="button"
                      className="button button--primary"
                      disabled={busy}
                      onClick={() => void open(item.userId)}
                    >
                      <KeyRound aria-hidden="true" size={18} />
                      Atender solicitação
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </AdministrativeTable>
          <Pagination {...table} itemCountOnPage={table.items.length} itemLabel="solicitações" />
        </div>
      ) : null}
      {user ? (
        <div className="account-dialog-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-dialog-title`}
            className="card stack-form account-dialog password-request-dialog"
            ref={dialog}
            tabIndex={-1}
          >
            <div className="section-heading">
              <h3 id={`${id}-dialog-title`}>
                <KeyRound aria-hidden="true" size={20} />
                Atender solicitação de senha
              </h3>
              <button
                className="button button--icon"
                type="button"
                aria-label="Fechar"
                disabled={busy}
                onClick={() => {
                  setUser(undefined)
                  setError(undefined)
                }}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            <div className="password-request-dialog__identity">
              <UserRound aria-hidden="true" size={20} />
              <div>
                <strong>{user.displayName}</strong>
                <p className="muted">{user.login}</p>
              </div>
            </div>
            {error ? (
              <FeedbackMessage kind="error" onDismiss={() => setError(undefined)}>
                {error}
              </FeedbackMessage>
            ) : null}
            {notice ? (
              <FeedbackMessage kind="status" onDismiss={() => setNotice(undefined)}>
                {notice}
              </FeedbackMessage>
            ) : null}
            {canEditAccount ? (
              <div className="password-request-dialog__edit">
                <div className="field">
                  <label htmlFor={`${id}-name`}>Nome da conta</label>
                  <input
                    id={`${id}-name`}
                    value={name}
                    maxLength={200}
                    disabled={busy}
                    onChange={(event) => setName(event.currentTarget.value)}
                  />
                </div>
                <div className="action-row">
                  <button
                    className="button button--success"
                    type="button"
                    disabled={busy || !name.trim()}
                    onClick={() => void edit()}
                  >
                    <Save aria-hidden="true" size={18} />
                    Salvar nome
                  </button>
                </div>
              </div>
            ) : null}
            <TemporaryPasswordReset
              key={user.id}
              api={api}
              userId={user.id}
              disabled={busy}
              onBusyChange={setBusy}
              onSessionExpired={onSessionExpired}
              onReset={(updated) => {
                setUser(updated)
                void load()
              }}
            />
          </section>
        </div>
      ) : null}
    </section>
  )
}
