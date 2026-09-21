import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { ApiError, type ApiClient } from '../../api/client'
import { LoginForm } from './LoginForm'

describe('Solicitação de recuperação no login', () => {
  it('aceita o login, evita envios simultâneos e responde sem revelar se a conta existe', async () => {
    let complete!: () => void
    const request = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve
        }),
    )
    const { container } = render(
      <LoginForm
        api={{ requestPasswordReset: request } as unknown as ApiClient}
        isRestoringSession={false}
        onAuthenticated={vi.fn()}
        onResumeSession={vi.fn()}
        onToggleTheme={vi.fn()}
        theme="light"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar redefinição de senha' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitação' }))
    expect(request).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o e-mail ou login')
    fireEvent.change(screen.getByLabelText('E-mail ou login para recuperação'), {
      target: { value: ' ficticio@example.invalid ' },
    })
    const button = screen.getByRole('button', { name: 'Enviar solicitação' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(request).toHaveBeenCalledExactlyOnceWith('ficticio@example.invalid')
    complete()
    expect(await screen.findByText(/Se a conta estiver disponível para recuperação/)).toBeVisible()
    expect(screen.getByLabelText('E-mail ou login para recuperação')).toHaveValue('')
    expect(
      (await axe(container, { rules: { 'color-contrast': { enabled: false } } })).violations,
    ).toEqual([])
    request.mockRejectedValueOnce(new ApiError({ status: 429, code: 'TOO_MANY_REQUESTS' }))
    fireEvent.change(screen.getByLabelText('E-mail ou login para recuperação'), {
      target: { value: 'ficticio@example.invalid' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitação' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeVisible())
    expect(
      screen.queryByText(/Se a conta estiver disponível para recuperação/),
    ).not.toBeInTheDocument()
  })
})
