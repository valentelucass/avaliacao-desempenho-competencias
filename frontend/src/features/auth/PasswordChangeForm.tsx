import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { isAuthenticationError } from '../../api/client'
import type { ApiClient } from '../../api/client'
import { FeedbackMessage } from '../../ui/Feedback'
import { safeErrorMessage } from '../../ui/safeErrorMessage'
import { AuthPageFrame } from './AuthPageFrame'

type PasswordChangeFormProps = {
  api: ApiClient
  onChanged: () => void
  onSessionExpired: () => void
  onToggleTheme: () => void
  theme: 'light' | 'dark'
  username?: string
}

export function PasswordChangeForm({
  api,
  onChanged,
  onSessionExpired,
  onToggleTheme,
  theme,
  username,
}: PasswordChangeFormProps) {
  const currentPasswordId = useId()
  const newPasswordId = useId()
  const confirmationId = useId()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)

    if (!currentPassword || !newPassword || !confirmation) {
      setError('Informe a senha atual, a nova senha e a confirmação para continuar.')
      return
    }

    if (newPassword !== confirmation) {
      setError('A confirmação da nova senha não corresponde.')
      return
    }

    setIsSubmitting(true)
    try {
      await api.changePassword(currentPassword, newPassword)
      onChanged()
    } catch (requestError) {
      if (isAuthenticationError(requestError)) {
        onSessionExpired()
        return
      }
      setError(safeErrorMessage(requestError))
    } finally {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmation('')
      setIsSubmitting(false)
    }
  }

  return (
    <AuthPageFrame labelledBy="password-change-title" onToggleTheme={onToggleTheme} theme={theme}>
      <section className="card login-card">
        <h1 id="password-change-title">Troca de senha obrigatória</h1>
        <p className="summary">
          Antes de acessar o sistema, defina uma nova senha. Ao concluir, você precisará entrar
          novamente.
        </p>

        <form className="stack-form" onSubmit={handleSubmit} noValidate aria-busy={isSubmitting}>
          <input
            aria-hidden="true"
            autoComplete="username"
            hidden
            name="username"
            readOnly
            tabIndex={-1}
            type="text"
            value={username ?? ''}
          />
          {error ? <FeedbackMessage kind="error">{error}</FeedbackMessage> : null}

          <div className="field">
            <label htmlFor={currentPasswordId}>Senha atual</label>
            <input
              id={currentPasswordId}
              name="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={isSubmitting}
              required
            />
          </div>

          <div className="field">
            <label htmlFor={newPasswordId}>Nova senha</label>
            <input
              id={newPasswordId}
              name="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={isSubmitting}
              required
            />
          </div>

          <div className="field">
            <label htmlFor={confirmationId}>Confirmar nova senha</label>
            <input
              id={confirmationId}
              name="confirm-new-password"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={isSubmitting}
              required
            />
          </div>

          <button className="button button--success" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Alterando…' : 'Alterar senha'}
          </button>
        </form>
      </section>
    </AuthPageFrame>
  )
}
