import type { ReactNode } from 'react'
import { ThemeToggle } from '../../components/ui/curtain-theme-toggle'
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
        <ThemeToggle
          variant="icon"
          theme={theme}
          className="icon-button theme-toggle"
          onThemeChange={onToggleTheme}
        />
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
