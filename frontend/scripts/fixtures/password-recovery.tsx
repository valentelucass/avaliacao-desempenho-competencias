import { createRoot } from 'react-dom/client'
import type { ApiClient } from '../../src/api/client'
import type { AdministrationUser } from '../../src/api/contracts'
import { PasswordResetRequestsPanel } from '../../src/features/administration/PasswordResetRequestsPanel'
import { RelationshipAdministrationPanel } from '../../src/features/administration/RelationshipAdministrationPanel'
import { LoginForm } from '../../src/features/auth/LoginForm'

const calls: string[] = []
const users: AdministrationUser[] = Array.from({ length: 7 }, (_, index) => ({
  id: `fixture-${index}`,
  login: `pessoa${index}@example.invalid`,
  displayName: `Pessoa fictícia ${index}`,
  status: 'ACTIVE',
  protectedFromNormalFlow: false,
  logicallyDeleted: false,
  passwordChangeRequired: false,
  roles: [],
  individualPermissions: [],
  updatedAt: '2026-09-21T12:00:00Z',
}))
let pending = [...users]
const api = {
  requestPasswordReset: async () => {
    calls.push('request')
  },
  listPasswordResetRequests: async () =>
    pending.map((user, index) => ({
      userId: user.id,
      displayName: user.displayName,
      login: user.login,
      requestedAt: `2026-09-21T12:0${index}:00Z`,
    })),
  getAdministrationUser: async (id: string) => users.find((user) => user.id === id),
  generateTemporaryPassword: async (id: string) => {
    calls.push('reset')
    pending = pending.filter((user) => user.id !== id)
    return {
      user: { ...users.find((user) => user.id === id)!, passwordChangeRequired: true },
      temporaryPassword: ['fixture', 'descartavel', 'aleatoria'].join('-'),
    }
  },
  getManagerAssignmentOptions: async () => ({
    managers: [{ id: 'manager', displayName: 'Avaliador fictício' }],
    collaborators: users.map((user) => ({ id: user.id, displayName: user.displayName })),
  }),
  listActiveManagerAssignments: async () =>
    users.map((user) => ({
      id: `link-${user.id}`,
      managerUserId: 'manager',
      collaboratorId: user.id,
      startsOn: '2026-09-15',
    })),
} as unknown as ApiClient
window.fetch = async () => {
  throw new Error('A fixture não permite rede.')
}
const root = createRoot(document.getElementById('root')!)
function show(login: boolean) {
  root.render(
    login ? (
      <LoginForm
        api={api}
        isRestoringSession={false}
        onAuthenticated={() => {}}
        onResumeSession={async () => {}}
        onToggleTheme={() => {}}
        theme="light"
      />
    ) : (
      <main className="workspace">
        <div className="workspace__content">
          <section className="card">
            <PasswordResetRequestsPanel api={api} onSessionExpired={() => {}} />
          </section>
          <RelationshipAdministrationPanel
            api={api}
            permissions={['VINCULOS_GESTOR_COLABORADOR.GERIR']}
            onSessionExpired={() => {}}
          />
        </div>
      </main>
    ),
  )
}
Object.assign(window, { recoveryFixture: { calls, show } })
show(false)
