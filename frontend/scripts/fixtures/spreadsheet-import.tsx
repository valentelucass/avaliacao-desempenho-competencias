import { createRoot } from 'react-dom/client'
import type { ApiClient } from '../../src/api/client'
import { RelationshipAdministrationPanel } from '../../src/features/administration/RelationshipAdministrationPanel'
import { MasterDataAdministrationPanel } from '../../src/features/administration/MasterDataAdministrationPanel'

const calls: string[] = []
const reads = new Set([
  'getManagerAssignmentOptions',
  'listActiveManagerAssignments',
  'listBranches',
  'listAreas',
  'listCollaborators',
  'listActiveAllocations',
  'listActiveQuestionnaireAssignments',
  'listQuestionnaireAssignmentOptions',
])
const api = new Proxy({} as ApiClient, {
  get: (_target, method: string) => async () => {
    calls.push(method)
    if (method === 'previewSpreadsheet')
      return {
        id: 'preview-fixture',
        expiresAt: '2099-01-01T00:00:00Z',
        total: 2,
        creates: 1,
        existing: 1,
        errors: 0,
        page: 1,
        totalPages: 1,
        rows: [
          {
            line: 2,
            name: 'Pessoa fictícia nova',
            questionnaire: 'Questionário fictício',
            allocation: {
              branch: 'Filial Exemplo',
              area: 'Área operacional de exemplo com descrição extensa',
              manager: 'Gestor fictício responsável pela unidade de exemplo',
              startsOn: '15/09/2026',
            },
            managerAssignment: { manager: 'Gestora fictícia autorizada', startsOn: '16/09/2026' },
            status: 'CREATE',
            message: 'Criar registro.',
          },
          {
            line: 3,
            name: 'Pessoa fictícia existente',
            questionnaire: 'Questionário fictício',
            allocation: {
              branch: 'Filial Exemplo',
              area: 'Área Exemplo',
              manager: 'Gestor Exemplo',
              startsOn: '15/09/2026',
            },
            managerAssignment: { manager: 'Gestora fictícia autorizada', startsOn: '16/09/2026' },
            status: 'EXISTS',
            message: 'Registro já cadastrado; será mantido.',
          },
        ],
      }
    if (method === 'confirmSpreadsheet') return { created: 1, existing: 1 }
    if (method === 'discardSpreadsheet') return undefined
    if (method === 'getManagerAssignmentOptions')
      return {
        managers: [{ id: 'manager-fixture', displayName: 'Gestora fictícia autorizada' }],
        collaborators: [{ id: 'collaborator-fixture', displayName: 'Pessoa fictícia' }],
      }
    if (!reads.has(method)) throw new Error('Chamada inesperada no teste de importação.')
    if (method === 'listQuestionnaireAssignmentOptions')
      return [
        {
          cycleId: 'cycle-fixture',
          cycleCode: '2026',
          cycleName: 'Ciclo fictício',
          questionnaires: [
            { cycleQuestionnaireId: 'questionnaire-fixture', title: 'Questionário fictício' },
          ],
        },
      ]
    return []
  },
})
window.fetch = async () => {
  calls.push('unexpected-network')
  throw new Error('Esta fixture não permite rede.')
}
Object.assign(window, { spreadsheetImportCalls: calls })

createRoot(document.getElementById('root')!).render(
  <div className="application-shell">
    <main className="workspace">
      <div className="workspace__content">
        <MasterDataAdministrationPanel
          api={api}
          permissions={['CADASTROS.GERIR']}
          onSessionExpired={() => {
            throw new Error('Sessão fictícia não deve expirar.')
          }}
        />
        <RelationshipAdministrationPanel
          api={api}
          permissions={['VINCULOS_GESTOR_COLABORADOR.GERIR']}
          onSessionExpired={() => {
            throw new Error('Sessão fictícia não deve expirar.')
          }}
        />
      </div>
    </main>
  </div>,
)
