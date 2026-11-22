import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Menu, Sun } from 'lucide-react'
import '@fontsource-variable/roboto/wght.css'
import '../../src/index.css'
import '../../src/App.css'
import '../../src/visual-skin.css'
import '@fontsource-variable/figtree'
import '@astryxdesign/core/astryx.css'
import '@astryxdesign/theme-neutral/theme.css'
import '../../src/evaluation-astryx.css'
import { WorkspaceHeaderHost } from '../../src/ui/workspaceHeaderHost'
import { AssessmentsPanel } from '../../src/features/assessments/AssessmentsPanel'
import { HttpApiClient } from '../../src/api/client'

// Tela e transporte reais; o servidor exclusivo do ensaio atende somente dados fictícios.
const assessments = (
  <AssessmentsPanel
    api={new HttpApiClient()}
    canCreateManagerAssessment={false}
    canCreateDirectorAssessment={true}
    canCreateSelfAssessment={true}
    canSubmitSelfAssessment={true}
    canPublishAssessments={true}
    canReopenAssessments={true}
    canRecordFeedback={true}
    isAdministrativeView={true}
    canUseAdministrativeFilters={false}
    canExportAssessments={true}
    onExitEditor={() => {}}
    onSelectAssessment={() => {}}
    onSessionExpired={() => {
      throw new Error('Unexpected session expiry in export fixture')
    }}
  />
)

export default function CurrentLayout() {
  const [header, setHeader] = useState<HTMLElement | null>(null)
  return (
    <div className="application-shell ev-shell">
      <div className="ev-stage">
        <header className="ev-header">
          <div className="ev-header-slot" ref={setHeader} />
        </header>
        <main className="workspace ev-workspace">
          <div className="workspace__content">
            <WorkspaceHeaderHost.Provider value={header}>
              {assessments}
            </WorkspaceHeaderHost.Provider>
          </div>
        </main>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  document.documentElement.dataset.astryxTheme === 'neutral' ? (
    <CurrentLayout />
  ) : (
    <div className="application-shell">
      <header className="application-header">
        <div className="application-header__content">
          <div className="brand-lockup">
            <button type="button" className="brand-home-link" aria-label="Ir para o início">
              <img alt="Rodogarcia" className="brand-logo" src="/logo.png" />
            </button>
            <span aria-hidden="true" className="brand-lockup__divider" />
            <div className="application-header__title">
              <p className="eyebrow">Painel interno</p>
              <h1 id="page-title">Avaliação de desempenho</h1>
            </div>
          </div>
          <div className="application-header__actions">
            <button type="button" className="icon-button theme-toggle" aria-label="Alterar tema">
              <Sun size={20} />
            </button>
            <button
              type="button"
              className="icon-button application-header__menu"
              aria-label="Abrir menu"
            >
              <Menu size={20} />
            </button>
          </div>
        </div>
      </header>
      <main>{assessments} </main>
    </div>
  ),
)
