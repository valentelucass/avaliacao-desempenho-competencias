import { Card } from '@astryxdesign/core/Card'
import { ActionButton } from '../../ui/ActionButton'
import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { isAuthenticationError } from '../../api/client'
import type { ApiClient } from '../../api/client'
import type { CurrentUser } from '../../api/contracts'
import { FeedbackMessage } from '../../ui/Feedback'
import { safeErrorMessage } from '../../ui/safeErrorMessage'
import { FilingDesk } from './FilingDesk'

type LoginFormProps = {
  api: ApiClient
  isRestoringSession: boolean
  onAuthenticated: (user: CurrentUser, username: string) => void
  onToggleTheme: () => void
  notice?: string
  startupError?: string
  theme: 'light' | 'dark'
}

export function LoginForm({
  api,
  isRestoringSession,
  onAuthenticated,
  onToggleTheme,
  notice,
  startupError,
  theme,
}: LoginFormProps) {
  const loginId = useId()
  const passwordId = useId()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [error, setError] = useState<string>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [recoveryLogin, setRecoveryLogin] = useState('')
  const [recoveryNotice, setRecoveryNotice] = useState<string>()
  const recoveryId = useId()
  const errorId = useId()
  const loginInput = useRef<HTMLInputElement>(null)
  const recoveryInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (recoveryOpen) recoveryInput.current?.focus()
    else loginInput.current?.focus()
  }, [recoveryOpen])

  function closeRecovery() {
    setRecoveryOpen(false)
    setRecoveryLogin('')
    setError(undefined)
    setRecoveryNotice(undefined)
  }

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return
    setError(undefined)
    setRecoveryNotice(undefined)
    if (!recoveryLogin.trim()) {
      setError('Informe o e-mail ou login usado para entrar.')
      return
    }
    setIsSubmitting(true)
    try {
      await api.requestPasswordReset(recoveryLogin.trim())
      setRecoveryNotice(
        'Se a conta estiver disponível para recuperação, a solicitação será encaminhada à administração. Aguarde o contato do responsável.',
      )
      setRecoveryLogin('')
    } catch (failure) {
      setError(safeErrorMessage(failure))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting || isRestoringSession) return
    setError(undefined)

    if (!login.trim() || !password) {
      setError('Informe seu login e sua senha para continuar.')
      return
    }

    setIsSubmitting(true)
    try {
      await api.signIn(login.trim(), password)
      const user = await api.currentUser()
      if (!user) {
        setError('Não foi possível confirmar a sessão. Entre novamente para continuar.')
        return
      }
      onAuthenticated(user, login.trim())
    } catch (requestError) {
      setError(
        isAuthenticationError(requestError)
          ? 'Não foi possível autenticar. Revise o login e a senha. Após várias tentativas incorretas, aguarde 15 minutos antes de tentar novamente ou peça ajuda à administração.'
          : safeErrorMessage(requestError),
      )
    } finally {
      setPassword('')
      setIsPasswordVisible(false)
      setIsSubmitting(false)
    }
  }

  return (
    <FilingDesk onToggleTheme={onToggleTheme} theme={theme}>
      <Card padding={4} className="card login-card">
        <span className="filing-caption">Avaliações</span>
        {recoveryOpen ? (
          <div
            id={recoveryId}
            className="login-card__recovery"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !isSubmitting) {
                event.preventDefault()
                closeRecovery()
              }
            }}
          >
            <button
              className="login-card__back"
              type="button"
              disabled={isSubmitting}
              onClick={closeRecovery}
            >
              Voltar ao acesso
            </button>
            <h1 id="login-title">Solicitar redefinição</h1>
            <p className="summary">
              Informe o e-mail ou login da sua conta. A solicitação será encaminhada à administração
              do sistema.
            </p>
            <form
              className="stack-form login-card__recovery-form"
              onSubmit={requestReset}
              noValidate
              aria-busy={isSubmitting}
            >
              {error ? (
                <FeedbackMessage id={errorId} kind="error" onDismiss={() => setError(undefined)}>
                  {error}
                </FeedbackMessage>
              ) : null}
              <div className="field">
                <label htmlFor={`${recoveryId}-login`}>E-mail ou login para recuperação</label>
                <input
                  id={`${recoveryId}-login`}
                  ref={recoveryInput}
                  aria-describedby={error ? errorId : undefined}
                  aria-invalid={Boolean(error)}
                  value={recoveryLogin}
                  autoComplete="username"
                  maxLength={128}
                  disabled={isSubmitting}
                  onChange={(event) => setRecoveryLogin(event.currentTarget.value)}
                />
              </div>
              <ActionButton
                size="sm"
                variant="primary"
                label={isSubmitting ? 'Solicitando…' : 'Enviar solicitação'}
                type="submit"
                disabled={isSubmitting}
              />
              {recoveryNotice ? <p role="status">{recoveryNotice}</p> : null}
            </form>
          </div>
        ) : (
          <>
            <h1 id="login-title">Acesso à plataforma</h1>
            <p className="summary">
              Insira suas credenciais corporativas para entrar na sua conta.
            </p>

            <form className="stack-form" onSubmit={handleSubmit} noValidate>
              {notice ? <FeedbackMessage kind="status">{notice}</FeedbackMessage> : null}
              {startupError ? <FeedbackMessage kind="error">{startupError}</FeedbackMessage> : null}
              {error ? (
                <FeedbackMessage id={errorId} kind="error" onDismiss={() => setError(undefined)}>
                  {error}
                </FeedbackMessage>
              ) : null}

              <div className="field">
                <label htmlFor={loginId}>E-mail ou login</label>
                <input
                  id={loginId}
                  ref={loginInput}
                  aria-describedby={error ? errorId : undefined}
                  name="login"
                  autoComplete="username"
                  value={login}
                  onChange={(event) => setLogin(event.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor={passwordId}>Senha</label>
                <div className="password-input">
                  <input
                    id={passwordId}
                    aria-describedby={error ? errorId : undefined}
                    name="password"
                    type={isPasswordVisible ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={isSubmitting}
                    required
                  />
                  <button
                    aria-label={isPasswordVisible ? 'Ocultar senha' : 'Mostrar senha'}
                    className="password-input__toggle"
                    disabled={isSubmitting}
                    onClick={() => setIsPasswordVisible((visible) => !visible)}
                    type="button"
                  >
                    {isPasswordVisible ? (
                      <Eye aria-hidden="true" size={18} />
                    ) : (
                      <EyeOff aria-hidden="true" size={18} />
                    )}
                  </button>
                </div>
              </div>

              <ActionButton
                size="sm"
                variant="primary"
                label={isSubmitting ? 'Entrando…' : 'Acessar plataforma'}
                endContent={<ArrowRight aria-hidden="true" size={17} />}
                type="submit"
                disabled={isSubmitting || isRestoringSession}
              />
            </form>
            <button
              className="login-card__recovery-trigger"
              type="button"
              disabled={isSubmitting || isRestoringSession}
              aria-expanded={recoveryOpen}
              aria-controls={recoveryId}
              onClick={() => {
                setRecoveryOpen(true)
                setError(undefined)
                setPassword('')
                setIsPasswordVisible(false)
              }}
            >
              Solicitar redefinição de senha
            </button>
          </>
        )}
        <p className="login-card__security-note">
          <ShieldCheck aria-hidden="true" size={16} strokeWidth={2} />
          <span>Acesso restrito à plataforma.</span>
        </p>
      </Card>
    </FilingDesk>
  )
}
