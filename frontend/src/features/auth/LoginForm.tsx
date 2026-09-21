import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { ShieldCheck } from 'lucide-react'
import { isAuthenticationError } from '../../api/client'
import type { ApiClient } from '../../api/client'
import type { CurrentUser } from '../../api/contracts'
import { FeedbackMessage } from '../../ui/Feedback'
import { safeErrorMessage } from '../../ui/safeErrorMessage'
import { AuthPageFrame } from './AuthPageFrame'

type LoginFormProps = {
  api: ApiClient
  isRestoringSession: boolean
  onAuthenticated: (user: CurrentUser, username: string) => void
  onResumeSession: () => Promise<void>
  onToggleTheme: () => void
  notice?: string
  startupError?: string
  theme: 'light' | 'dark'
}

export function LoginForm({
  api,
  isRestoringSession,
  onAuthenticated,
  onResumeSession,
  onToggleTheme,
  notice,
  startupError,
  theme,
}: LoginFormProps) {
  const loginId = useId()
  const passwordId = useId()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [recoveryLogin, setRecoveryLogin] = useState('')
  const [recoveryNotice, setRecoveryNotice] = useState<string>()
  const recoveryId = useId()

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
          ? 'Não foi possível autenticar. Revise o login e a senha e tente novamente.'
          : safeErrorMessage(requestError),
      )
    } finally {
      setPassword('')
      setIsSubmitting(false)
    }
  }

  return (
    <AuthPageFrame
      contentClassName="auth-layout--with-about"
      labelledBy="login-title"
      onToggleTheme={onToggleTheme}
      theme={theme}
    >
      <section className="card login-card">
        <h1 id="login-title">Acesso à plataforma</h1>
        <p className="summary">Insira suas credenciais corporativas para entrar na sua conta.</p>

        <form className="stack-form" onSubmit={handleSubmit} noValidate>
          {notice ? <FeedbackMessage kind="status">{notice}</FeedbackMessage> : null}
          {startupError ? <FeedbackMessage kind="error">{startupError}</FeedbackMessage> : null}
          {error ? (
            <FeedbackMessage kind="error" onDismiss={() => setError(undefined)}>
              {error}
            </FeedbackMessage>
          ) : null}

          <div className="field">
            <label htmlFor={loginId}>E-mail ou login</label>
            <input
              id={loginId}
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
            <input
              id={passwordId}
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isSubmitting}
              required
            />
          </div>

          <button
            className="button button--primary"
            type="submit"
            disabled={isSubmitting || isRestoringSession}
          >
            {isSubmitting ? 'Entrando…' : 'Acessar plataforma'}
          </button>
          <button
            className="button"
            type="button"
            onClick={() => void onResumeSession()}
            disabled={isSubmitting || isRestoringSession}
          >
            {isRestoringSession ? 'Retomando sessão…' : 'Retomar sessão existente'}
          </button>
        </form>
        <button
          className="button"
          type="button"
          disabled={isSubmitting || isRestoringSession}
          aria-expanded={recoveryOpen}
          aria-controls={recoveryId}
          onClick={() => {
            setRecoveryOpen(!recoveryOpen)
            setError(undefined)
            setPassword('')
          }}
        >
          Solicitar redefinição de senha
        </button>
        {recoveryOpen ? (
          <form
            id={recoveryId}
            className="stack-form"
            onSubmit={requestReset}
            noValidate
            aria-busy={isSubmitting}
          >
            <p className="muted">
              Informe o e-mail ou login da sua conta. O responsável receberá a solicitação na
              administração do sistema.
            </p>
            <div className="field">
              <label htmlFor={`${recoveryId}-login`}>E-mail ou login para recuperação</label>
              <input
                id={`${recoveryId}-login`}
                value={recoveryLogin}
                autoComplete="username"
                maxLength={128}
                disabled={isSubmitting}
                onChange={(event) => setRecoveryLogin(event.currentTarget.value)}
              />
            </div>
            <button className="button button--primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Solicitando…' : 'Enviar solicitação'}
            </button>
            {recoveryNotice ? <p role="status">{recoveryNotice}</p> : null}
          </form>
        ) : null}
      </section>

      <aside className="auth-about-panel" aria-label="Sobre esta página">
        <span aria-hidden="true" className="auth-about-panel__icon">
          <ShieldCheck size={21} strokeWidth={1.8} />
        </span>
        <p className="eyebrow">Área interna</p>
        <h2>Avaliações de desempenho</h2>
        <p className="muted">
          Esta página dá acesso ao ambiente corporativo para registrar avaliações, acompanhar ciclos
          autorizados e consultar indicadores conforme o seu perfil.
        </p>
        <p className="auth-about-panel__note">
          As permissões são verificadas pela plataforma após o login.
        </p>
      </aside>
    </AuthPageFrame>
  )
}
