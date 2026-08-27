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
          {error ? <FeedbackMessage kind="error">{error}</FeedbackMessage> : null}

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
