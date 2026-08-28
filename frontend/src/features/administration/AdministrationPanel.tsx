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
  onSessionExpired: () => void
}

type AdministrationNavigationItem = {
  id: AdministrationSection
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
  onSessionExpired,
}: AdministrationPanelProps) {
  const hasAny = (...expected: readonly string[]) =>
    expected.some((permission) => permissions.includes(permission))
  const navigation: readonly AdministrationNavigationItem[] = [
    {
      id: 'usuarios',
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
      isAvailable: hasAny('CADASTROS.GERIR'),
    },
    {
      id: 'vinculos',
      isAvailable: hasAny(
        'VINCULOS_GESTOR_COLABORADOR.GERIR',
        'VINCULOS_USUARIO_COLABORADOR.GERIR',
      ),
    },
    {
      id: 'questionarios',
      isAvailable: hasAny('QUESTIONARIOS.GERIR'),
    },
    {
      id: 'ciclos',
      isAvailable: hasAny('CICLOS.GERIR'),
    },
  ]
  const availableNavigation = navigation.filter((item) => item.isAvailable)
  const activeSection = availableNavigation.some((item) => item.id === section)
    ? section
    : availableNavigation[0]?.id

  if (!activeSection) {
    return (
      <section aria-labelledby="administration-title" className="administration-shell">
        <div className="section-heading">
          <div>
            <h2 id="administration-title">Administração indisponível</h2>
          </div>
        </div>
        <FeedbackMessage kind="error">
          Você não possui uma permissão administrativa disponível.
        </FeedbackMessage>
      </section>
    )
  }

  return (
    <section aria-label="Administração" className="administration-shell">
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
