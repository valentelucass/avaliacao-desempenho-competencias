import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { AdministrativeTable } from './administrative-table'
import Demo from './demo'

afterEach(() => {
  delete document.documentElement.dataset.theme
})

function Example({ disabled = false, onAction = () => {} }) {
  return (
    <div className="administration-users">
      <AdministrativeTable className="local-table" aria-describedby="table-description">
        <caption>Contas fictícias</caption>
        <AdministrativeTable.Head>
          <AdministrativeTable.Row>
            <AdministrativeTable.Heading scope="col">Nome</AdministrativeTable.Heading>
            <AdministrativeTable.Heading scope="col">Ação</AdministrativeTable.Heading>
          </AdministrativeTable.Row>
        </AdministrativeTable.Head>
        <AdministrativeTable.Body>
          <AdministrativeTable.Row>
            <AdministrativeTable.Cell data-label="Nome">Pessoa de teste</AdministrativeTable.Cell>
            <AdministrativeTable.Cell data-label="Ação">
              <button type="button" disabled={disabled} onClick={onAction}>
                Consultar
              </button>
            </AdministrativeTable.Cell>
          </AdministrativeTable.Row>
          <AdministrativeTable.Row className="pagination-placeholder" aria-hidden="true">
            <AdministrativeTable.Cell colSpan={2} />
          </AdministrativeTable.Row>
        </AdministrativeTable.Body>
      </AdministrativeTable>
      <p id="table-description">Dados exclusivamente fictícios.</p>
    </div>
  )
}

describe('AdministrativeTable', () => {
  it('preserva caption, estrutura nativa, classes, rótulos mobile e células mescladas', () => {
    render(<Example />)
    const table = screen.getByRole('table', { name: 'Contas fictícias' })
    expect(table).toHaveClass('local-table', 'adc-administrative-table')
    expect(table.firstElementChild?.tagName).toBe('CAPTION')
    expect(table.querySelector('thead + tbody')).not.toBeNull()
    expect(table).toHaveAccessibleDescription('Dados exclusivamente fictícios.')
    expect(within(table).getByRole('columnheader', { name: 'Nome' })).toHaveAttribute(
      'scope',
      'col',
    )
    expect(within(table).getByRole('cell', { name: 'Pessoa de teste' })).toHaveAttribute(
      'data-label',
      'Nome',
    )
    expect(table.querySelector('.pagination-placeholder')).toHaveAttribute('aria-hidden', 'true')
    expect(table.querySelector('.pagination-placeholder td')).toHaveAttribute('colspan', '2')
  })

  it('mantém linhas passivas e só aciona o botão habilitado', () => {
    const onAction = vi.fn()
    const { rerender } = render(<Example disabled onAction={onAction} />)
    expect(screen.getByRole('button', { name: 'Consultar' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }))
    expect(onAction).not.toHaveBeenCalled()
    for (const row of screen.getAllByRole('row')) expect(row).not.toHaveAttribute('tabindex')
    rerender(<Example onAction={onAction} />)
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }))
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('isola o tema Reshaped e acompanha a alternância de tema já existente', async () => {
    const { container, unmount } = render(<Example />)
    const scope = container.querySelector('[data-rs-root]')
    expect(scope).toHaveAttribute('data-rs-theme', 'slate')
    expect(scope).toHaveAttribute('data-rs-color-mode', 'light')
    expect(document.documentElement).not.toHaveAttribute('data-rs-theme')
    expect(document.documentElement).not.toHaveAttribute('data-rs-color-mode')
    await act(async () => {
      document.documentElement.dataset.theme = 'dark'
    })
    await waitFor(() => expect(scope).toHaveAttribute('data-rs-color-mode', 'dark'))
    unmount()
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(document.documentElement).not.toHaveAttribute('data-rs-theme')
  })

  it('não introduz violações automatizáveis de acessibilidade na tabela', async () => {
    const { container } = render(<Example />)
    const result = await axe(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(result.violations).toEqual([])
  })

  it('renderiza a demonstração com a tabela real e o cabeçalho mesclado solicitado', () => {
    render(<Demo />)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Column 2' })).toHaveAttribute('colspan', '2')
    expect(screen.getAllByRole('cell', { name: 'Cell 3' })).toHaveLength(2)
    expect(document.documentElement).not.toHaveAttribute('data-rs-theme')
  })
})
