import type { ApiClient } from '../../src/api/client'
import { RelationshipAdministrationPanel } from '../../src/features/administration/RelationshipAdministrationPanel'

const directors = Array.from({ length: 7 }, (_, index) => ({
  id: `director-${index}`,
  displayName: `Conta fictícia de Diretoria com identificação extensa ${index + 1}`,
}))
const api = {
  getDirectorManagerAssignmentOptions: async () => ({
    directors,
    collaborators: [{ id: 'manager-1', displayName: 'Gerência fictícia' }],
  }),
  listActiveDirectorManagerAssignments: async () =>
    directors.map((director, index) => ({
      id: `relationship-${index}`,
      directorUserId: director.id,
      managerCollaboratorId: 'manager-1',
      startsOn: '2026-01-01',
    })),
  closeDirectorManagerAssignment: async () => {
    throw new Error('Esta fixture não permite escritas.')
  },
} as unknown as ApiClient

export function RelationshipTableFixture() {
  return (
    <div data-relationship-regression>
      <RelationshipAdministrationPanel
        api={api}
        permissions={['VINCULOS_DIRETORIA_GERENCIA.GERIR']}
        onSessionExpired={() => {}}
      />
    </div>
  )
}
