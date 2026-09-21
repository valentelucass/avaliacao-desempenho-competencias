import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../api/client'
import { PasswordChangeForm } from './PasswordChangeForm'

describe('Troca pessoal de senha', () => {
  it.each(['😀'.repeat(6), 'á'.repeat(37), ' '.repeat(12)])(
    'rejeita política inválida sem envio (%#)',
    (invalid) => {
      const api = { changePassword: vi.fn() } as unknown as ApiClient
      render(
        <PasswordChangeForm
          api={api}
          onChanged={vi.fn()}
          onSessionExpired={vi.fn()}
          onToggleTheme={vi.fn()}
          theme="light"
        />,
      )
      fireEvent.change(screen.getByLabelText('Senha atual'), {
        target: { value: crypto.randomUUID() },
      })
      fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: invalid } })
      fireEvent.change(screen.getByLabelText('Confirmar nova senha'), {
        target: { value: invalid },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Alterar senha' }))
      expect(api.changePassword).not.toHaveBeenCalled()
      expect(screen.getByLabelText('Nova senha')).toHaveAttribute(
        'aria-describedby',
        screen.getByRole('alert').id,
      )
      expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
      fireEvent.keyDown(screen.getByLabelText('Nova senha'), { key: 'Escape' })
      expect(screen.getByRole('heading', { name: 'Troca de senha obrigatória' })).toBeVisible()
    },
  )

  it('limpa todos os campos depois de falha de envio e não repete a escrita', async () => {
    const api = {
      changePassword: vi.fn().mockRejectedValue(new Error('Falha fictícia')),
    } as unknown as ApiClient
    render(
      <PasswordChangeForm
        api={api}
        onChanged={vi.fn()}
        onSessionExpired={vi.fn()}
        onToggleTheme={vi.fn()}
        theme="light"
      />,
    )
    const next = crypto.randomUUID()
    fireEvent.change(screen.getByLabelText('Senha atual'), {
      target: { value: crypto.randomUUID() },
    })
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: next } })
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: next } })
    const button = screen.getByRole('button', { name: 'Alterar senha' })
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(screen.getByLabelText('Senha atual')).toHaveValue(''))
    expect(screen.getByLabelText('Nova senha')).toHaveValue('')
    expect(screen.getByLabelText('Confirmar nova senha')).toHaveValue('')
    expect(api.changePassword).toHaveBeenCalledTimes(1)
  })
})
