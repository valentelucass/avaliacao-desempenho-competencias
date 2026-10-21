import { createRoot } from 'react-dom/client'
import '@fontsource-variable/roboto/wght.css'
import '../../src/index.css'
import '../../src/App.css'
import '../../src/visual-skin.css'
import { HttpApiClient } from '../../src/api/client'
import { CycleAdministrationPanel } from '../../src/features/administration/CycleAdministrationPanel'

// O servidor HTTP exclusivo do ensaio responde somente com registros fictícios.
createRoot(document.getElementById('root')!).render(
  <div className="application-shell">
    <main className="workspace">
      <div className="workspace__content">
        <CycleAdministrationPanel
          api={new HttpApiClient()}
          permissions={['CICLOS.GERIR']}
          onSessionExpired={() => {
            throw new Error('Unexpected authentication in synthetic cycle fixture')
          }}
        />
      </div>
    </main>
  </div>,
)
