import { Card } from '@astryxdesign/core/Card'
import { ActionButton } from '../../ui/ActionButton'
import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { isAuthenticationError } from '../../api/client'
import type { ApiClient } from '../../api/client'
import { FeedbackMessage } from '../../ui/Feedback'
import { safeErrorMessage } from '../../ui/safeErrorMessage'
import { useAccessibleDialog } from '../../ui/useAccessibleDialog'
import { AuthPageFrame } from './AuthPageFrame'

type PasswordChangeFormProps = {
  api: ApiClient
  onChanged: () => void
  onSessionExpired: () => void
  onToggleTheme: () => void
  theme: 'light' | 'dark'
  username?: string
  onCancel?: () => void
}

export function PasswordChangeForm({
  api,
  onChanged,
  onSessionExpired,
  onToggleTheme,
  theme,
  username,
  onCancel,
}: PasswordChangeFormProps) {
  const currentPasswordId = useId()
  const newPasswordId = useId()
  const confirmationId = useId()
  const errorId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const isDialog = onCancel !== undefined
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  useAccessibleDialog({
    dialogRef,
    isOpen: isDialog,
    onRequestClose: () => onCancel?.(),
    canDismiss: !isSubmitting,
  })

  useEffect(() => {
    if (!isDialog) heading.current?.focus()
  }, [isDialog])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return
    setError(undefined)

    if (!currentPassword || !newPassword || !confirmation) {
      setError('Informe a senha atual, a nova senha e a confirmação para continuar.')
      return
    }

    if (newPassword !== confirmation) {
      setError('A confirmação da nova senha não corresponde.')
      return
    }

    if (
      !newPassword.trim() ||
      Array.from(newPassword).length < 12 ||
      new TextEncoder().encode(newPassword).length > 72
    ) {
      setError(
        'Use ao menos 12 caracteres e até 72 bytes (acentos e emojis ocupam mais de um byte).',
      )
      return
    }
    if (currentPassword === newPassword) {
      setError('A nova senha deve ser diferente da senha temporária ou atual.')
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

  const Title = isDialog ? 'h2' : 'h1'
  const submit = (
    <ActionButton
      size="sm"
      variant="primary"
      label={isSubmitting ? 'Alterando…' : 'Alterar senha'}
      type="submit"
      disabled={isSubmitting}
    />
  )
  const content = (
    <>
      <Title id="password-change-title" ref={heading} data-dialog-initial-focus tabIndex={-1}>
        {isDialog ? 'Alterar minha senha' : 'Troca de senha obrigatória'}
      </Title>
      <p id="password-change-summary" className="summary">
        {onCancel
          ? 'Defina uma nova senha pessoal.'
          : 'Antes de acessar o sistema, defina uma nova senha.'}{' '}
        Ao concluir, você precisará entrar novamente.
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
        {error ? (
          <FeedbackMessage id={errorId} kind="error" onDismiss={() => setError(undefined)}>
            {error}
          </FeedbackMessage>
        ) : null}

        <div className="field">
          <label htmlFor={currentPasswordId}>Senha atual</label>
          <input
            id={currentPasswordId}
            aria-describedby={error ? errorId : undefined}
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
            aria-describedby={error ? errorId : undefined}
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
            aria-describedby={error ? errorId : undefined}
            name="confirm-new-password"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={isSubmitting}
            required
          />
        </div>

        {onCancel ? (
          <div className="password-change-dialog__actions">
            <ActionButton
              size="sm"
              variant="secondary"
              label="Cancelar"
              type="button"
              disabled={isSubmitting}
              onClick={onCancel}
            />
            {submit}
          </div>
        ) : (
          submit
        )}
      </form>
    </>
  )

  if (isDialog) {
    return (
      <div
        className="account-dialog-backdrop"
        onClick={(event) => {
          if (event.target === event.currentTarget && !isSubmitting) onCancel?.()
        }}
      >
        <section
          ref={dialogRef}
          className="card account-dialog password-change-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="password-change-title"
          aria-describedby="password-change-summary"
          tabIndex={-1}
        >
          {content}
        </section>
      </div>
    )
  }

  return (
    <AuthPageFrame labelledBy="password-change-title" onToggleTheme={onToggleTheme} theme={theme}>
      <Card padding={4} className="card login-card">
        {content}
      </Card>
    </AuthPageFrame>
  )
}
