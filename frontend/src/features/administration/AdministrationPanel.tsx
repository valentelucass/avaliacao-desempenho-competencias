import { BookOpenCheck, BriefcaseBusiness, Link2, ShieldCheck, UsersRound } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ApiClient } from '../../api/client'
import type { Permission } from '../../api/contracts'
import { FeedbackMessage } from '../../ui/Feedback'
import { CycleAdministrationPanel } from './CycleAdministrationPanel'
import { MasterDataAdministrationPanel } from './MasterDataAdministrationPanel'
import { QuestionnaireAdministrationPanel } from './QuestionnaireAdministrationPanel'
import { RelationshipAdministrationPanel } from './RelationshipAdministrationPanel'
import { UserAdministrationPanel } from './UserAdministrationPanel'

export type AdministrationSection =
  'usuarios' | 'cadastros' | 'vinculos' | 'questionarios' | 'ciclos'

type AdministrationPanelProps = {
  api: ApiClient
  currentUserId: string
  isSupremeAdministrator: boolean
  permissions: readonly Permission[]
  section?: AdministrationSection
  onNavigate: (section: AdministrationSection) => void
  onSessionExpired: () => void
}

type AdministrationNavigationItem = {
  id: AdministrationSection
  label: string
  icon: ReactNode
  isAvailable: boolean
}

/**
 * Portal de administração por capacidade. Cada submódulo aparece somente quando
 * a conta possui uma permissão que o torna útil; a API mantém a decisão final.
 */
export function AdministrationPanel({
  api,
  currentUserId,
  isSupremeAdministrator,
  permissions,
  section,
  onNavigate,
  onSessionExpired,
}: AdministrationPanelProps) {
  const hasAny = (...expected: readonly string[]) =>
    expected.some((permission) => permissions.includes(permission))
  const navigation: readonly AdministrationNavigationItem[] = [
    {
      id: 'usuarios',
      label: 'Contas e acessos',
      icon: <ShieldCheck aria-hidden="true" size={17} strokeWidth={2} />,
      isAvailable: hasAny(
        'USUARIOS.LER',
        'USUARIOS.CRIAR',
        'USUARIOS.ALTERAR',
        'ACESSOS.GERIR',
        'ACESSOS.NEGOCIO.GERIR',
      ),
    },
    {
      id: 'cadastros',
      label: 'Cadastros',
      icon: <UsersRound aria-hidden="true" size={17} strokeWidth={2} />,
      isAvailable: hasAny('CADASTROS.GERIR'),
    },
    {
      id: 'vinculos',
      label: 'Vínculos',
      icon: <Link2 aria-hidden="true" size={17} strokeWidth={2} />,
      isAvailable: hasAny(
        'VINCULOS_GESTOR_COLABORADOR.GERIR',
        'VINCULOS_USUARIO_COLABORADOR.GERIR',
      ),
    },
    {
      id: 'questionarios',
      label: 'Questionários',
      icon: <BookOpenCheck aria-hidden="true" size={17} strokeWidth={2} />,
      isAvailable: hasAny('QUESTIONARIOS.GERIR'),
    },
    {
      id: 'ciclos',
      label: 'Ciclos',
      icon: <BriefcaseBusiness aria-hidden="true" size={17} strokeWidth={2} />,
      isAvailable: hasAny('CICLOS.GERIR'),
    },
  ]
  const availableNavigation = navigation.filter((item) => item.isAvailable)
  const activeSection = availableNavigation.some((item) => item.id === section)
    ? section
    : availableNavigation[0]?.id

  if (!activeSection) {
    return (
      <section aria-labelledby="administration-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Administração</p>
            <h2 id="administration-title">Operações administrativas</h2>
          </div>
        </div>
        <FeedbackMessage kind="error">
          Você não possui uma permissão administrativa disponível.
        </FeedbackMessage>
      </section>
    )
  }

  return (
    <section aria-labelledby="administration-title" className="stack-form">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Administração</p>
          <h2 id="administration-title">Operações administrativas</h2>
          <p className="muted">
            Selecione uma área. A autorização, o escopo e a auditoria são confirmados pelo servidor
            em toda alteração.
          </p>
        </div>
      </div>
      <nav aria-label="Áreas administrativas" className="workspace-nav administration-nav">
        {availableNavigation.map((item) => (
          <button
            aria-current={activeSection === item.id ? 'page' : undefined}
            className="workspace-nav__item"
            key={item.id}
            onClick={() => onNavigate(item.id)}
            type="button"
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      {activeSection === 'usuarios' ? (
        <UserAdministrationPanel
          api={api}
          currentUserId={currentUserId}
          isSupremeAdministrator={isSupremeAdministrator}
          permissions={permissions}
          onSessionExpired={onSessionExpired}
        />
      ) : null}
      {activeSection === 'cadastros' ? (
        <MasterDataAdministrationPanel
          api={api}
          permissions={permissions}
          onSessionExpired={onSessionExpired}
        />
      ) : null}
      {activeSection === 'vinculos' ? (
        <RelationshipAdministrationPanel
          api={api}
          permissions={permissions}
          onSessionExpired={onSessionExpired}
        />
      ) : null}
      {activeSection === 'questionarios' ? (
        <QuestionnaireAdministrationPanel
          api={api}
          permissions={permissions}
          onSessionExpired={onSessionExpired}
        />
      ) : null}
      {activeSection === 'ciclos' ? (
        <CycleAdministrationPanel
          api={api}
          permissions={permissions}
          onSessionExpired={onSessionExpired}
        />
      ) : null}
    </section>
  )
}
