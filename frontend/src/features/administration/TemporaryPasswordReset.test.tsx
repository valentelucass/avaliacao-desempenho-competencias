import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../api/client'
import type { GeneratedTemporaryPassword } from '../../api/contracts'
import { TemporaryPasswordReset } from './TemporaryPasswordReset'

const result = () => {
  const value = crypto.randomUUID()
  return {
    user: { id: 'fixture' },
    temporaryPassword: value,
  } as GeneratedTemporaryPassword
}

describe('Senha temporária em memória', () => {
  it('descarta resposta recebida depois de sair da tela, sem callbacks nem exposição', async () => {
    let resolve!: (value: GeneratedTemporaryPassword) => void
    const api = {
      generateTemporaryPassword: vi.fn(
        () =>
          new Promise<GeneratedTemporaryPassword>((done) => {
            resolve = done
          }),
      ),
    } as unknown as ApiClient
    const onReset = vi.fn()
    const expired = vi.fn()
    const { unmount } = render(
      <TemporaryPasswordReset
        api={api}
        userId="fixture"
        onReset={onReset}
        onSessionExpired={expired}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Gerar senha temporária e redefinir' }))
    unmount()
    await act(async () => resolve(result()))
    expect(onReset).not.toHaveBeenCalled()
    expect(expired).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Senha temporária gerada')).not.toBeInTheDocument()
  })

  it('limpa ao trocar de alvo e ao sair da página, sem persistir em storage', async () => {
    const generated = result()
    const api = {
      generateTemporaryPassword: vi.fn().mockResolvedValue(generated),
    } as unknown as ApiClient
    const props = { api, onReset: vi.fn(), onSessionExpired: vi.fn() }
    const { rerender } = render(<TemporaryPasswordReset {...props} userId="fixture" />)
    fireEvent.click(screen.getByRole('button', { name: 'Gerar senha temporária e redefinir' }))
    expect(await screen.findByLabelText('Senha temporária gerada')).toHaveValue(
      generated.temporaryPassword,
    )
    rerender(<TemporaryPasswordReset {...props} userId="another-fixture" />)
    expect(screen.queryByLabelText('Senha temporária gerada')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Gerar senha temporária e redefinir' }))
    await screen.findByLabelText('Senha temporária gerada')
    fireEvent(window, new Event('pagehide'))
    expect(screen.queryByLabelText('Senha temporária gerada')).not.toBeInTheDocument()
    expect(JSON.stringify(localStorage)).not.toContain(generated.temporaryPassword)
    expect(JSON.stringify(sessionStorage)).not.toContain(generated.temporaryPassword)
  })

  it('impede duplo envio e não reapresenta resposta antiga após troca de alvo', async () => {
    let resolve!: (value: GeneratedTemporaryPassword) => void
    const api = {
      generateTemporaryPassword: vi.fn(
        () =>
          new Promise<GeneratedTemporaryPassword>((done) => {
            resolve = done
          }),
      ),
    } as unknown as ApiClient
    const props = { api, onReset: vi.fn(), onSessionExpired: vi.fn() }
    const { rerender } = render(<TemporaryPasswordReset {...props} userId="fixture" />)
    const button = screen.getByRole('button', { name: 'Gerar senha temporária e redefinir' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(api.generateTemporaryPassword).toHaveBeenCalledTimes(1)
    rerender(<TemporaryPasswordReset {...props} userId="another-fixture" />)
    await act(async () => resolve(result()))
    expect(props.onReset).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Senha temporária gerada')).not.toBeInTheDocument()
  })
})
