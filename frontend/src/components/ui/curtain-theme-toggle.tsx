'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Moon, Search, Sun, UserRound } from 'lucide-react'
import './curtain-theme-toggle.css'

export type Theme = 'light' | 'dark'

export interface AppBarProps {
  logo?: ReactNode
  appName?: string
  onSearch?: (query: string) => void
  userAvatar?: ReactNode
  userName?: string
}

export interface ThemeToggleProps {
  variant?: 'default' | 'appbar' | 'icon'
  appBarProps?: AppBarProps
  defaultTheme?: Theme
  /** Modo controlado: o aplicativo continua responsável por tema e persistência. */
  theme?: Theme
  barHeight?: number
  buttonSize?: number
  duration?: number
  /** Chamado uma vez, quando a cortina cobre a página e o tema pode mudar. */
  onThemeChange?: (theme: Theme) => void
  children?: ReactNode
  /** Permite conservar o botão e suas dimensões atuais na integração. */
  className?: string
}

type CurtainPhase = 'idle' | 'falling' | 'rising'
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

function initialTheme(fallback: Theme): Theme {
  const current =
    typeof document === 'undefined' ? undefined : document.documentElement.dataset.theme
  return current === 'dark' || current === 'light' ? current : fallback
}

export function ThemeToggle({
  variant = 'default',
  appBarProps,
  defaultTheme = 'light',
  theme: controlledTheme,
  barHeight,
  buttonSize,
  duration = 550,
  onThemeChange,
  children,
  className,
}: ThemeToggleProps) {
  const [localTheme, setLocalTheme] = useState<Theme>(() => initialTheme(defaultTheme))
  const theme = controlledTheme ?? localTheme
  const [phase, setPhase] = useState<CurtainPhase>('idle')
  const [targetTheme, setTargetTheme] = useState<Theme>(theme)
  const busy = useRef(false)
  const timers = useRef<number[]>([])
  const finishAnimation = useRef<(() => void) | null>(null)
  const advanceAnimation = useRef<(() => void) | null>(null)
  const animationDuration = Number.isFinite(duration) ? Math.max(0, duration) : 550

  const clearTimers = useCallback(() => {
    timers.current.forEach(window.clearTimeout)
    timers.current = []
  }, [])

  useEffect(() => {
    const media = window.matchMedia?.(REDUCED_MOTION)
    const finishForReducedMotion = () => {
      if (media?.matches) finishAnimation.current?.()
    }
    const finishBeforePrint = () => finishAnimation.current?.()
    media?.addEventListener('change', finishForReducedMotion)
    window.addEventListener('beforeprint', finishBeforePrint)
    return () => {
      clearTimers()
      busy.current = false
      finishAnimation.current = null
      advanceAnimation.current = null
      media?.removeEventListener('change', finishForReducedMotion)
      window.removeEventListener('beforeprint', finishBeforePrint)
    }
  }, [clearTimers])

  const toggle = () => {
    // A trava síncrona também cobre cliques/teclas repetidos antes do próximo render.
    if (busy.current) return
    const next: Theme = theme === 'light' ? 'dark' : 'light'
    let committed = false
    const commit = () => {
      if (committed) return
      committed = true
      if (controlledTheme === undefined) {
        setLocalTheme(next)
        document.documentElement.dataset.theme = next
      }
      onThemeChange?.(next)
    }
    if (animationDuration === 0 || window.matchMedia?.(REDUCED_MOTION).matches) {
      commit()
      return
    }

    busy.current = true
    setTargetTheme(next)
    setPhase('falling')
    const finish = () => {
      clearTimers()
      commit()
      busy.current = false
      finishAnimation.current = null
      advanceAnimation.current = null
      setPhase('idle')
    }
    finishAnimation.current = finish
    const reveal = () => {
      clearTimers()
      commit()
      setPhase('rising')
      advanceAnimation.current = finish
      timers.current.push(window.setTimeout(finish, animationDuration + 120))
    }
    advanceAnimation.current = reveal
    // animationend sincroniza a troca com a cobertura real, não com o início
    // do clique. O prazo extra libera a UI se o navegador suprimir esse evento.
    timers.current.push(window.setTimeout(reveal, animationDuration + 120))
  }

  const button = (
    <button
      type="button"
      className={['adc-curtain-toggle', className || 'adc-curtain-toggle--standalone']
        .filter(Boolean)
        .join(' ')}
      style={buttonSize === undefined ? undefined : { width: buttonSize, height: buttonSize }}
      onClick={toggle}
      aria-label={theme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro'}
      aria-pressed={theme === 'dark'}
      aria-disabled={phase !== 'idle'}
    >
      {theme === 'light' ? (
        <Moon aria-hidden="true" size={17} strokeWidth={2} />
      ) : (
        <Sun aria-hidden="true" size={17} strokeWidth={2} />
      )}
    </button>
  )

  const curtain =
    phase !== 'idle' && typeof document !== 'undefined'
      ? createPortal(
          <div
            key={phase}
            className="adc-theme-curtain"
            data-phase={phase}
            data-target-theme={targetTheme}
            aria-hidden="true"
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget) advanceAnimation.current?.()
            }}
            style={{ '--adc-curtain-duration': `${animationDuration}ms` } as CSSProperties}
          />,
          document.body,
        )
      : null

  if (variant === 'icon') {
    return (
      <>
        {curtain}
        {button}
      </>
    )
  }

  return (
    <div
      className={`adc-curtain-page adc-curtain-page--${variant}`}
      data-theme={theme}
      style={
        {
          '--adc-curtain-bar-height': `${barHeight ?? (variant === 'appbar' ? 60 : 44)}px`,
        } as CSSProperties
      }
    >
      {curtain}
      <div className="adc-curtain-bar">
        {variant === 'appbar' ? (
          <>
            <div className="adc-curtain-bar__brand">
              {appBarProps?.logo}
              {appBarProps?.appName ? <strong>{appBarProps.appName}</strong> : null}
            </div>
            {appBarProps?.onSearch ? (
              <label className="adc-curtain-bar__search">
                <Search aria-hidden="true" size={16} />
                <input
                  type="search"
                  aria-label="Pesquisar"
                  placeholder="Pesquisar…"
                  onChange={(event) => appBarProps.onSearch?.(event.target.value)}
                />
              </label>
            ) : null}
            <div className="adc-curtain-bar__account">
              {appBarProps?.userName ? <span>{appBarProps.userName}</span> : null}
              {appBarProps?.userAvatar ?? <UserRound aria-hidden="true" size={18} />}
              {button}
            </div>
          </>
        ) : (
          button
        )}
      </div>
      {children}
    </div>
  )
}
