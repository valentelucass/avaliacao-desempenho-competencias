import type { ReactNode } from 'react'
import { Moon, Sun } from 'lucide-react'
import { BrandLogo } from '../../ui/BrandLogo'

type Theme = 'light' | 'dark'

type AuthPageFrameProps = {
  children: ReactNode
  contentClassName?: string
  labelledBy: string
  onToggleTheme: () => void
  theme: Theme
}

/** Estrutura compacta e compartilhada das jornadas sem sessão autenticada. */
export function AuthPageFrame({
  children,
  contentClassName,
  labelledBy,
  onToggleTheme,
  theme,
}: AuthPageFrameProps) {
  return (
    <main
      className="application-shell application-shell--narrow auth-page"
      aria-labelledby={labelledBy}
    >
      <header className="auth-page__header">
        <BrandLogo className="brand-logo auth-page__logo" />
        <button
          aria-label={theme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro'}
          aria-pressed={theme === 'dark'}
          className="icon-button theme-toggle"
          onClick={onToggleTheme}
          type="button"
        >
          {theme === 'light' ? (
            <Moon aria-hidden="true" size={17} strokeWidth={2} />
          ) : (
            <Sun aria-hidden="true" size={17} strokeWidth={2} />
          )}
        </button>
      </header>

      <div className={`auth-layout${contentClassName ? ` ${contentClassName}` : ''}`}>
        {children}
      </div>

      <footer className="application-footer auth-page__footer">
        <p>
          Todos os direitos reservados à Rodogarcia. Desenvolvido por{' '}
          <a href="https://www.linkedin.com/in/dev-lucasandrade/" target="_blank" rel="noreferrer">
            <strong>Lucas Andrade</strong>
          </a>
        </p>
      </footer>
    </main>
  )
}
