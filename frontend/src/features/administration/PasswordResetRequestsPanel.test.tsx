import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { ApiError, type ApiClient } from '../../api/client'
import type { AdministrationUser } from '../../api/contracts'
import { PasswordResetRequestsPanel } from './PasswordResetRequestsPanel'

const user: AdministrationUser = {
  id: 'fixture-1',
  displayName: 'Pessoa fictícia 1',
  login: 'fixture1@example.invalid',
  status: 'ACTIVE',
  protectedFromNormalFlow: false,
  logicallyDeleted: false,
  passwordChangeRequired: false,
  roles: [],
  individualPermissions: [],
  updatedAt: '2026-09-21T12:00:00Z',
}
const requests = Array.from({ length: 6 }, (_, index) => ({
  userId: `fixture-${index + 1}`,
  displayName: `Pessoa fictícia ${index + 1}`,
  login: `fixture${index + 1}@example.invalid`,
  requestedAt: `2026-09-2${index < 3 ? 0 : 1}T12:0${index}:00Z`,
}))

describe('Atendimento de solicitações de senha', () => {
  it('conta todas as páginas, filtra, edita e remove a pendência depois de gerar a senha', async () => {
    const temporary = ['fixture', 'aleatoria', 'descartavel'].join('-')
    const api = {
      listPasswordResetRequests: vi
        .fn()
        .mockResolvedValueOnce(requests)
        .mockResolvedValueOnce(requests)
        .mockResolvedValue(requests.slice(1)),
      getAdministrationUser: vi.fn().mockResolvedValue(user),
      updateAdministrationUser: vi
        .fn()
        .mockResolvedValue({ ...user, displayName: 'Nome corrigido' }),
      generateTemporaryPassword: vi.fn().mockResolvedValue({
        user: { ...user, passwordChangeRequired: true },
        temporaryPassword: temporary,
      }),
    } as unknown as ApiClient
    const { container } = render(
      <PasswordResetRequestsPanel api={api} canEditAccount onSessionExpired={vi.fn()} />,
    )
    expect(
      await screen.findByRole('heading', { name: 'Solicitações de redefinição de senha (6)' }),
    ).toBeVisible()
    expect(screen.queryByRole('cell', { name: user.displayName })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Filtrar Login'), { target: { value: user.login } })
    expect(screen.getByRole('cell', { name: user.displayName })).toBeVisible()
    const open = screen.getByRole('button', { name: 'Atender solicitação' })
    open.focus()
    fireEvent.click(open)
    const dialog = await screen.findByRole('dialog', { name: 'Atender solicitação de senha' })
    fireEvent.change(within(dialog).getByLabelText('Nome da conta'), {
      target: { value: 'Nome corrigido' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar nome' }))
    await waitFor(() =>
      expect(api.updateAdministrationUser).toHaveBeenCalledWith(user.id, {
        displayName: 'Nome corrigido',
        status: 'ACTIVE',
      }),
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fechar' })).toBeEnabled())
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Gerar senha temporária e redefinir' }),
    )
    expect(await screen.findByLabelText('Senha temporária gerada')).toHaveValue(temporary)
    await waitFor(() => expect(api.listPasswordResetRequests).toHaveBeenCalledTimes(3))
    expect(
      (await axe(container, { rules: { 'color-contrast': { enabled: false } } })).violations,
    ).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByLabelText('Senha temporária gerada')).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Solicitações de redefinição de senha (5)' }),
    ).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Nenhum registro corresponde')
  })

  it('não apresenta lista vazia como sucesso quando a consulta falha e permite repetir', async () => {
    const expired = vi.fn()
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new ApiError({ status: 401 }))
    render(
      <PasswordResetRequestsPanel
        api={{ listPasswordResetRequests: list } as unknown as ApiClient}
        onSessionExpired={expired}
      />,
    )
    expect(await screen.findByRole('alert')).toBeVisible()
    expect(screen.queryByText('Nenhuma solicitação pendente.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar solicitações' }))
    await waitFor(() => expect(expired).toHaveBeenCalledOnce())
  })
})
