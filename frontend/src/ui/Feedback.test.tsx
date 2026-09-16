import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { StrictMode, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FeedbackMessage } from './Feedback'

describe('FeedbackMessage', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each([
    ['status', 5000],
    ['error', 10000],
    ['warning', 10000],
  ] as const)('fecha %s automaticamente após %s ms e limpa o estado uma vez', (kind, delay) => {
    vi.useFakeTimers()
    const dismiss = vi.fn()
    render(
      <StrictMode>
        <FeedbackMessage kind={kind} onDismiss={dismiss}>
          Resultado da operação.
        </FeedbackMessage>
      </StrictMode>,
    )
    const role = kind === 'error' ? 'alert' : 'status'
    act(() => vi.advanceTimersByTime(delay - 1))
    expect(screen.getByRole(role)).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByRole(role)).not.toBeInTheDocument()
    expect(dismiss).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(delay))
    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it('interrompe o prazo durante interação por ponteiro ou teclado sem remover o foco', () => {
    vi.useFakeTimers()
    render(<FeedbackMessage kind="error">Confira os dados.</FeedbackMessage>)
    const alert = screen.getByRole('alert')
    act(() => vi.advanceTimersByTime(9000))
    fireEvent.pointerEnter(alert)
    act(() => vi.advanceTimersByTime(20000))
    expect(alert).toBeInTheDocument()
    const close = screen.getByRole('button', { name: 'Fechar aviso' })
    act(() => close.focus())
    fireEvent.pointerLeave(alert)
    act(() => vi.advanceTimersByTime(20000))
    expect(close).toHaveFocus()
    act(() => close.blur())
    act(() => vi.advanceTimersByTime(9999))
    expect(alert).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(alert).not.toBeInTheDocument()
  })

  it('retoma o prazo completo quando a aba volta a ficar visível', () => {
    vi.useFakeTimers()
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    render(<FeedbackMessage kind="status">Salvo.</FeedbackMessage>)
    act(() => vi.advanceTimersByTime(4000))
    hidden.mockReturnValue(true)
    fireEvent(document, new Event('visibilitychange'))
    act(() => vi.advanceTimersByTime(20000))
    expect(screen.getByRole('status')).toBeInTheDocument()
    hidden.mockReturnValue(false)
    fireEvent(document, new Event('visibilitychange'))
    act(() => vi.advanceTimersByTime(4999))
    expect(screen.getByRole('status')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('reinicia para mensagem nova, usa o callback atual e cancela ao desmontar', () => {
    vi.useFakeTimers()
    const first = vi.fn()
    const latest = vi.fn()
    const { rerender, unmount } = render(
      <FeedbackMessage kind="error" onDismiss={first}>
        Primeiro erro.
      </FeedbackMessage>,
    )
    act(() => vi.advanceTimersByTime(9000))
    rerender(
      <FeedbackMessage kind="error" onDismiss={first}>
        Segundo erro.
      </FeedbackMessage>,
    )
    act(() => vi.advanceTimersByTime(9000))
    rerender(
      <FeedbackMessage kind="error" onDismiss={latest}>
        Segundo erro.
      </FeedbackMessage>,
    )
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(first).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledTimes(1)
    rerender(
      <FeedbackMessage kind="error" onDismiss={latest}>
        Terceiro erro.
      </FeedbackMessage>,
    )
    unmount()
    act(() => vi.advanceTimersByTime(10000))
    expect(latest).toHaveBeenCalledTimes(1)
  })

  it('empilha erro e sucesso fora do conteúdo sem tirar o foco do formulário', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    const { container, unmount } = render(
      <StrictMode>
        <FeedbackMessage kind="error">Erro com referência segura.</FeedbackMessage>
        <FeedbackMessage kind="status">Operação concluída.</FeedbackMessage>
      </StrictMode>,
    )
    const region = screen.getByRole('region', { name: 'Notificações' })
    expect(region.parentElement).toBe(document.body)
    expect(container).not.toContainElement(region)
    expect(within(region).getByRole('alert')).toHaveTextContent('Erro com referência segura.')
    expect(within(region).getByRole('status')).toHaveTextContent('Operação concluída.')
    expect(input).toHaveFocus()
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Fechar aviso' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
    unmount()
    expect(screen.queryByRole('region', { name: 'Notificações' })).not.toBeInTheDocument()
    input.remove()
  })

  it('permite fechar e reapresentar o mesmo erro com associação ao formulário', () => {
    function Form() {
      const [error, setError] = useState<string>()
      return (
        <form aria-label="Exemplo" aria-describedby={error ? 'form-error' : undefined}>
          <button type="button" onClick={() => setError('Confira as datas.')}>
            Validar
          </button>
          {error ? (
            <FeedbackMessage kind="error" id="form-error" onDismiss={() => setError(undefined)}>
              {error}
            </FeedbackMessage>
          ) : null}
        </form>
      )
    }
    render(<Form />)
    for (let attempt = 0; attempt < 2; attempt++) {
      fireEvent.click(screen.getByRole('button', { name: 'Validar' }))
      expect(screen.getByRole('form')).toHaveAccessibleDescription('Confira as datas.')
      fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    }
  })

  it.each(['dialog', 'alertdialog'])('mantém o aviso no escopo acessível de %s', (role) => {
    const dismiss = vi.fn()
    render(
      <div role={role} aria-modal="true" aria-label="Editar conta">
        <FeedbackMessage kind="error" onDismiss={dismiss}>
          Não foi possível salvar.
        </FeedbackMessage>
      </div>,
    )
    const dialog = screen.getByRole(role)
    expect(dialog).toContainElement(screen.getByRole('alert'))
    expect(within(dialog).getByRole('region', { name: 'Notificações' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }))
    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it('mantém carregamento no contexto e mostra uma mensagem nova após dispensar outra', () => {
    const { container, rerender } = render(
      <FeedbackMessage kind="info">Carregando…</FeedbackMessage>,
    )
    expect(container).toContainElement(screen.getByRole('status'))
    expect(screen.queryByRole('region', { name: 'Notificações' })).not.toBeInTheDocument()
    rerender(<FeedbackMessage kind="warning">Confira o período.</FeedbackMessage>)
    fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }))
    rerender(<FeedbackMessage kind="warning">Confira o questionário.</FeedbackMessage>)
    expect(screen.getByRole('status')).toHaveTextContent('Confira o questionário.')
  })
})
