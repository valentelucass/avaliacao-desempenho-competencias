import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Pagination } from './Pagination'

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
  })
})
