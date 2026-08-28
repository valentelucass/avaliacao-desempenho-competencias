import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../api/client'
import type {
  ActiveManagerAssignment,
  ActiveUserCollaboratorLink,
  ManagerAssignmentOptions,
  UserCollaboratorLinkOptions,
} from '../../api/contracts'
import { RelationshipAdministrationPanel } from './RelationshipAdministrationPanel'

describe('RelationshipAdministrationPanel', () => {
  it('carrega opções minimizadas por tipo de vínculo, sem consultar listas amplas de pessoas', async () => {
    const api = createApi()

    render(
      <RelationshipAdministrationPanel
        api={api}
        permissions={['VINCULOS_GESTOR_COLABORADOR.GERIR', 'VINCULOS_USUARIO_COLABORADOR.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    expect(await screen.findByRole('option', { name: 'Gestora Joana' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Conta de Marina' })).toBeInTheDocument()
    expect(screen.getAllByText('Patrícia Avaliada').length).toBeGreaterThan(0)
    expect(screen.queryByText('manager-user-1')).not.toBeInTheDocument()
    expect(screen.queryByText('collaborator-1')).not.toBeInTheDocument()

    expect(api.getManagerAssignmentOptions).toHaveBeenCalledTimes(1)
    expect(api.getUserCollaboratorLinkOptions).toHaveBeenCalledTimes(1)
    expect(api.listAdministrationUsers).not.toHaveBeenCalled()
    expect(api.listCollaborators).not.toHaveBeenCalled()
  })

  it('cria um vínculo gestor-colaborador usando as opções autorizadas', async () => {
    const api = createApi()

    render(
      <RelationshipAdministrationPanel
        api={api}
        permissions={['VINCULOS_GESTOR_COLABORADOR.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    await screen.findByRole('option', { name: 'Gestora Joana' })
    fireEvent.change(screen.getByLabelText('Conta do gestor'), {
      target: { value: 'manager-user-1' },
    })
    fireEvent.change(screen.getByLabelText('Colaborador'), {
      target: { value: 'collaborator-1' },
    })
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-08-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar vínculo de gestão' }))

    await waitFor(() =>
      expect(api.createManagerAssignment).toHaveBeenCalledWith({
        managerUserId: 'manager-user-1',
        collaboratorId: 'collaborator-1',
        startsOn: '2026-08-01',
      }),
    )
    expect(await screen.findByText('Vínculo gestor-colaborador criado.')).toBeInTheDocument()
  })

  it('mantém os rótulos de cada vínculo para a apresentação móvel', async () => {
    const api = createApi()

    render(
      <RelationshipAdministrationPanel
        api={api}
        permissions={['VINCULOS_GESTOR_COLABORADOR.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    const cells = (await screen.findByRole('button', { name: 'Encerrar' }))
      .closest('tr')
      ?.querySelectorAll('td')

    expect(cells).toHaveLength(4)
    expect(cells?.[0]).toHaveAttribute('data-label', 'Gestor')
    expect(cells?.[1]).toHaveAttribute('data-label', 'Colaborador')
    expect(cells?.[2]).toHaveAttribute('data-label', 'Início')
    expect(cells?.[3]).toHaveAttribute('data-label', 'Ação')
  })

  it('exige confirmação com data para encerrar um vínculo e preserva o histórico', async () => {
    const api = createApi()

    render(
      <RelationshipAdministrationPanel
        api={api}
        permissions={['VINCULOS_GESTOR_COLABORADOR.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar' }))
    expect(
      screen.getByRole('heading', { name: 'Confirmar encerramento de vínculo' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar encerramento' }))
    expect(
      await screen.findByText('Informe a data de encerramento do vínculo.'),
    ).toBeInTheDocument()
    expect(api.closeManagerAssignment).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Data de encerramento'), {
      target: { value: '2026-08-31' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar encerramento' }))

    await waitFor(() =>
      expect(api.closeManagerAssignment).toHaveBeenCalledWith('manager-assignment-1', {
        endsOn: '2026-08-31',
      }),
    )
    expect(
      await screen.findByText('Vínculo encerrado. O histórico não foi removido.'),
    ).toBeInTheDocument()
  })

  it('não consulta nem oferece vínculos sem a permissão correspondente', () => {
    const api = createApi()

    render(
      <RelationshipAdministrationPanel api={api} permissions={[]} onSessionExpired={vi.fn()} />,
    )

    expect(api.getManagerAssignmentOptions).not.toHaveBeenCalled()
    expect(api.getUserCollaboratorLinkOptions).not.toHaveBeenCalled()
    expect(api.listActiveManagerAssignments).not.toHaveBeenCalled()
    expect(api.listActiveUserCollaboratorLinks).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Você não possui permissão para administrar vínculos de pessoas.',
    )
  })
})

function createApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    getManagerAssignmentOptions: vi.fn().mockResolvedValue(sampleManagerOptions()),
    getUserCollaboratorLinkOptions: vi.fn().mockResolvedValue(sampleUserLinkOptions()),
    listActiveManagerAssignments: vi.fn().mockResolvedValue([sampleManagerAssignment()]),
    listActiveUserCollaboratorLinks: vi.fn().mockResolvedValue([sampleUserLink()]),
    createManagerAssignment: vi.fn().mockResolvedValue({ id: 'created-manager-assignment' }),
    closeManagerAssignment: vi.fn().mockResolvedValue(undefined),
    createUserCollaboratorLink: vi.fn().mockResolvedValue({ id: 'created-user-link' }),
    closeUserCollaboratorLink: vi.fn().mockResolvedValue(undefined),
    listAdministrationUsers: vi.fn(),
    listCollaborators: vi.fn(),
    ...overrides,
  } as ApiClient
}

function sampleManagerOptions(
  overrides: Partial<ManagerAssignmentOptions> = {},
): ManagerAssignmentOptions {
  return {
    managers: [{ id: 'manager-user-1', displayName: 'Gestora Joana' }],
    collaborators: [{ id: 'collaborator-1', displayName: 'Patrícia Avaliada' }],
    ...overrides,
  }
}

function sampleUserLinkOptions(
  overrides: Partial<UserCollaboratorLinkOptions> = {},
): UserCollaboratorLinkOptions {
  return {
    users: [{ id: 'local-user-1', displayName: 'Conta de Marina' }],
    collaborators: [{ id: 'collaborator-1', displayName: 'Patrícia Avaliada' }],
    ...overrides,
  }
}

function sampleManagerAssignment(
  overrides: Partial<ActiveManagerAssignment> = {},
): ActiveManagerAssignment {
  return {
    id: 'manager-assignment-1',
    managerUserId: 'manager-user-1',
    collaboratorId: 'collaborator-1',
    startsOn: '2026-01-01',
    ...overrides,
  }
}

function sampleUserLink(
  overrides: Partial<ActiveUserCollaboratorLink> = {},
): ActiveUserCollaboratorLink {
  return {
    id: 'user-link-1',
    userId: 'local-user-1',
    collaboratorId: 'collaborator-1',
    startsOn: '2026-01-01',
    ...overrides,
  }
}
