import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  BarChart3,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react'
import type { ApiClient } from './api/client'
import { defaultApiClient } from './api/client'
import type { CurrentUser } from './api/contracts'
import { LoginForm } from './features/auth/LoginForm'
import { PasswordChangeForm } from './features/auth/PasswordChangeForm'
import {
  AdministrationPanel,
  type AdministrationSection,
} from './features/administration/AdministrationPanel'
import { AssessmentsPanel } from './features/assessments/AssessmentsPanel'
import { IndicatorsPanel } from './features/indicators/IndicatorsPanel'
import { DashboardPanel } from './features/dashboard/DashboardPanel'
import { BrandLogo } from './ui/BrandLogo'
import { safeErrorMessage } from './ui/safeErrorMessage'
import './App.css'

type AppProps = {
  api?: ApiClient
}

type Workspace = 'dashboard' | 'administration' | 'assessments' | 'indicators'
type AssessmentJourney = 'EQUIPE' | 'AUTOAVALIACAO'
type Theme = 'light' | 'dark'

const administrationPermissions = [
  'USUARIOS.LER',
  'USUARIOS.CRIAR',
  'USUARIOS.ALTERAR',
  'ACESSOS.GERIR',
  'ACESSOS.NEGOCIO.GERIR',
  'CADASTROS.GERIR',
  'QUESTIONARIOS.GERIR',
  'CICLOS.GERIR',
  'VINCULOS_GESTOR_COLABORADOR.GERIR',
  'VINCULOS_USUARIO_COLABORADOR.GERIR',
] as const

