import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  BarChart3,
  BookOpenCheck,
  BriefcaseBusiness,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  FileQuestion,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  Moon,
  ShieldCheck,
  ShieldAlert,
  Sun,
  UsersRound,
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
import { ContextHelp } from './ui/ContextHelp'
import { EmptyState } from './ui/EmptyState'
import { safeErrorMessage } from './ui/safeErrorMessage'
import './App.css'
import './visual-skin.css'

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
  'VINCULOS_DIRETORIA_GERENCIA.GERIR',
] as const

const profileLabels: Readonly<Record<string, string>> = {
  ADMINISTRADOR_PLATAFORMA: 'Administrador técnico',
  GESTOR: 'Gestor',
  GERENCIA_RH: 'RH',
  DIRETORIA: 'Diretoria',
  COLABORADOR: 'Colaborador',
}

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
  const closeSidebar = useCallback(() => {
    if (isSidebarOpen) {
      menuButtonRef.current?.focus({ preventScroll: true })
    }
    setIsSidebarOpen(false)
  }, [isSidebarOpen])

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
  }, [closeSidebar, isSidebarOpen])

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
      setNotice('Você saiu da sessão com segurança.')
    } catch (requestError) {
      setStartupError(safeErrorMessage(requestError))
    } finally {
      // Uma sessão expirada, sem conexão ou já revogada não pode manter a pessoa presa na
      // tela autenticada. Quando possível, o cliente primeiro renova a sessão e pede a
      // revogação ao servidor; de todo modo, encerra imediatamente o estado desta interface.
      setUser(null)
      setPasswordChangeUsername(undefined)
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
    'AVALIACOES.AVALIAR_GERENCIAS_VINCULADAS',
    'AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS',
    'AVALIACOES.VISUALIZAR_TODAS',
    'AUTOAVALIACOES.PREENCHER_PROPRIA',
    'AUTOAVALIACOES.ENVIAR_PROPRIA',
    'AUTOAVALIACOES.VISUALIZAR_PROPRIA',
  ])
  const canCreateSelfAssessment = hasAnyPermission(user, ['AUTOAVALIACOES.PREENCHER_PROPRIA'])
  const canSubmitSelfAssessment = hasAnyPermission(user, ['AUTOAVALIACOES.ENVIAR_PROPRIA'])
  const canCreateManagerAssessment = hasAnyPermission(user, ['AVALIACOES.AVALIAR_VINCULADOS'])
  const canCreateDirectorAssessment = hasAnyPermission(user, [
    'AVALIACOES.AVALIAR_GERENCIAS_VINCULADAS',
  ])
  const canPublishAssessments = hasAnyPermission(user, ['AVALIACOES.PUBLICAR'])
  const canReopenAssessments = hasAnyPermission(user, ['AVALIACOES.REABRIR'])
  const canRecordAssessmentFeedback = hasAnyPermission(user, [
    'AVALIACOES.REGISTRAR_FEEDBACK_PROPRIO',
  ])
  const canViewAllAssessments = hasAnyPermission(user, ['AVALIACOES.VISUALIZAR_TODAS'])
  const canUseAdministrativeAssessmentFilters = hasAnyPermission(user, ['CADASTROS.GERIR'])
  const canViewIndicators = hasAnyPermission(user, ['INDICADORES.VISUALIZAR'])
  const canExportIndicators = hasAnyPermission(user, ['DADOS.EXPORTAR'])
  const canViewAdministration = hasAnyPermission(user, administrationPermissions)
  const administrationMenuItems = [
    {
      section: 'usuarios' as const,
      label: 'Contas e acessos',
      icon: <ShieldCheck aria-hidden="true" size={16} strokeWidth={2} />,
      available: hasAnyPermission(user, [
        'USUARIOS.LER',
        'USUARIOS.CRIAR',
        'USUARIOS.ALTERAR',
        'ACESSOS.GERIR',
        'ACESSOS.NEGOCIO.GERIR',
      ]),
    },
    {
      section: 'cadastros' as const,
      label: 'Cadastros',
      icon: <UsersRound aria-hidden="true" size={16} strokeWidth={2} />,
      available: hasAnyPermission(user, ['CADASTROS.GERIR']),
    },
    {
      section: 'vinculos' as const,
      label: 'Vínculos',
      icon: <Link2 aria-hidden="true" size={16} strokeWidth={2} />,
      available: hasAnyPermission(user, [
        'VINCULOS_GESTOR_COLABORADOR.GERIR',
        'VINCULOS_USUARIO_COLABORADOR.GERIR',
        'VINCULOS_DIRETORIA_GERENCIA.GERIR',
      ]),
    },
    {
      section: 'questionarios' as const,
      label: 'Questionários',
      icon: <BookOpenCheck aria-hidden="true" size={16} strokeWidth={2} />,
      available: hasAnyPermission(user, ['QUESTIONARIOS.GERIR']),
    },
    {
      section: 'ciclos' as const,
      label: 'Ciclos',
      icon: <BriefcaseBusiness aria-hidden="true" size={16} strokeWidth={2} />,
      available: hasAnyPermission(user, ['CICLOS.GERIR']),
    },
  ].filter((item) => item.available)
  const requestedWorkspace = workspaceFromPath(location.pathname)
  const activeWorkspace =
    requestedWorkspace &&
    isWorkspaceAvailable(requestedWorkspace, {
      canViewAdministration,
      canViewAssessments,
      canViewIndicators,
    })
      ? requestedWorkspace
      : undefined
  const routeState = requestedWorkspace ? (activeWorkspace ? undefined : 'forbidden') : 'not-found'
  const assessmentJourney = journeyFromSearch(location.search)
  const assessmentId = assessmentIdFromPath(location.pathname)
  const administrationSection = administrationSectionFromPath(location.pathname)
  const activeAdministrationSection =
    activeWorkspace === 'administration'
      ? (administrationSection ?? administrationMenuItems[0]?.section)
      : undefined

  function navigate(
    nextWorkspace: Workspace,
    options?: { journey?: AssessmentJourney; id?: string; section?: AdministrationSection },
  ) {
    const path = workspacePath(nextWorkspace, options)
    window.history.pushState(null, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
    closeSidebar()
  }

  function beginAssessment(journey: AssessmentJourney) {
    navigate('assessments', { journey })
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
            <div className="workspace-sidebar__profile-line">
              <span className="workspace-sidebar__account-profile">{profileDescription(user)}</span>
              {isSidebarOpen ? <ProfileAccessHelp user={user} /> : null}
            </div>
          </div>
        </section>
        <SidebarNavigation>
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
          {canViewAssessments ? (
            <div className="workspace-nav__section">
              <p className="workspace-nav__label">Avaliações</p>
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
                <div className="workspace-nav__administration">
                  <div className="workspace-nav__administration-heading">
                    <ShieldCheck aria-hidden="true" size={17} strokeWidth={2} />
                    Administração
                  </div>
                  <div className="workspace-nav__administration-items">
                    {administrationMenuItems.map((item) => (
                      <button
                        aria-current={
                          activeAdministrationSection === item.section ? 'page' : undefined
                        }
                        className="workspace-nav__item workspace-nav__item--nested"
                        key={item.section}
                        onClick={() => navigate('administration', { section: item.section })}
                        type="button"
                      >
                        {item.icon}
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </SidebarNavigation>
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
        {routeState ? (
          <WorkspaceRouteState kind={routeState} onGoToDashboard={() => navigate('dashboard')} />
        ) : canViewAdministration || canViewAssessments || canViewIndicators ? (
          <div className="workspace__content">
            {activeWorkspace === 'dashboard' ? (
              <DashboardPanel
                canCreateAssessment={canCreateManagerAssessment || canCreateDirectorAssessment}
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
                onSessionExpired={handleSessionExpired}
              />
            ) : null}
            {activeWorkspace === 'assessments' && canViewAssessments ? (
              <AssessmentsPanel
                api={api}
                canCreateManagerAssessment={canCreateManagerAssessment}
                canCreateDirectorAssessment={canCreateDirectorAssessment}
                canCreateSelfAssessment={canCreateSelfAssessment}
                canPublishAssessments={canPublishAssessments}
                canReopenAssessments={canReopenAssessments}
                canRecordFeedback={canRecordAssessmentFeedback}
                isAdministrativeView={canViewAdministration && canViewAllAssessments}
                canUseAdministrativeFilters={
                  canViewAdministration &&
                  canViewAllAssessments &&
                  canUseAdministrativeAssessmentFilters
                }
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
          <EmptyState
            className="card empty-state--route"
            headingLevel={2}
            title="Nenhum módulo disponível"
          >
            Esta conta não possui permissões de negócio ativas. Solicite ao responsável o perfil
            necessário para acessar um módulo.
          </EmptyState>
        )}
      </main>
      <footer className="application-footer application-footer--workspace">
        <div className="application-footer__content">
          <p className="application-footer__context">
            <strong>Avaliação de Desempenho e Competências</strong>
            <span>Ambiente interno</span>
          </p>
          <p className="application-footer__credit">
            Todos os direitos reservados à Rodogarcia. Desenvolvido por{' '}
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

function WorkspaceRouteState({
  kind,
  onGoToDashboard,
}: {
  kind: 'forbidden' | 'not-found'
  onGoToDashboard: () => void
}) {
  const isNotFound = kind === 'not-found'

  return (
    <EmptyState
      className="card empty-state--route"
      headingLevel={2}
      icon={
        isNotFound ? (
          <FileQuestion size={30} strokeWidth={1.6} />
        ) : (
          <ShieldAlert size={30} strokeWidth={1.6} />
        )
      }
      title={isNotFound ? 'Página não encontrada' : 'Acesso não disponível'}
      action={
        <button className="button button--primary" type="button" onClick={onGoToDashboard}>
          Ir para a página inicial
        </button>
      }
    >
      {isNotFound
        ? 'O endereço informado não existe ou foi movido. Sua sessão continua ativa.'
        : 'Sua sessão continua ativa, mas seu perfil não possui permissão para abrir esta página.'}
    </EmptyState>
  )
}

function profileDescription(user: CurrentUser): string {
  const labels = (user.roles ?? [])
    .map((role) => profileLabels[role])
    .filter((label): label is string => Boolean(label))

  if (labels.length === 0) {
    if (user.supremeAdministrator) {
      return 'Perfil: Administrador técnico'
    }
    return 'Perfil: acesso configurado'
  }

  return `${labels.length === 1 ? 'Perfil' : 'Perfis'}: ${labels.join(' · ')}`
}

type ProfileCapability = {
  label: string
  description: string
}

function ProfileAccessHelp({ user }: { user: CurrentUser }) {
  const capabilities = profileCapabilities(user)

  return (
    <ContextHelp
      ariaLabel="Entenda o que esta conta pode acessar"
      estimatedHeight={Math.min(432, 108 + capabilities.length * 52)}
      title="O que esta conta pode acessar"
    >
      <ul>
        {capabilities.map((capability) => (
          <li key={capability.label}>
            <span>{capability.label}: </span>
            {capability.description}
          </li>
        ))}
      </ul>
      <p className="context-help__note">
        Vínculos, ciclo, questionário e escopo continuam validados pelo servidor.
      </p>
    </ContextHelp>
  )
}

function profileCapabilities(user: CurrentUser): readonly ProfileCapability[] {
  const capabilities: ProfileCapability[] = []
  const administrationSections = [
    hasAnyPermission(user, [
      'USUARIOS.LER',
      'USUARIOS.CRIAR',
      'USUARIOS.ALTERAR',
      'ACESSOS.GERIR',
      'ACESSOS.NEGOCIO.GERIR',
    ])
      ? 'contas e acessos'
      : undefined,
    hasAnyPermission(user, ['CADASTROS.GERIR']) ? 'cadastros' : undefined,
    hasAnyPermission(user, [
      'VINCULOS_GESTOR_COLABORADOR.GERIR',
      'VINCULOS_USUARIO_COLABORADOR.GERIR',
      'VINCULOS_DIRETORIA_GERENCIA.GERIR',
    ])
      ? 'vínculos'
      : undefined,
    hasAnyPermission(user, ['QUESTIONARIOS.GERIR']) ? 'questionários' : undefined,
    hasAnyPermission(user, ['CICLOS.GERIR']) ? 'ciclos' : undefined,
  ].filter((section): section is string => Boolean(section))

  if (administrationSections.length > 0) {
    capabilities.push({
      label: 'Administração',
      description: `acessar ${administrationSections.join(', ')}.`,
    })
  }
  if (hasAnyPermission(user, ['AVALIACOES.AVALIAR_VINCULADOS'])) {
    capabilities.push({
      label: 'Avaliações de equipe',
      description: 'criar e acompanhar avaliações de colaboradores vinculados.',
    })
  }
  if (hasAnyPermission(user, ['AVALIACOES.AVALIAR_GERENCIAS_VINCULADAS'])) {
    capabilities.push({
      label: 'Avaliações de gerência',
      description: 'criar e acompanhar avaliações de gerências vinculadas.',
    })
  }
  if (
    hasAnyPermission(user, [
      'AUTOAVALIACOES.PREENCHER_PROPRIA',
      'AUTOAVALIACOES.ENVIAR_PROPRIA',
      'AUTOAVALIACOES.VISUALIZAR_PROPRIA',
    ])
  ) {
    capabilities.push({
      label: 'Autoavaliação',
      description:
        'preencher, enviar ou consultar a própria avaliação quando ela estiver atribuída.',
    })
  }
  if (hasAnyPermission(user, ['AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS'])) {
    capabilities.push({
      label: 'Próprias respostas',
      description: 'consultar avaliações feitas por esta conta como avaliadora.',
    })
  }
  if (hasAnyPermission(user, ['AVALIACOES.VISUALIZAR_TODAS'])) {
    capabilities.push({
      label: 'Avaliações individuais',
      description: 'consultar avaliações dentro do escopo administrativo autorizado.',
    })
  }
  if (hasAnyPermission(user, ['AVALIACOES.PUBLICAR', 'AVALIACOES.REABRIR'])) {
    capabilities.push({
      label: 'Decisões de avaliação',
      description: 'publicar ou reabrir avaliações dentro do escopo autorizado.',
    })
  }
  if (hasAnyPermission(user, ['AVALIACOES.REGISTRAR_FEEDBACK_PROPRIO'])) {
    capabilities.push({
      label: 'Feedback',
      description: 'registrar o feedback das avaliações feitas por esta conta.',
    })
  }
  if (hasAnyPermission(user, ['INDICADORES.VISUALIZAR'])) {
    capabilities.push({
      label: 'Indicadores',
      description: 'consultar resultados agregados que atendam à regra de confidencialidade.',
    })
  }
  if (hasAnyPermission(user, ['DADOS.EXPORTAR'])) {
    capabilities.push({
      label: 'Exportação',
      description: 'exportar dados agregados quando a consulta for permitida.',
    })
  }

  return capabilities.length > 0
    ? capabilities
    : [{ label: 'Acesso disponível', description: 'usar somente a página inicial da plataforma.' }]
}

function SidebarNavigation({ children }: { children: ReactNode }) {
  const navigationRef = useRef<HTMLElement>(null)
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)

  useEffect(() => {
    const navigation = navigationRef.current
    if (!navigation) {
      return undefined
    }

    function syncScrollAffordances() {
      const scrollableNavigation = navigationRef.current
      if (!scrollableNavigation) {
        return
      }

      const maximumScroll = scrollableNavigation.scrollHeight - scrollableNavigation.clientHeight
      const nextCanScrollUp = scrollableNavigation.scrollTop > 1
      const nextCanScrollDown = maximumScroll - scrollableNavigation.scrollTop > 1
      setCanScrollUp((current) => (current === nextCanScrollUp ? current : nextCanScrollUp))
      setCanScrollDown((current) => (current === nextCanScrollDown ? current : nextCanScrollDown))
    }

    syncScrollAffordances()
    navigation.addEventListener('scroll', syncScrollAffordances, { passive: true })
    window.addEventListener('resize', syncScrollAffordances)

    const contentObserver = new MutationObserver(syncScrollAffordances)
    contentObserver.observe(navigation, { childList: true, subtree: true })
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(syncScrollAffordances)
    resizeObserver?.observe(navigation)

    return () => {
      navigation.removeEventListener('scroll', syncScrollAffordances)
      window.removeEventListener('resize', syncScrollAffordances)
      contentObserver.disconnect()
      resizeObserver?.disconnect()
    }
  }, [])

  function scrollNavigation(direction: 'up' | 'down') {
    const navigation = navigationRef.current
    if (!navigation) {
      return
    }

    const amount = Math.max(120, Math.round(navigation.clientHeight * 0.62))
    const top = direction === 'up' ? -amount : amount
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (typeof navigation.scrollBy === 'function') {
      navigation.scrollBy({ top, behavior: reduceMotion ? 'auto' : 'smooth' })
      return
    }
    navigation.scrollTop += top
  }

  return (
    <div
      className="workspace-sidebar__navigation"
      data-scroll-down={canScrollDown || undefined}
      data-scroll-up={canScrollUp || undefined}
    >
      <div
        aria-hidden="true"
        className="workspace-sidebar__navigation-fade workspace-sidebar__navigation-fade--top"
      />
      {canScrollUp ? (
        <button
          aria-controls="workspace-sidebar"
          aria-label="Subir no menu"
          className="workspace-sidebar__navigation-control workspace-sidebar__navigation-control--up"
          onClick={() => scrollNavigation('up')}
          type="button"
        >
          <ChevronUp aria-hidden="true" size={18} strokeWidth={2} />
        </button>
      ) : null}
      <nav
        aria-label="Módulos disponíveis"
        className="workspace-nav"
        id="workspace-sidebar"
        ref={navigationRef}
      >
        {children}
      </nav>
      <div
        aria-hidden="true"
        className="workspace-sidebar__navigation-fade workspace-sidebar__navigation-fade--bottom"
      />
      {canScrollDown ? (
        <button
          aria-controls="workspace-sidebar"
          aria-label="Descer no menu"
          className="workspace-sidebar__navigation-control workspace-sidebar__navigation-control--down"
          onClick={() => scrollNavigation('down')}
          type="button"
        >
          <ChevronDown aria-hidden="true" size={18} strokeWidth={2} />
        </button>
      ) : null}
    </div>
  )
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

function workspaceFromPath(pathname: string): Workspace | undefined {
  const normalizedPath =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname

  if (
    normalizedPath === '/administracao' ||
    /^\/administracao\/(usuarios|cadastros|vinculos|questionarios|ciclos)$/.test(normalizedPath)
  ) {
    return 'administration'
  }
  if (normalizedPath === '/avaliacoes') {
    return 'assessments'
  }
  if (/^\/avaliacoes\/[^/]+$/.test(normalizedPath)) {
    try {
      return decodeURIComponent(normalizedPath.slice('/avaliacoes/'.length))
        ? 'assessments'
        : undefined
    } catch {
      return undefined
    }
  }
  if (normalizedPath === '/indicadores') {
    return 'indicators'
  }
  return normalizedPath === '/' ? 'dashboard' : undefined
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
