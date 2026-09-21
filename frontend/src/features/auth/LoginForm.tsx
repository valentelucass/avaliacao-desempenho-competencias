import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'
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
        {recoveryOpen ? (
          <div id={recoveryId} className="login-card__recovery">
            <button
              className="login-card__back"
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setRecoveryOpen(false)
                setError(undefined)
                setRecoveryNotice(undefined)
              }}
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
                <FeedbackMessage kind="error" onDismiss={() => setError(undefined)}>
                  {error}
                </FeedbackMessage>
              ) : null}
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
                <div className="password-input">
                  <input
                    id={passwordId}
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
                      <EyeOff aria-hidden="true" size={18} />
                    ) : (
                      <Eye aria-hidden="true" size={18} />
                    )}
                  </button>
                </div>
              </div>

              <button
                className="button button--primary"
                type="submit"
                disabled={isSubmitting || isRestoringSession}
              >
                {isSubmitting ? 'Entrando…' : 'Acessar plataforma'}
              </button>
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
      </section>

      <aside className="auth-about-panel" aria-label="Sobre esta página">
        <div className="auth-about-panel__heading">
          <span aria-hidden="true" className="auth-about-panel__icon">
            <ShieldCheck size={21} strokeWidth={1.8} />
          </span>
          <div>
            <p className="eyebrow">Área interna</p>
            <h2>Avaliações de desempenho</h2>
          </div>
        </div>
        <p className="muted">
          Registre avaliações, acompanhe ciclos autorizados e consulte indicadores conforme o seu
          perfil.
        </p>
        <dl className="auth-about-panel__highlights">
          <div>
            <dt>Acesso por perfil</dt>
            <dd>As opções disponíveis respeitam as permissões da sua conta.</dd>
          </div>
          <div>
            <dt>Ambiente corporativo</dt>
            <dd>Informações e rotinas reunidas em um único lugar.</dd>
          </div>
        </dl>
        <p className="auth-about-panel__note">
          A disponibilidade de cada recurso é verificada após o login.
        </p>
      </aside>
    </AuthPageFrame>
  )
}
