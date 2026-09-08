// Entrada exclusiva do ensaio Edge; não faz parte da SPA nem acessa API/storage.
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeToggle, type Theme } from '../../src/components/ui/curtain-theme-toggle'
import { AdministrativeTable } from '../../src/components/ui/administrative-table'
import { RelationshipTableFixture } from './relationship-table'

export default function Fixture() {
  const [theme, setTheme] = useState<Theme>('light')
  const [show, setShow] = useState(true)
  const [changes, setChanges] = useState(0)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  return (
    <div className="application-shell">
      <header className="application-header">
        <div className="application-header__content">
          <h1>Ensaio fictício de tema</h1>
          {show ? (
            <ThemeToggle
              variant="icon"
              className="icon-button theme-toggle"
              theme={theme}
              duration={300}
              onThemeChange={(next) => {
                setTheme(next)
                setChanges((value) => value + 1)
              }}
            />
          ) : null}
        </div>
      </header>
      <main className="card">
        <label>
          Campo preservado
          <input defaultValue="Texto fictício não enviado" />
        </label>
        <button type="button" id="unmount-toggle" onClick={() => setShow(false)}>
          Sair do exemplo
        </button>
        <output aria-label="Mudanças de tema">{changes}</output>
        <div className="administration-users">
          <AdministrativeTable>
            <caption>Tabela fictícia</caption>
            <AdministrativeTable.Head>
              <AdministrativeTable.Row>
                <AdministrativeTable.Heading scope="col">Nome</AdministrativeTable.Heading>
              </AdministrativeTable.Row>
            </AdministrativeTable.Head>
            <AdministrativeTable.Body>
              <AdministrativeTable.Row>
                <AdministrativeTable.Cell data-label="Nome">
                  Registro de teste
                </AdministrativeTable.Cell>
              </AdministrativeTable.Row>
            </AdministrativeTable.Body>
          </AdministrativeTable>
        </div>
      </main>
      <RelationshipTableFixture />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Fixture />)
