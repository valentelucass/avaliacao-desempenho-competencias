import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  BarChart3,
  BookOpenCheck,
  BriefcaseBusiness,
  ClipboardCheck,
  FileQuestion,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  LogOut,
  Menu,
  ShieldCheck,
  ShieldAlert,
  UsersRound,
} from 'lucide-react'
import type { ApiClient } from './api/client'
import { BuildStamp } from './ui/BuildStamp'
import { defaultApiClient } from './api/client'
import type { CurrentUser } from './api/contracts'
import { AuthPageFrame } from './features/auth/AuthPageFrame'
import { LoginForm } from './features/auth/LoginForm'
import { PasswordChangeForm } from './features/auth/PasswordChangeForm'
import {
  AdministrationPanel,
  type AdministrationSection,
} from './features/administration/AdministrationPanel'
import { AssessmentsPanel } from './features/assessments/AssessmentsPanel'
import { IndicatorsPanel } from './features/indicators/IndicatorsPanel'
import { DashboardPanel } from './features/dashboard/DashboardPanel'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { InternationalizationProvider } from '@astryxdesign/core/i18n'
import ptBR from '@astryxdesign/core/locales/pt-BR.generated.js'
import { EvaluationNavigation, type MenuGroup } from './ui/EvaluationNavigation'
import { WorkspaceHeaderHost } from './ui/workspaceHeaderHost'
import { ThemeToggle } from './components/ui/curtain-theme-toggle'
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
  'SENHAS.REDEFINIR',
  'SENHAS.DELEGAR_REDEFINICAO',
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

