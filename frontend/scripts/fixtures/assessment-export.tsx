import { createRoot } from 'react-dom/client'
import { Menu, Sun } from 'lucide-react'
import '@fontsource-variable/roboto/wght.css'
import '../../src/index.css'
import '../../src/App.css'
import '../../src/visual-skin.css'
import { AssessmentsPanel } from '../../src/features/assessments/AssessmentsPanel'
import { HttpApiClient } from '../../src/api/client'
import { BrandLogo } from '../../src/ui/BrandLogo'

// Tela e transporte reais; o servidor exclusivo do ensaio atende somente dados fictícios.
createRoot(document.getElementById('root')!).render(
  <div className="application-shell">
    <header className="application-header">
      <div className="application-header__content">
        <div className="brand-lockup">
          <button type="button" className="brand-home-link" aria-label="Ir para o início">
            <BrandLogo />
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
    <main>
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
    </main>
  </div>,
)