function App({ api = defaultApiClient }: AppProps) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [passwordChangeUsername, setPasswordChangeUsername] = useState<string>()
  const [startupError, setStartupError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isRestoringSession, setIsRestoringSession] = useState(false)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const workspaceRef = useRef<HTMLElement>(null)
  const sessionRecoveryRef = useRef<Promise<CurrentUser | null> | null>(null)
  const location = useLocation()

  useEffect(() => {
    if (!isSidebarOpen) {
      return undefined
    }

    const sidebar = sidebarRef.current
    if (!sidebar) {
      return undefined
    }

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusableElements = () =>
      Array.from(sidebar.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => !element.hasAttribute('aria-hidden'),
      )
    const first = focusableElements()[0]
    first?.focus()

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeSidebar()
        return
      }
      if (event.key !== 'Tab') {
        return
      }

      const elements = focusableElements()
      const firstElement = elements[0]
      const lastElement = elements.at(-1)
      if (!firstElement || !lastElement) {
        return
      }
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
  }, [isSidebarOpen])

  useEffect(() => {
    if (!isSidebarOpen) {
      return undefined
    }

    const previousDocumentOverflow = document.documentElement.style.overflow
    const previousBodyOverflow = document.body.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'

    return () => {
      document.documentElement.style.overflow = previousDocumentOverflow
      document.body.style.overflow = previousBodyOverflow
    }
  }, [isSidebarOpen])

  useEffect(() => {
    workspaceRef.current?.focus({ preventScroll: true })
  }, [location.pathname, location.search, user?.id])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      window.localStorage.setItem('adc-theme', theme)
    } catch {
      // A escolha visual permanece funcional mesmo quando o armazenamento local é bloqueado.
    }
  }, [theme])

  const resumeSession = useCallback(
    async (showUnavailableNotice = true, showProgress = true) => {
      if (showProgress) {
        setIsRestoringSession(true)
      }
      setStartupError(undefined)
      setNotice(undefined)

      try {
        // Os cookies de credencial são HttpOnly. A verificação só ocorre por ação
        // explícita do usuário para não gerar respostas 401 esperadas ao abrir o login.
        const restoredUser = await api.refreshSession()
        if (restoredUser) {
          setUser(restoredUser)
          return
        }

        if (showUnavailableNotice) {
          setNotice('Não há uma sessão ativa para retomar. Entre com seu login e senha.')
        }
      } catch (requestError) {
        setStartupError(safeErrorMessage(requestError))
      } finally {
        if (showProgress) {
          setIsRestoringSession(false)
        }
      }
    },
    [api],
  )

  const handleSessionExpired = useCallback(() => {
    if (sessionRecoveryRef.current) {
      return
    }

    sessionRecoveryRef.current = api
      .refreshSession()
      .then((restoredUser) => {
        if (restoredUser) {
          setStartupError(undefined)
          setNotice('Sua sessão foi renovada.')
          setPasswordChangeUsername(
            restoredUser.passwordChangeRequired ? passwordChangeUsername : undefined,
          )
          setUser(restoredUser)
          return restoredUser
        }
        setUser(null)
        setPasswordChangeUsername(undefined)
        setNotice('Sua sessão expirou. Entre novamente para continuar.')
        return null
      })
      .catch(() => {
        setUser(null)
        setPasswordChangeUsername(undefined)
        setNotice('Sua sessão expirou. Entre novamente para continuar.')
        return null
      })
      .finally(() => {
        sessionRecoveryRef.current = null
      })
  }, [api, passwordChangeUsername])

  function handleAuthenticated(authenticatedUser: CurrentUser, username: string) {
    setStartupError(undefined)
    setNotice(undefined)
    setPasswordChangeUsername(authenticatedUser.passwordChangeRequired ? username : undefined)
    setUser(authenticatedUser)
  }

  const handlePasswordChanged = useCallback(() => {
    setStartupError(undefined)
    setUser(null)
    setPasswordChangeUsername(undefined)
    setNotice('Senha alterada. Entre novamente com a nova senha para continuar.')
  }, [])

  async function signOut() {
    setIsSigningOut(true)
    setStartupError(undefined)
    try {
      await api.signOut()
      setUser(null)
      setNotice('Você saiu da sessão com segurança.')
    } catch (requestError) {
      setStartupError(safeErrorMessage(requestError))
    } finally {
      setIsSigningOut(false)
    }
  }

  if (user === null) {
    return (
      <LoginForm
        api={api}
        isRestoringSession={isRestoringSession}
        notice={notice}
        onAuthenticated={handleAuthenticated}
        onResumeSession={resumeSession}
        onToggleTheme={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
        startupError={startupError}
        theme={theme}
      />
    )
  }

  if (user.passwordChangeRequired) {
    return (
      <PasswordChangeForm
        api={api}
        onChanged={handlePasswordChanged}
        onSessionExpired={handleSessionExpired}
        onToggleTheme={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
        theme={theme}
        username={passwordChangeUsername}
      />
    )
  }

  const canViewAssessments = hasAnyPermission(user, [
    'AVALIACOES.AVALIAR_VINCULADOS',
    'AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS',
    'AVALIACOES.VISUALIZAR_TODAS',
    'AUTOAVALIACOES.PREENCHER_PROPRIA',
    'AUTOAVALIACOES.ENVIAR_PROPRIA',
    'AUTOAVALIACOES.VISUALIZAR_PROPRIA',
  ])
  const canCreateSelfAssessment = hasAnyPermission(user, ['AUTOAVALIACOES.PREENCHER_PROPRIA'])
  const canSubmitSelfAssessment = hasAnyPermission(user, ['AUTOAVALIACOES.ENVIAR_PROPRIA'])
  const canCreateManagerAssessment = hasAnyPermission(user, ['AVALIACOES.AVALIAR_VINCULADOS'])
  const canPublishAssessments = hasAnyPermission(user, ['AVALIACOES.PUBLICAR'])
  const canReopenAssessments = hasAnyPermission(user, ['AVALIACOES.REABRIR'])
  const canViewAllAssessments = hasAnyPermission(user, ['AVALIACOES.VISUALIZAR_TODAS'])
  const canViewIndicators = hasAnyPermission(user, ['INDICADORES.VISUALIZAR'])
  const canExportIndicators = hasAnyPermission(user, ['DADOS.EXPORTAR'])
  const canViewAdministration = hasAnyPermission(user, administrationPermissions)
  const availableWorkspaceCount = [
    canViewAdministration,
    canViewAssessments,
    canViewIndicators,
  ].filter(Boolean).length
  const fallbackWorkspace =
    availableWorkspaceCount > 1
      ? 'dashboard'
      : canViewAdministration
        ? 'administration'
        : canViewAssessments
          ? 'assessments'
          : canViewIndicators
            ? 'indicators'
            : 'dashboard'
  const requestedWorkspace = workspaceFromPath(location.pathname)
  const activeWorkspace = isWorkspaceAvailable(requestedWorkspace, {
    canViewAdministration,
    canViewAssessments,
    canViewIndicators,
  })
    ? requestedWorkspace
    : fallbackWorkspace
  const assessmentJourney = journeyFromSearch(location.search)
  const assessmentId = assessmentIdFromPath(location.pathname)
  const administrationSection = administrationSectionFromPath(location.pathname)

  function navigate(
    nextWorkspace: Workspace,
    options?: { journey?: AssessmentJourney; id?: string; section?: AdministrationSection },
  ) {
    const path = workspacePath(nextWorkspace, options)
    window.history.pushState(null, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
    setIsSidebarOpen(false)
  }

  function beginAssessment(journey: AssessmentJourney) {
    navigate('assessments', { journey })
  }

  function closeSidebar() {
    setIsSidebarOpen(false)
    window.setTimeout(() => menuButtonRef.current?.focus(), 0)
  }

  return (
    <div className="application-shell">
      <header className="application-header">
        <div className="application-header__content">
          <div className="brand-lockup">
            <button
              aria-label="Ir para o início"
              className="brand-home-link"
              onClick={() => navigate('dashboard')}
              title="Ir para o início"
              type="button"
            >
              <BrandLogo className="brand-logo" />
            </button>
            <span aria-hidden="true" className="brand-lockup__divider" />
            <div className="application-header__title">
              <p className="eyebrow">Painel interno</p>
              <h1 id="page-title">Avaliação de desempenho</h1>
            </div>
          </div>
          <div className="application-header__actions">
            <button
              aria-label={theme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro'}
              aria-pressed={theme === 'dark'}
              className="icon-button theme-toggle"
              onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
              type="button"
            >
              {theme === 'light' ? (
                <Moon aria-hidden="true" size={17} strokeWidth={2} />
              ) : (
                <Sun aria-hidden="true" size={17} strokeWidth={2} />
              )}
            </button>
            <button
              aria-controls="workspace-sidebar"
              aria-expanded={isSidebarOpen}
              aria-label="Abrir menu"
              className="icon-button application-header__menu"
              onClick={() => setIsSidebarOpen((open) => !open)}
              ref={menuButtonRef}
              type="button"
            >
              <Menu aria-hidden="true" size={20} />
            </button>
          </div>
        </div>
      </header>

      {isSidebarOpen ? (
        <button
          aria-label="Fechar menu"
          className="sidebar-backdrop"
          onClick={closeSidebar}
          type="button"
        />
      ) : null}
      <div
        aria-hidden={!isSidebarOpen}
        aria-label="Menu de módulos"
        aria-modal={isSidebarOpen || undefined}
        className={`workspace-sidebar${isSidebarOpen ? ' workspace-sidebar--open' : ''}`}
        inert={!isSidebarOpen}
        ref={sidebarRef}
        role="dialog"
      >
        <div className="workspace-sidebar__heading">
          <span>Menu</span>
          <button
            aria-label="Fechar menu"
            className="icon-button"
            onClick={closeSidebar}
            type="button"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </div>
        <section aria-label="Conta ativa" className="workspace-sidebar__account">
          <span aria-hidden="true" className="user-chip__avatar">
            {initials(user.displayName)}
          </span>
          <div>
            <span className="workspace-sidebar__account-label">Conta ativa</span>
            <strong title={user.displayName}>{user.displayName}</strong>
          </div>
        </section>
        <nav aria-label="Módulos disponíveis" className="workspace-nav" id="workspace-sidebar">
          <div className="workspace-nav__section">
            <p className="workspace-nav__label">Visão geral</p>
            <button
              className="workspace-nav__item"
              type="button"
              aria-current={activeWorkspace === 'dashboard' ? 'page' : undefined}
              onClick={() => navigate('dashboard')}
            >
              <LayoutDashboard aria-hidden="true" size={17} strokeWidth={2} />
              Início
            </button>
          </div>
          {canViewAssessments || canCreateManagerAssessment || canCreateSelfAssessment ? (
            <div className="workspace-nav__section">
              <p className="workspace-nav__label">Avaliações</p>
              {canViewAssessments ? (
                <button
                  className="workspace-nav__item"
                  type="button"
                  aria-current={activeWorkspace === 'assessments' ? 'page' : undefined}
                  onClick={() => navigate('assessments')}
                >
                  <ClipboardCheck aria-hidden="true" size={17} strokeWidth={2} />
                  {canViewAdministration && canViewAllAssessments
                    ? 'Avaliações individuais'
                    : 'Minhas avaliações'}
                </button>
              ) : null}
              {canCreateManagerAssessment || canCreateSelfAssessment ? (
                <button
                  className="workspace-nav__item workspace-nav__item--primary"
                  type="button"
                  onClick={() =>
                    beginAssessment(canCreateManagerAssessment ? 'EQUIPE' : 'AUTOAVALIACAO')
                  }
                >
                  <ClipboardCheck aria-hidden="true" size={17} strokeWidth={2} />
                  Nova avaliação
                </button>
              ) : null}
            </div>
          ) : null}
          {canViewIndicators || canViewAdministration ? (
            <div className="workspace-nav__section">
              <p className="workspace-nav__label">Gestão</p>
              {canViewIndicators ? (
                <button
                  className="workspace-nav__item"
                  type="button"
                  aria-current={activeWorkspace === 'indicators' ? 'page' : undefined}
                  onClick={() => navigate('indicators')}
                >
                  <BarChart3 aria-hidden="true" size={17} strokeWidth={2} />
                  Indicadores
                </button>
              ) : null}
              {canViewAdministration ? (
                <button
                  className="workspace-nav__item"
                  type="button"
                  aria-current={activeWorkspace === 'administration' ? 'page' : undefined}
                  onClick={() => navigate('administration')}
                >
                  <ShieldCheck aria-hidden="true" size={17} strokeWidth={2} />
                  Administração
                </button>
              ) : null}
            </div>
          ) : null}
        </nav>
        <div className="workspace-sidebar__footer">
          <button
            className="button workspace-sidebar__sign-out"
            disabled={isSigningOut}
            onClick={() => void signOut()}
            type="button"
          >
            <LogOut aria-hidden="true" size={17} strokeWidth={2} />
            {isSigningOut ? 'Saindo…' : 'Sair da conta'}
          </button>
        </div>
      </div>

      <main className="workspace" aria-labelledby="page-title" ref={workspaceRef} tabIndex={-1}>
        {canViewAdministration || canViewAssessments || canViewIndicators ? (
          <div className="workspace__content">
            {activeWorkspace === 'dashboard' ? (
              <DashboardPanel
                canCreateAssessment={canCreateManagerAssessment}
                canCreateSelfAssessment={canCreateSelfAssessment}
                onOpenAssessments={beginAssessment}
              />
            ) : null}
            {activeWorkspace === 'administration' && canViewAdministration ? (
              <AdministrationPanel
                api={api}
                currentUserId={user.id}
                isSupremeAdministrator={user.supremeAdministrator === true}
                permissions={user.permissions}
                section={administrationSection}
                onNavigate={(section) => navigate('administration', { section })}
                onSessionExpired={handleSessionExpired}
              />
            ) : null}
            {activeWorkspace === 'assessments' && canViewAssessments ? (
              <AssessmentsPanel
                api={api}
                canCreateManagerAssessment={canCreateManagerAssessment}
                canCreateSelfAssessment={canCreateSelfAssessment}
                canPublishAssessments={canPublishAssessments}
                canReopenAssessments={canReopenAssessments}
                isAdministrativeView={canViewAdministration && canViewAllAssessments}
                journey={assessmentJourney}
                assessmentId={assessmentId}
                canSubmitSelfAssessment={canSubmitSelfAssessment}
                onExitEditor={() => navigate('assessments')}
                onSelectAssessment={(id) => navigate('assessments', { id })}
                onSessionExpired={handleSessionExpired}
              />
            ) : null}
            {activeWorkspace === 'indicators' && canViewIndicators ? (
              <IndicatorsPanel
                api={api}
                canExport={canExportIndicators}
                onSessionExpired={handleSessionExpired}
              />
            ) : null}
          </div>
        ) : (
          <section className="card empty-state" aria-labelledby="no-workspace-title">
            <LayoutDashboard aria-hidden="true" size={28} strokeWidth={1.5} />
            <h2 id="no-workspace-title">Nenhum módulo disponível</h2>
            <p>Esta conta não possui permissões de negócio ativas.</p>
          </section>
        )}
      </main>
      <footer className="application-footer application-footer--workspace">
        <div className="application-footer__content">
          <p className="application-footer__context">
            <strong>Avaliação de Desempenho e Competências</strong>
            <span>Ambiente interno</span>
          </p>
          <p className="application-footer__credit">
            Desenvolvido por{' '}
            <a
              href="https://www.linkedin.com/in/dev-lucasandrade/"
              target="_blank"
              rel="noreferrer"
            >
              <strong>Lucas Andrade</strong>
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}

function hasAnyPermission(user: CurrentUser, expectedPermissions: readonly string[]): boolean {
  return expectedPermissions.some((permission) => user.permissions.includes(permission))
}

function useLocation(): { pathname: string; search: string } {
  const locationKey = useSyncExternalStore(
    subscribeToLocation,
    () => `${window.location.pathname}${window.location.search}`,
    () => '/',
  )
  const location = new URL(locationKey, window.location.origin)
  return { pathname: location.pathname, search: location.search }
}

function subscribeToLocation(onStoreChange: () => void): () => void {
  window.addEventListener('popstate', onStoreChange)
  return () => window.removeEventListener('popstate', onStoreChange)
}

function workspaceFromPath(pathname: string): Workspace {
  if (pathname === '/administracao' || pathname.startsWith('/administracao/')) {
    return 'administration'
  }
  if (pathname === '/avaliacoes' || pathname.startsWith('/avaliacoes/')) {
    return 'assessments'
  }
  if (pathname === '/indicadores') {
    return 'indicators'
  }
  return 'dashboard'
}

function workspacePath(
  workspace: Workspace,
  options: { journey?: AssessmentJourney; id?: string; section?: AdministrationSection } = {},
): string {
  if (workspace === 'administration') {
    return options.section ? `/administracao/${options.section}` : '/administracao'
  }
  if (workspace === 'indicators') {
    return '/indicadores'
  }
  if (workspace === 'assessments') {
    if (options.id) {
      return `/avaliacoes/${encodeURIComponent(options.id)}`
    }
    if (options.journey) {
      return `/avaliacoes?jornada=${encodeURIComponent(options.journey)}`
    }
    return '/avaliacoes'
  }
  return '/'
}

function isWorkspaceAvailable(
  workspace: Workspace,
  access: {
    canViewAdministration: boolean
    canViewAssessments: boolean
    canViewIndicators: boolean
  },
): boolean {
  if (workspace === 'administration') {
    return access.canViewAdministration
  }
  if (workspace === 'assessments') {
    return access.canViewAssessments
  }
  if (workspace === 'indicators') {
    return access.canViewIndicators
  }
  return true
}

function journeyFromSearch(search: string): AssessmentJourney | undefined {
  const journey = new URLSearchParams(search).get('jornada')
  return journey === 'EQUIPE' || journey === 'AUTOAVALIACAO' ? journey : undefined
}

function assessmentIdFromPath(pathname: string): string | undefined {
  const match = /^\/avaliacoes\/([^/]+)$/.exec(pathname)
  if (!match) {
    return undefined
  }
  try {
    return decodeURIComponent(match[1])
  } catch {
    return undefined
  }
}

function administrationSectionFromPath(pathname: string): AdministrationSection | undefined {
  const match = /^\/administracao\/(usuarios|cadastros|vinculos|questionarios|ciclos)$/.exec(
    pathname,
  )
  return match?.[1] as AdministrationSection | undefined
}

function initials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function initialTheme(): Theme {
  try {
    const storedTheme = window.localStorage.getItem('adc-theme')
    if (storedTheme === 'light' || storedTheme === 'dark') {
      return storedTheme
    }
  } catch {
    // A preferência do sistema continua disponível quando o armazenamento local é bloqueado.
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default App
