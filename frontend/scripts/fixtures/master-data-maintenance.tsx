import { createRoot } from 'react-dom/client'
import type { ApiClient } from '../../src/api/client'
import { MasterDataAdministrationPanel } from '../../src/features/administration/MasterDataAdministrationPanel'

const calls: string[] = []
let areas = [
  { id: 'area-1', name: 'Área fictícia', active: false },
  { id: 'area-2', name: 'Área descartável', active: false },
]
let collaborators = [
  { id: 'person-1', displayName: 'Pessoa fictícia', active: false },
  { id: 'person-2', displayName: 'Pessoa descartável', active: false },
]
const api = new Proxy({} as ApiClient, {
  get:
    (_target, method: string) =>
    async (id: string, body: { name?: string; displayName?: string }) => {
      calls.push(method)
      if (method === 'listAreas') return [...areas]
      if (method === 'listCollaborators') return [...collaborators]
      if (
        [
          'listBranches',
          'listActiveAllocations',
          'listActiveQuestionnaireAssignments',
          'listQuestionnaireAssignmentOptions',
        ].includes(method)
      )
        return []
      if (method === 'updateArea') {
        areas = areas.map((item) => (item.id === id ? { ...item, name: body.name! } : item))
        return
      }
      if (method === 'updateCollaborator') {
        collaborators = collaborators.map((item) =>
          item.id === id ? { ...item, displayName: body.displayName! } : item,
        )
        return
      }
      if (method === 'reactivateArea') {
        areas = areas.map((item) => (item.id === id ? { ...item, active: true } : item))
        return
      }
      if (method === 'reactivateCollaborator') {
        collaborators = collaborators.map((item) =>
          item.id === id ? { ...item, active: true } : item,
        )
        return
      }
      if (method === 'deleteInactiveUnusedArea') {
        areas = areas.filter((item) => item.id !== id)
        return
      }
      if (method === 'deleteInactiveUnusedCollaborator') {
        collaborators = collaborators.filter((item) => item.id !== id)
        return
      }
      throw new Error('Operação inesperada na fixture.')
    },
})
window.fetch = async () => {
  throw new Error('Rede proibida nesta fixture.')
}
Object.assign(window, { maintenanceCalls: calls })
createRoot(document.getElementById('root')!).render(
  <div className="application-shell">
    <main className="workspace">
      <div className="workspace__content">
        <MasterDataAdministrationPanel
          api={api}
          permissions={['CADASTROS.GERIR']}
          onSessionExpired={() => {
            throw new Error('Sessão fictícia expirada.')
          }}
        />
      </div>
    </main>
  </div>,
)
