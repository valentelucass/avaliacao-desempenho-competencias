import { useId, useRef, useState } from 'react'
import type { ApiClient } from '../../api/client'
import { isAuthenticationError } from '../../api/client'
import type { AdministrationUser } from '../../api/contracts'
import { FeedbackMessage } from '../../ui/Feedback'
import { safeErrorMessage } from '../../ui/safeErrorMessage'

export function TemporaryPasswordReset({
  api,
  userId,
  onReset,
  onSessionExpired,
  onBusyChange,
  disabled = false,
}: {
  api: ApiClient
  userId: string
  onReset: (user: AdministrationUser) => void
  onSessionExpired: () => void
  onBusyChange?: (busy: boolean) => void
  disabled?: boolean
}) {
  const id = useId()
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [temporary, setTemporary] = useState('')
  const [error, setError] = useState<string>()

  async function reset() {
    if (pending.current || disabled) return
    pending.current = true
    setBusy(true)
    onBusyChange?.(true)
    setTemporary('')
    setError(undefined)
    try {
      const result = await api.generateTemporaryPassword(userId)
      setTemporary(result.temporaryPassword)
      onReset(result.user)
    } catch (failure) {
      if (isAuthenticationError(failure)) onSessionExpired()
      else setError(safeErrorMessage(failure))
    } finally {
      pending.current = false
      setBusy(false)
      onBusyChange?.(false)
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
        Confirme a identidade da pessoa antes de redefinir. A nova senha temporária encerra as
        sessões atuais e exige uma senha pessoal no próximo acesso.
      </p>
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
          className="button button--success"
          type="button"
          onClick={() => void reset()}
          disabled={busy || disabled}
        >
          {busy ? 'Redefinindo…' : 'Gerar senha temporária e redefinir'}
        </button>
      )}
    </section>
  )
}
