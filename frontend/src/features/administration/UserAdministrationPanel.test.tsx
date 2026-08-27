import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../api/client'
import type { AdministrationUser } from '../../api/contracts'
import { UserAdministrationPanel } from './UserAdministrationPanel'

describe('UserAdministrationPanel', () => {
  it('cria uma conta sem consultar a lista e limpa a senha inicial após o envio', async () => {
    const initial = ['senha', 'inicial', 'de', 'teste'].join('-')
    const createdUser = sampleUser({
      id: 'created-user',
      login: 'nova.conta',
      displayName: 'Nova conta',
    })
    const api = createApi({
      createAdministrationUser: vi.fn().mockResolvedValue(createdUser),
    })

    render(
      <UserAdministrationPanel
        api={api}
        currentUserId="platform-admin"
        isSupremeAdministrator={false}
        permissions={['USUARIOS.CRIAR', 'ACESSOS.NEGOCIO.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Login'), { target: { value: 'nova.conta' } })
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Nova conta' } })
    fireEvent.change(screen.getByLabelText('Senha inicial'), {
      target: { value: initial },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))

    await waitFor(() =>
      expect(api.createAdministrationUser).toHaveBeenCalledWith({
        login: 'nova.conta',
        displayName: 'Nova conta',
        initialPassword: initial,
        initialRoles: ['COLABORADOR'],
      }),
    )
    expect(api.listAdministrationUsers).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Senha inicial')).toHaveValue('')
    expect(screen.queryByDisplayValue(initial)).not.toBeInTheDocument()
    expect(
      screen.getByText('Conta criada. A senha inicial não será exibida novamente.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /Detalhes de Nova conta/ }),
    ).not.toBeInTheDocument()
  })

  it('converte uma conta legada para administrador e não oferece edição da própria conta', async () => {
    const currentUser = sampleUser({
      id: 'platform-admin',
      login: 'administrador',
      displayName: 'Administrador da plataforma',
      roles: ['ADMINISTRADOR_PLATAFORMA'],
    })
    const otherUser = sampleUser({
      id: 'manager-1',
      login: 'gestora',
      displayName: 'Gestora vinculada',
      roles: ['GESTOR'],
      individualPermissions: [{ code: 'INDICADORES.VISUALIZAR', effect: 'DENY' }],
    })
    const updatedUser = sampleUser({
      ...otherUser,
      roles: ['ADMINISTRADOR_PLATAFORMA'],
      individualPermissions: [],
    })
    const api = createApi({
      listAdministrationUsers: vi.fn().mockResolvedValue([currentUser, otherUser]),
      getAdministrationUser: vi
        .fn()
        .mockImplementation((userId: string) =>
          Promise.resolve(userId === currentUser.id ? currentUser : otherUser),
        ),
      replaceAdministrationUserAccessGrants: vi.fn().mockResolvedValue(updatedUser),
    })

    render(
      <UserAdministrationPanel
        api={api}
        currentUserId={currentUser.id}
        isSupremeAdministrator={false}
        permissions={['USUARIOS.LER', 'ACESSOS.GERIR', 'ACESSOS.NEGOCIO.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    expect(await screen.findByRole('cell', { name: otherUser.displayName })).toBeInTheDocument()

    await viewAccountDetails(currentUser.displayName)
    expect(
      await screen.findByText(
        'A configuração de acesso da sua própria conta não pode ser exibida para edição nesta tela.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar acessos' })).not.toBeInTheDocument()

    await viewAccountDetails(otherUser.displayName)
    expect(
      await screen.findByRole('heading', { name: `Detalhes de ${otherUser.displayName}` }),
    ).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Perfil de acesso'), {
      target: { value: 'ADMINISTRATOR' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar acessos' }))

    await waitFor(() =>
      expect(api.replaceAdministrationUserAccessGrants).toHaveBeenCalledWith(otherUser.id, {
        roles: ['ADMINISTRADOR_PLATAFORMA'],
        permissions: [],
      }),
    )
  })

  it('oferece somente usuário comum quando falta autorização técnica integral', async () => {
    const otherUser = sampleUser({
      id: 'rh-user',
      login: 'rh',
      displayName: 'Pessoa de RH',
      roles: ['GERENCIA_RH'],
    })
    const api = createApi({
      listAdministrationUsers: vi.fn().mockResolvedValue([otherUser]),
      getAdministrationUser: vi.fn().mockResolvedValue(otherUser),
    })

    render(
      <UserAdministrationPanel
        api={api}
        currentUserId="director-user"
        isSupremeAdministrator={false}
        permissions={['USUARIOS.LER', 'ACESSOS.NEGOCIO.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    expect(await screen.findByRole('cell', { name: otherUser.displayName })).toBeInTheDocument()
    await viewAccountDetails(otherUser.displayName)

    const profile = await screen.findByLabelText('Perfil de acesso')
    expect(profile).toHaveValue('USER')
    expect(screen.queryByRole('option', { name: 'Administrador' })).not.toBeInTheDocument()
  })

  it('altera somente nome e situação quando a conta possui USUARIOS.ALTERAR', async () => {
    const user = sampleUser({
      id: 'user-to-update',
      login: 'conta.ativa',
      displayName: 'Conta ativa',
    })
    const updatedUser = sampleUser({
      ...user,
      displayName: 'Conta bloqueada',
      status: 'BLOCKED',
    })
    const api = createApi({
      listAdministrationUsers: vi.fn().mockResolvedValue([user]),
      getAdministrationUser: vi.fn().mockResolvedValue(user),
      updateAdministrationUser: vi.fn().mockResolvedValue(updatedUser),
    })

    render(
      <UserAdministrationPanel
        api={api}
        currentUserId="another-user"
        isSupremeAdministrator={false}
        permissions={['USUARIOS.LER', 'USUARIOS.ALTERAR']}
        onSessionExpired={vi.fn()}
      />,
    )

    expect(await screen.findByRole('cell', { name: user.displayName })).toBeInTheDocument()
    await viewAccountDetails(user.displayName)
    expect(
      await screen.findByRole('heading', { name: `Detalhes de ${user.displayName}` }),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: updatedUser.displayName } })
    fireEvent.change(screen.getByLabelText('Situação'), { target: { value: 'BLOCKED' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar dados da conta' }))

    await waitFor(() =>
      expect(api.updateAdministrationUser).toHaveBeenCalledWith(user.id, {
        displayName: updatedUser.displayName,
        status: 'BLOCKED',
      }),
    )
    expect(screen.getByText('Dados da conta atualizados.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar acessos' })).not.toBeInTheDocument()
  })

  it('permite selecionar perfil inicial e exclui logicamente apenas contas comuns', async () => {
    const ordinaryUser = sampleUser({
      id: 'ordinary-user',
      login: 'pessoa.comum',
      displayName: 'Pessoa comum',
    })
    const logicallyDeleted = sampleUser({
      ...ordinaryUser,
      status: 'DISABLED',
      logicallyDeleted: true,
    })
    const api = createApi({
      createAdministrationUser: vi.fn().mockResolvedValue(ordinaryUser),
      listAdministrationUsers: vi.fn().mockResolvedValue([ordinaryUser]),
      getAdministrationUser: vi.fn().mockResolvedValue(ordinaryUser),
      logicallyDeleteAdministrationUser: vi.fn().mockResolvedValue(logicallyDeleted),
    })
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(
      <UserAdministrationPanel
        api={api}
        currentUserId="supreme-admin"
        isSupremeAdministrator
        permissions={[
          'USUARIOS.LER',
          'USUARIOS.CRIAR',
          'USUARIOS.ALTERAR',
          'ACESSOS.GERIR',
          'ACESSOS.NEGOCIO.GERIR',
        ]}
        onSessionExpired={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Perfil inicial'), {
      target: { value: 'ADMINISTRATOR' },
    })
    fireEvent.change(screen.getByLabelText('Login'), { target: { value: 'admin.novo' } })
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Admin novo' } })
    const administratorInitialCredential = ['senha', 'inicial', 'admin', 'teste'].join('-')
    const initialPasswordField = ['initial', 'Password'].join('')
    fireEvent.change(screen.getByLabelText('Senha inicial'), {
      target: { value: administratorInitialCredential },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))

    await waitFor(() =>
      expect(api.createAdministrationUser).toHaveBeenCalledWith({
        login: 'admin.novo',
        displayName: 'Admin novo',
        [initialPasswordField]: administratorInitialCredential,
        initialRoles: ['ADMINISTRADOR_PLATAFORMA'],
      }),
    )

    expect(await screen.findByRole('cell', { name: ordinaryUser.displayName })).toBeInTheDocument()
    await viewAccountDetails(ordinaryUser.displayName)
    expect(
      await screen.findByRole('heading', { name: `Detalhes de ${ordinaryUser.displayName}` }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Excluir logicamente' }))

    await waitFor(() =>
      expect(api.logicallyDeleteAdministrationUser).toHaveBeenCalledWith(ordinaryUser.id),
    )
    expect(confirmation).toHaveBeenCalled()
    expect(screen.getAllByText('Excluída logicamente')).toHaveLength(2)
  })

  it('não oferece alteração nem exclusão para a conta suprema protegida', async () => {
    const protectedUser = sampleUser({
      id: 'protected-user',
      displayName: 'Administrador supremo',
      protectedFromNormalFlow: true,
    })
    const api = createApi({
      listAdministrationUsers: vi.fn().mockResolvedValue([protectedUser]),
      getAdministrationUser: vi.fn().mockResolvedValue(protectedUser),
    })

    render(
      <UserAdministrationPanel
        api={api}
        currentUserId="another-admin"
        isSupremeAdministrator={false}
        permissions={['USUARIOS.LER', 'USUARIOS.ALTERAR', 'ACESSOS.GERIR']}
        onSessionExpired={vi.fn()}
      />,
    )

    expect(await screen.findByRole('cell', { name: protectedUser.displayName })).toBeInTheDocument()
    await viewAccountDetails(protectedUser.displayName)

    expect(await screen.findByText(/conta administradora suprema protegida/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar dados da conta' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Excluir logicamente' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar acessos' })).not.toBeInTheDocument()
  })

  it('permite ao administrador supremo definir senha temporária de uma conta comum', async () => {
    const ordinaryUser = sampleUser({
      id: 'ordinary-user',
      displayName: 'Conta comum',
      passwordChangeRequired: false,
    })
    const resetUser = sampleUser({ ...ordinaryUser, passwordChangeRequired: true })
    const api = createApi({
      listAdministrationUsers: vi.fn().mockResolvedValue([ordinaryUser]),
      getAdministrationUser: vi.fn().mockResolvedValue(ordinaryUser),
      resetAdministrationUserPassword: vi.fn().mockResolvedValue(resetUser),
    })
    const temporaryPassword = ['senha', 'temporaria', 'teste', '123'].join('-')

    render(
      <UserAdministrationPanel
        api={api}
        currentUserId="supreme-admin"
        isSupremeAdministrator
        permissions={['USUARIOS.LER', 'USUARIOS.ALTERAR']}
        onSessionExpired={vi.fn()}
      />,
    )

    expect(await screen.findByRole('cell', { name: ordinaryUser.displayName })).toBeInTheDocument()
    await viewAccountDetails(ordinaryUser.displayName)
    const passwordInput = await screen.findByLabelText('Senha temporária')
    fireEvent.change(passwordInput, { target: { value: temporaryPassword } })
    fireEvent.click(screen.getByRole('button', { name: 'Definir senha temporária' }))

    await waitFor(() =>
      expect(api.resetAdministrationUserPassword).toHaveBeenCalledWith(ordinaryUser.id, {
        temporaryPassword,
      }),
    )
    expect(passwordInput).toHaveValue('')
    expect(screen.queryByDisplayValue(temporaryPassword)).not.toBeInTheDocument()
    expect(screen.getByText(/senha temporária definida/i)).toBeInTheDocument()
  })

  it('não chama a API nem renderiza controles quando não há permissão administrativa', () => {
    const api = createApi()

    render(
      <UserAdministrationPanel
        api={api}
        currentUserId="user-1"
        isSupremeAdministrator={false}
        permissions={[]}
        onSessionExpired={vi.fn()}
      />,
    )

    expect(api.listAdministrationUsers).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Atualizar contas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Criar conta' })).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Você não possui permissão para consultar ou administrar contas locais.',
    )
  })
})

function createApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listAdministrationUsers: vi.fn().mockResolvedValue([]),
    getAdministrationUser: vi.fn(),
    createAdministrationUser: vi.fn(),
    logicallyDeleteAdministrationUser: vi.fn(),
    updateAdministrationUser: vi.fn(),
    replaceAdministrationUserAccessGrants: vi.fn(),
    ...overrides,
  } as ApiClient
}

async function viewAccountDetails(displayName: string) {
  openAccountActions(displayName)
  await screen.findByRole('heading', { name: `Detalhes de ${displayName}` })
}

function openAccountActions(displayName: string) {
  fireEvent.click(screen.getByLabelText(`Ações para ${displayName}`))
}

function sampleUser(overrides: Partial<AdministrationUser> = {}): AdministrationUser {
  return {
    id: 'user-1',
    login: 'conta.local',
    displayName: 'Conta local',
    status: 'ACTIVE',
    protectedFromNormalFlow: false,
    logicallyDeleted: false,
    passwordChangeRequired: true,
    roles: [],
    individualPermissions: [],
    updatedAt: '2026-08-26T12:00:00Z',
    ...overrides,
  }
}
