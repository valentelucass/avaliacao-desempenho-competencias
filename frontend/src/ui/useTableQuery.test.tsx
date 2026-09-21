import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { useTableQuery } from './useTableQuery'
import { Pagination } from './Pagination'

const items = [
  { name: 'Zulu', status: 'Ativo', date: '2026-09-20', count: 10 },
  { name: 'Ágata', status: 'Ativo', date: '2026-09-19', count: 2 },
  { name: 'Bruna', status: 'Inativo', date: '2026-09-18', count: 1 },
  { name: 'João', status: 'Ativo', date: '2026-09-17', count: 20 },
]
function Fixture() {
  const table = useTableQuery(
    items,
    [
      { key: 'name', label: 'Nome', value: (item) => item.name },
      { key: 'status', label: 'Situação', value: (item) => item.status, kind: 'choice' },
      { key: 'date', label: 'Data', value: (item) => item.date, kind: 'date' },
      { key: 'count', label: 'Quantidade', value: (item) => item.count, kind: 'number' },
    ],
    2,
  )
  return (
    <>
      <table>
        <caption>Cadastros</caption>
        <thead>
          <tr>{table.headings()}</tr>
        </thead>
        <tbody>
          {table.emptyRow()}
          {table.items.map((item) => (
            <tr key={item.name}>
              <td>{item.name}</td>
              <td>{item.status}</td>
              <td>{item.date}</td>
              <td>{item.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination {...table} itemCountOnPage={table.items.length} itemLabel="cadastros" />
    </>
  )
}

describe('filtros e ordenação por coluna', () => {
  it('filtra em todas as páginas, ignora acentos e combina colunas antes da paginação', () => {
    render(<Fixture />)
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
    expect(screen.getByRole('cell', { name: 'Zulu' })).toBeVisible()
    fireEvent.change(screen.getByLabelText('Filtrar Nome'), { target: { value: 'AGATA' } })
    expect(screen.getByRole('cell', { name: 'Ágata' })).toBeVisible()
    expect(
      screen.queryByRole('navigation', { name: 'Paginação de cadastros' }),
    ).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Filtrar Situação'), { target: { value: 'Inativo' } })
    expect(screen.getByRole('status')).toHaveTextContent('Nenhum registro corresponde')
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtro Nome' }))
    expect(screen.getByRole('cell', { name: 'Bruna' })).toBeVisible()
  })

  it('ordena números e datas, alterna a direção e volta à primeira página', () => {
    render(<Fixture />)
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Quantidade: crescente' }))
    let body = screen.getByRole('table').querySelector('tbody')!
    expect(within(body).getAllByRole('row')[0]).toHaveTextContent('Bruna')
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Quantidade: decrescente' }))
    expect(within(body).getAllByRole('row')[0]).toHaveTextContent('João')
    fireEvent.change(screen.getByLabelText('Filtrar Data'), { target: { value: '2026-09-20' } })
    expect(within(body).getAllByRole('row')).toHaveLength(1)
    expect(within(body).getByRole('cell', { name: 'Zulu' })).toBeVisible()
  })

  it('mantém cabeçalhos, controles rotulados e sem violações axe', async () => {
    const { container } = render(<Fixture />)
    expect(container.querySelector('th[aria-sort="ascending"]')).toHaveTextContent('Nome')
    expect(
      (await axe(container, { rules: { 'color-contrast': { enabled: false } } })).violations,
    ).toEqual([])
  })
})
