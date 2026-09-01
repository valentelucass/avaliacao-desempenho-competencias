import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Pagination } from './Pagination'
import { useClientPagination } from './useClientPagination'

describe('Pagination', () => {
  it('navega entre páginas e anuncia o intervalo visível', () => {
    function Example() {
      const [page, setPage] = useState(1)
      return (
        <Pagination
          currentPage={page}
          hasNextPage={page < 2}
          itemCountOnPage={page === 1 ? 12 : 2}
          itemLabel="registros"
          onNextPage={() => setPage(2)}
          onPreviousPage={() => setPage(1)}
        />
      )
    }

    render(<Example />)

    expect(screen.getByText('Página 1 · 12 registros exibidos')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
    expect(screen.getByText('Página 2 · 2 registros exibidos')).toBeInTheDocument()
    expect(screen.getByText('2')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('navigation', { name: 'Paginação de registros' })).toHaveAttribute(
      'aria-busy',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled()
  })

  it('divide listas locais sem permitir uma página fora do intervalo', () => {
    function Example() {
      const pagination = useClientPagination(['Registro 1', 'Registro 2', 'Registro 3'], 2)
      return (
        <>
          <p>{pagination.items.join(', ')}</p>
          <Pagination
            currentPage={pagination.currentPage}
            hasNextPage={pagination.hasNextPage}
            itemCountOnPage={pagination.items.length}
            itemLabel="registros"
            onNextPage={pagination.onNextPage}
            onPreviousPage={pagination.onPreviousPage}
            totalPages={pagination.totalPages}
          />
        </>
      )
    }

    render(<Example />)

    expect(screen.getByText('Registro 1, Registro 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
    expect(screen.getByText('Registro 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Próxima página' })).toBeDisabled()
  })
})