function WorkspaceApp({ api = defaultApiClient }: AppProps) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [passwordChangeUsername, setPasswordChangeUsername] = useState<string>()
  const [voluntaryPasswordChange, setVoluntaryPasswordChange] = useState(false)
  const [startupError, setStartupError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isRestoringSession, setIsRestoringSession] = useState(true)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const [headerHost, setHeaderHost] = useState<HTMLDivElement | null>(null)
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

  useEffect(() => {
    // O servidor preserva o acesso válido e só renova quando necessário.
    // Ausência de sessão é um resultado normal desta restauração opcional.
    let cancelled = false

    void Promise.resolve()
      .then(() => (cancelled ? null : api.restoreSession()))
      .then((restoredUser) => {
        if (cancelled || !restoredUser) {
          return
        }
        setUser(restoredUser)
      })
      .catch((requestError) => {
        if (!cancelled) {
          setStartupError(safeErrorMessage(requestError))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsRestoringSession(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [api])

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
    setVoluntaryPasswordChange(false)
    setStartupError(undefined)
    setNotice(undefined)
    setPasswordChangeUsername(authenticatedUser.passwordChangeRequired ? username : undefined)
    setUser(authenticatedUser)
  }

  const handlePasswordChanged = useCallback(() => {
    setVoluntaryPasswordChange(false)
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

  if (user === null && isRestoringSession) {
    return (
      <SessionRestoringScreen
        onToggleTheme={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
        theme={theme}
      />
    )
  }

  if (user === null) {
    return (
      <LoginForm
        api={api}
        isRestoringSession={isRestoringSession}
        notice={notice}
        onAuthenticated={handleAuthenticated}
        onToggleTheme={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
        startupError={startupError}
        theme={theme}
      />
    )
  }

  if (user.passwordChangeRequired || voluntaryPasswordChange) {
    return (
      <PasswordChangeForm
        api={api}
        onChanged={handlePasswordChanged}
        onSessionExpired={handleSessionExpired}
        onToggleTheme={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
        theme={theme}
        username={passwordChangeUsername}
        onCancel={
          user.passwordChangeRequired
            ? undefined
            : () => {
                setVoluntaryPasswordChange(false)
                requestAnimationFrame(() => {
                  const trigger = menuButtonRef.current
                  if (trigger?.getClientRects().length) trigger.focus()
                  else workspaceRef.current?.focus({ preventScroll: true })
                })
              }
        }
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
  const canCreateDirectorAssessment =
    hasAnyPermission(user, ['AVALIACOES.AVALIAR_GERENCIAS_VINCULADAS']) &&
    user.roles?.includes('DIRETORIA') === true &&
    !(user.roles ?? []).includes('ADMINISTRADOR_PLATAFORMA')
  const canPublishAssessments =
    !(user.roles ?? []).includes('ADMINISTRADOR_PLATAFORMA') &&
    (canSubmitSelfAssessment ||
      hasAnyPermission(user, ['AVALIACOES.PUBLICAR']) ||
      (user.roles?.includes('GESTOR') === true &&
        hasAnyPermission(user, ['AVALIACOES.AVALIAR_VINCULADOS'])))
  const canReopenAssessments = hasAnyPermission(user, ['AVALIACOES.REABRIR'])
  const canRecordAssessmentFeedback = hasAnyPermission(user, [
    'AVALIACOES.REGISTRAR_FEEDBACK_PROPRIO',
  ])
  const canViewAllAssessments = hasAnyPermission(user, ['AVALIACOES.VISUALIZAR_TODAS'])
  const canUseAdministrativeAssessmentFilters = hasAnyPermission(user, ['CADASTROS.GERIR'])
  const canViewIndicators = hasAnyPermission(user, ['INDICADORES.VISUALIZAR'])
  const canExportIndicators = hasAnyPermission(user, ['DADOS.EXPORTAR'])
  const canExportAssessments =
    canViewAllAssessments &&
    canExportIndicators &&
    (user.roles ?? []).some((role) => role === 'GERENCIA_RH' || role === 'DIRETORIA') &&
    !(user.roles ?? []).includes('ADMINISTRADOR_PLATAFORMA')
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
        'SENHAS.REDEFINIR',
        'SENHAS.DELEGAR_REDEFINICAO',
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

  const groups: MenuGroup[] = [
    {
      title: 'Visão geral',
      items: [
        {
          label: 'Início',
          icon: <LayoutDashboard size={17} />,
          href: workspacePath('dashboard'),
          selected: activeWorkspace === 'dashboard',
          select: () => navigate('dashboard'),
        },
      ],
    },
    {
      title: 'Avaliações',
      items: canViewAssessments
        ? [
            {
              label:
                canViewAdministration && canViewAllAssessments
                  ? 'Avaliações individuais'
                  : 'Minhas avaliações',
              icon: <ClipboardCheck size={17} />,
              href: workspacePath('assessments'),
              selected: activeWorkspace === 'assessments',
              select: () => navigate('assessments'),
            },
          ]
        : [],
    },
    {
      title: 'Gestão',
      items: canViewIndicators
        ? [
            {
              label: 'Indicadores',
              icon: <BarChart3 size={17} />,
              href: workspacePath('indicators'),
              selected: activeWorkspace === 'indicators',
              select: () => navigate('indicators'),
            },
          ]
        : [],
    },
    {
      title: 'Administração',
      items: canViewAdministration
        ? administrationMenuItems.map((item) => ({
            label: item.label,
            icon: item.icon,
            href: workspacePath('administration', { section: item.section }),
            selected: activeAdministrationSection === item.section,
            select: () => navigate('administration', { section: item.section }),
          }))
        : [],
    },
  ]
  const listHeader = activeWorkspace === 'assessments' && !assessmentId && !routeState
  const pageNames: Record<Workspace, string> = {
    dashboard: 'Início',
    assessments: 'Avaliações',
    indicators: 'Indicadores',
    administration:
      administrationMenuItems.find((item) => item.section === activeAdministrationSection)?.label ??
      'Administração',
  }
  const activeTitle = activeWorkspace ? pageNames[activeWorkspace] : 'Avaliação de desempenho'

  return (
    <div className="ev-shell">
      <EvaluationNavigation
        groups={groups}
        displayName={user.displayName}
        profile={profileDescription(user)}
        help={<ProfileAccessHelp user={user} />}
        open={isSidebarOpen}
        onOpenChange={setIsSidebarOpen}
        onHome={() => navigate('dashboard')}
        signingOut={isSigningOut}
        onPassword={() => {
          closeSidebar()
          setVoluntaryPasswordChange(true)
        }}
      />
      <div className="ev-stage">
        <header className="ev-header">
          <Button
            label="Abrir menu"
            isIconOnly
            variant="ghost"
            size="sm"
            className="ev-menu-trigger"
            icon={<Menu size={19} />}
            aria-controls="workspace-sidebar"
            aria-expanded={isSidebarOpen}
            ref={menuButtonRef}
            onClick={() => setIsSidebarOpen(true)}
          />
          <div className="ev-header-slot" ref={setHeaderHost}>
            {(routeState ||
              (!canViewAdministration && !canViewAssessments && !canViewIndicators)) && (
              <div className="ev-header-title">
                <span>Avaliação de desempenho</span>
                <Heading level={1} id="page-title">
                  {activeTitle}
                </Heading>
              </div>
            )}
          </div>
          <ThemeToggle
            theme={theme}
            variant="icon"
            className="ev-theme-trigger"
            onThemeChange={setTheme}
          />
          <Button
            label={isSigningOut ? 'Saindo…' : 'Sair da conta'}
            variant="ghost"
            icon={<LogOut size={16} aria-hidden="true" />}
            className="ev-sign-out"
            isDisabled={isSigningOut}
            onClick={() => void signOut()}
          >
            <span className="ev-sign-out-label">{isSigningOut ? 'Saindo…' : 'Sair'}</span>
          </Button>
        </header>

        <WorkspaceHeaderHost.Provider value={headerHost}>
          <main
            className="workspace ev-workspace"
            aria-labelledby={listHeader ? 'assessments-title' : undefined}
            aria-label={listHeader ? undefined : activeTitle}
            ref={workspaceRef}
            tabIndex={-1}
          >
            {routeState ? (
              <WorkspaceRouteState
                kind={routeState}
                onGoToDashboard={() => navigate('dashboard')}
              />
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
                    headerHost={headerHost}
                    api={api}
                    canCreateManagerAssessment={canCreateManagerAssessment}
                    canCreateDirectorAssessment={canCreateDirectorAssessment}
                    canCreateSelfAssessment={canCreateSelfAssessment}
                    canPublishAssessments={canPublishAssessments}
                    canReopenAssessments={canReopenAssessments}
                    canRecordFeedback={canRecordAssessmentFeedback}
                    canExportAssessments={canExportAssessments}
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
        </WorkspaceHeaderHost.Provider>
        <footer className="application-footer application-footer--workspace">
          <div className="application-footer__content">
            <p className="application-footer__context">
              <strong>Avaliação de Desempenho e Competências</strong>
              <span>Ambiente interno</span>
              <BuildStamp />
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
    </div>
  )
}

function SessionRestoringScreen({
  onToggleTheme,
  theme,
}: {
  onToggleTheme: () => void
  theme: Theme
}) {
  return (
    <AuthPageFrame
      contentClassName="auth-layout--restoring"
      labelledBy="session-restoring-title"
      onToggleTheme={onToggleTheme}
      theme={theme}
    >
      <section aria-live="polite" className="card session-restoring" role="status">
        <LoaderCircle aria-hidden="true" className="session-restoring__spinner" size={23} />
        <div>
          <p className="eyebrow">Área interna</p>
          <h1 id="session-restoring-title">Restaurando sua sessão</h1>
          <p className="muted">Verificando seu acesso com segurança.</p>
        </div>
      </section>
    </AuthPageFrame>
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

export default function App(props: AppProps) {
  return (
    <InternationalizationProvider locale="pt-BR" messages={{ 'pt-BR': ptBR }}>
      <WorkspaceApp {...props} />
    </InternationalizationProvider>
  )
}
