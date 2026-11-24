import { Pause, Play } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { AuthPageFrame } from './AuthPageFrame'
import './filing-desk.css'

const motionPreference = '(prefers-reduced-motion: reduce)'

function AboutAccess() {
  return (
    <aside className="filing-about" aria-label="Sobre esta página">
      <details>
        <summary>Sobre a plataforma</summary>
        <div className="filing-about__body">
          <h2>Avaliações de desempenho</h2>
          <p>
            Registre avaliações, acompanhe ciclos autorizados e consulte indicadores conforme o seu
            perfil.
          </p>
          <dl>
            <dt>Acesso por perfil</dt>
            <dd>As opções disponíveis respeitam as permissões da sua conta.</dd>
            <dt>Ambiente corporativo</dt>
            <dd>Informações e rotinas reunidas em um único lugar.</dd>
          </dl>
          <p>A disponibilidade de cada recurso é verificada após o login.</p>
        </div>
      </details>
    </aside>
  )
}

function FolderCover() {
  return (
    <div className="filing-cover" aria-hidden="true">
      <div className="filing-leaf filing-leaf--skills">
        <div className="filing-pleats" />
        <div className="filing-imprint">
          <span className="filing-compass" />
          <span className="filing-print-label">Competências</span>
        </div>
      </div>
      <div className="filing-leaf filing-leaf--feedback">
        <div className="filing-pleats" />
        <div className="filing-imprint">
          <span className="filing-print-label">Feedback</span>
          <div className="filing-annotation">
            <i />
            <i />
            <i />
          </div>
        </div>
      </div>
    </div>
  )
}

type FilingDeskProps = {
  children: ReactNode
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export function FilingDesk({ children, theme, onToggleTheme }: FilingDeskProps) {
  const [paused, setPaused] = useState(() => window.matchMedia?.(motionPreference).matches ?? false)
  const pauseLabel = paused ? 'Retomar animação' : 'Pausar animação'

  useEffect(() => {
    const media = window.matchMedia?.(motionPreference)
    const update = (event: MediaQueryListEvent) => setPaused(event.matches)
    media?.addEventListener('change', update)
    return () => media?.removeEventListener('change', update)
  }, [])

  return (
    <AuthPageFrame
      labelledBy="login-title"
      contentClassName="auth-layout--filing"
      theme={theme}
      onToggleTheme={onToggleTheme}
      headerAction={
        <button
          type="button"
          className="filing-pause"
          aria-label={pauseLabel}
          title={pauseLabel}
          onClick={() => setPaused((wasPaused) => !wasPaused)}
        >
          {paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
          <span>{paused ? 'Retomar' : 'Pausar'}</span>
        </button>
      }
      footerStart={<AboutAccess />}
    >
      <div className="filing-desk" data-paused={paused}>
        <FolderCover />
        <div className="filing-folder">
          <div className="filing-back filing-back--feedback" aria-hidden="true">
            <span>Feedback</span>
          </div>
          <div className="filing-back filing-back--self" aria-hidden="true">
            <span>Autoavaliação</span>
          </div>
          <div className="filing-back filing-back--team" aria-hidden="true">
            <span>Equipe</span>
          </div>
          {children}
        </div>
      </div>
    </AuthPageFrame>
  )
}
