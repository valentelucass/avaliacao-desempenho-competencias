import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { ThemeToggle } from './curtain-theme-toggle'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete document.documentElement.dataset.theme
})

const curtain = () => document.querySelector('.adc-theme-curtain') as HTMLElement

function animationEnd() {
  // Sem AnimationEvent, React usa o evento prefixado detectado pelo jsdom.
  fireEvent(
    curtain(),
    new Event('AnimationEvent' in window ? 'animationend' : 'webkitAnimationEnd', {
      bubbles: true,
    }),
  )
}

function motionPreference(matches: boolean) {
  const listeners = new EventTarget()
  const media = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener: listeners.addEventListener.bind(listeners),
    removeEventListener: listeners.removeEventListener.bind(listeners),
    dispatchEvent: listeners.dispatchEvent.bind(listeners),
  }
  vi.spyOn(window, 'matchMedia').mockReturnValue(media)
  return media
}

describe('ThemeToggle com cortina', () => {
  it('respeita defaultTheme sem redefinir o tema na montagem', () => {
    render(<ThemeToggle variant="icon" defaultTheme="dark" />)
    expect(screen.getByRole('button', { name: 'Ativar modo claro' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(document.documentElement).not.toHaveAttribute('data-theme')
    expect(curtain()).toBeNull()
  })

  it('reutiliza data-theme existente no modo independente', () => {
    document.documentElement.dataset.theme = 'dark'
    render(<ThemeToggle variant="icon" defaultTheme="light" duration={0} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ativar modo claro' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('cobre a página antes de mudar, trava repetição e notifica somente uma vez', () => {
    vi.useFakeTimers()
    const onThemeChange = vi.fn()
    render(<ThemeToggle variant="icon" onThemeChange={onThemeChange} />)
    const button = screen.getByRole('button', { name: 'Ativar modo escuro' })
    button.focus()
    fireEvent.click(button)
    expect(curtain().parentElement).toBe(document.body)
    expect(curtain()).toHaveAttribute('aria-hidden', 'true')
    expect(curtain()).toHaveAttribute('data-phase', 'falling')
    expect(curtain()).toHaveAttribute('data-target-theme', 'dark')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveFocus()
    fireEvent.click(button)
    expect(onThemeChange).not.toHaveBeenCalled()
    animationEnd()
    expect(onThemeChange).toHaveBeenCalledExactlyOnceWith('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(curtain()).toHaveAttribute('data-phase', 'rising')
    animationEnd()
    act(() => vi.runAllTimers())
    expect(onThemeChange).toHaveBeenCalledTimes(1)
    expect(curtain()).toBeNull()
    expect(button).toHaveAttribute('aria-disabled', 'false')
    expect(button).toHaveFocus()
  })

  it('permanece controlado pelo aplicativo e não cria outra persistência', () => {
    const onThemeChange = vi.fn()
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    document.documentElement.dataset.theme = 'light'
    const { rerender } = render(
      <ThemeToggle variant="icon" theme="light" onThemeChange={onThemeChange} duration={0} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ativar modo escuro' }))
    expect(onThemeChange).toHaveBeenCalledExactlyOnceWith('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(storage).not.toHaveBeenCalled()
    rerender(<ThemeToggle variant="icon" theme="dark" duration={0} />)
    expect(screen.getByRole('button', { name: 'Ativar modo claro' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('troca imediatamente e sem cortina com movimento reduzido', () => {
    motionPreference(true)
    const onThemeChange = vi.fn()
    render(<ThemeToggle variant="icon" onThemeChange={onThemeChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ativar modo escuro' }))
    expect(onThemeChange).toHaveBeenCalledExactlyOnceWith('dark')
    expect(curtain()).toBeNull()
  })

  it('finaliza uma animação ativa se movimento reduzido for ativado', () => {
    vi.useFakeTimers()
    const media = motionPreference(false)
    const onThemeChange = vi.fn()
    render(<ThemeToggle variant="icon" onThemeChange={onThemeChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ativar modo escuro' }))
    act(() => {
      media.matches = true
      media.dispatchEvent(new Event('change'))
    })
    expect(curtain()).toBeNull()
    expect(onThemeChange).toHaveBeenCalledExactlyOnceWith('dark')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('finaliza antes da impressão sem deixar sobreposição ou callback duplicado', () => {
    vi.useFakeTimers()
    const onThemeChange = vi.fn()
    render(<ThemeToggle variant="icon" onThemeChange={onThemeChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ativar modo escuro' }))
    fireEvent(window, new Event('beforeprint'))
    expect(curtain()).toBeNull()
    act(() => vi.runAllTimers())
    expect(onThemeChange).toHaveBeenCalledExactlyOnceWith('dark')
  })

  it('cancela os timers ao desmontar, sem trocar o tema depois de sair da tela', () => {
    vi.useFakeTimers()
    const onThemeChange = vi.fn()
    const { unmount } = render(<ThemeToggle variant="icon" onThemeChange={onThemeChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ativar modo escuro' }))
    unmount()
    expect(curtain()).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    act(() => vi.runAllTimers())
    expect(onThemeChange).not.toHaveBeenCalled()
  })

  it('libera o controle mesmo sem animationend e normaliza duração inválida', () => {
    vi.useFakeTimers()
    const onThemeChange = vi.fn()
    render(<ThemeToggle variant="icon" onThemeChange={onThemeChange} duration={Number.NaN} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ativar modo escuro' }))
    act(() => vi.advanceTimersByTime(670))
    expect(curtain()).toHaveAttribute('data-phase', 'rising')
    act(() => vi.advanceTimersByTime(670))
    expect(curtain()).toBeNull()
    expect(onThemeChange).toHaveBeenCalledExactlyOnceWith('dark')
  })

  it('mantém a variante appbar acessível, pesquisa funcional e conteúdo filho', async () => {
    const onSearch = vi.fn()
    const { container } = render(
      <ThemeToggle
        variant="appbar"
        appBarProps={{ appName: 'Exemplo fictício', onSearch, userName: 'Pessoa de teste' }}
      >
        <main>
          <h1>Conteúdo preservado</h1>
        </main>
      </ThemeToggle>,
    )
    fireEvent.change(screen.getByRole('searchbox', { name: 'Pesquisar' }), {
      target: { value: 'teste' },
    })
    expect(onSearch).toHaveBeenCalledExactlyOnceWith('teste')
    expect(screen.getByRole('heading', { name: 'Conteúdo preservado' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ativar modo escuro' })).toHaveAttribute(
      'type',
      'button',
    )
    expect(
      (await axe(container, { rules: { 'color-contrast': { enabled: false } } })).violations,
    ).toEqual([])
  })
})
