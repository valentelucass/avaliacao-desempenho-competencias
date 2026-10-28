import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import type { ApiClient } from '../../api/client'
import { ApiError, isAuthenticationError } from '../../api/client'
import type { AdministrationUser } from '../../api/contracts'
import { FeedbackMessage } from '../../ui/Feedback'
import { KeyRound } from 'lucide-react'
import { safeErrorMessage } from '../../ui/safeErrorMessage'

export function TemporaryPasswordReset(props: Parameters<typeof TemporaryPasswordResetSession>[0]) {
  return <TemporaryPasswordResetSession key={props.userId} {...props} />
}

function TemporaryPasswordResetSession({
  api,
  userId,
  onReset,
  onSessionExpired,
  onBusyChange,
  disabled = false,
  temporaryBlockedUntil,
}: {
  api: ApiClient
  userId: string
  onReset: (user: AdministrationUser) => void
  onSessionExpired: () => void
  onBusyChange?: (busy: boolean) => void
  disabled?: boolean
  temporaryBlockedUntil?: string | null
}) {
  const id = useId()
  const pending = useRef(false)
  const generation = useRef(0)
  const notifyIdle = useEffectEvent(() => onBusyChange?.(false))
  const [busy, setBusy] = useState(false)
  const [temporary, setTemporary] = useState('')
  const [error, setError] = useState<string>()
  const [retryFromResponse, setRetryFromResponse] = useState<string>()
  const propDeadline = Date.parse(temporaryBlockedUntil ?? '')
  const retryAt =
    Number.isFinite(propDeadline) && propDeadline > Date.parse(retryFromResponse ?? '')
      ? temporaryBlockedUntil
      : (retryFromResponse ?? temporaryBlockedUntil)
  const [now, setNow] = useState(() => Date.now())
  const blocked = Boolean(retryAt && new Date(retryAt).getTime() > now)

  useEffect(() => {
    if (!blocked) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [blocked])

  useEffect(() => {
    const currentGeneration = generation
    const clear = () => {
      generation.current++
      setTemporary('')
      setBusy(false)
      pending.current = false
      notifyIdle()
    }
    window.addEventListener('pagehide', clear)
    return () => {
      currentGeneration.current++
      window.removeEventListener('pagehide', clear)
    }
  }, [userId])

  async function reset() {
    if (pending.current || disabled || blocked) return
    pending.current = true
    setBusy(true)
    onBusyChange?.(true)
    setTemporary('')
    setError(undefined)
    const current = ++generation.current
    try {
      const result = await api.generateTemporaryPassword(userId)
      if (current !== generation.current) return
      setTemporary(result.temporaryPassword)
      onReset(result.user)
    } catch (failure) {
      if (current !== generation.current) return
      if (isAuthenticationError(failure)) onSessionExpired()
      else if (
        failure instanceof ApiError &&
        failure.code === 'PASSWORD_RESET_TEMPORARILY_BLOCKED'
      ) {
        setRetryFromResponse(failure.retryAt)
        setNow(Date.now())
        setError(
          failure.retryAt && Date.parse(failure.retryAt) > Date.now()
            ? undefined
            : safeErrorMessage(failure),
        )
      } else setError(safeErrorMessage(failure))
    } finally {
      if (current === generation.current) {
        pending.current = false
        setBusy(false)
        onBusyChange?.(false)
      }
    }
  }

  return (
    <section
      className="stack-form account-password-reset"
      aria-labelledby={`${id}-title`}
      aria-busy={busy}
    >
      <h4 id={`${id}-title`}>Redefinir senha</h4>
      <p className="muted">
        A senha temporária encerra as sessões atuais e exige uma nova senha pessoal no próximo
        acesso. Confirme a identidade da pessoa antes de continuar.
      </p>
      {blocked ? (
        <div className="feedback feedback--warning" role="status">
          {safeErrorMessage(
            new ApiError({
              status: 409,
              code: 'PASSWORD_RESET_TEMPORARILY_BLOCKED',
              retryAt: retryAt ?? undefined,
            }),
          )}
        </div>
      ) : null}
      {error ? (
        <FeedbackMessage kind="error" onDismiss={() => setError(undefined)}>
          {error}
        </FeedbackMessage>
      ) : null}
      {temporary ? (
        <div className="field">
          <label htmlFor={id}>Senha temporária gerada</label>
          <input
            id={id}
            type="text"
            value={temporary}
            readOnly
            autoComplete="off"
            spellCheck={false}
            onFocus={(event) => event.currentTarget.select()}
            aria-describedby={`${id}-hint`}
          />
          <p id={`${id}-hint`} className="field-hint">
            Copie e entregue à pessoa por um canal seguro. Esta senha só aparece nesta janela; ao
            fechá-la, não poderá ser consultada novamente. O sistema não envia e-mail.
          </p>
          <p role="status">Senha redefinida. Troca obrigatória no próximo acesso.</p>
        </div>
      ) : (
        <button
          className="button button--primary"
          type="button"
          onClick={() => void reset()}
          disabled={busy || disabled || blocked}
        >
          <KeyRound aria-hidden="true" size={18} />
          {busy ? 'Redefinindo…' : 'Gerar senha temporária e redefinir'}
        </button>
      )}
    </section>
  )
}
