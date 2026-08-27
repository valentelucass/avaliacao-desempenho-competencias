import { ChevronLeft, ChevronRight } from 'lucide-react'

type PaginationProps = {
  currentPage: number
  hasNextPage: boolean
  isLoading?: boolean
  itemCountOnPage: number
  itemLabel: string
  onNextPage: () => void
  onPreviousPage: () => void
  totalPages?: number
}

export function Pagination({
  currentPage,
  hasNextPage,
  isLoading = false,
  itemCountOnPage,
  itemLabel,
  onNextPage,
  onPreviousPage,
  totalPages,
}: PaginationProps) {
  if (currentPage === 1 && !hasNextPage) {
    return null
  }

  return (
    <nav className="pagination" aria-label={`Paginação de ${itemLabel}`}>
      <p className="pagination__summary">
        Página {currentPage}
        {totalPages !== undefined ? ` de ${totalPages}` : ''} · {itemCountOnPage} {itemLabel}{' '}
        exibidos
      </p>
      <div className="pagination__controls">
        <button
          aria-label="Página anterior"
          className="icon-button"
          disabled={isLoading || currentPage === 1}
          onClick={onPreviousPage}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={18} strokeWidth={2} />
        </button>
        <span
          aria-current="page"
          className={`pagination__page${totalPages !== undefined ? ' pagination__page--with-total' : ''}`}
        >
          {totalPages !== undefined ? `${currentPage} / ${totalPages}` : currentPage}
        </span>
        <button
          aria-label="Próxima página"
          className="icon-button"
          disabled={isLoading || !hasNextPage}
          onClick={onNextPage}
          type="button"
        >
          <ChevronRight aria-hidden="true" size={18} strokeWidth={2} />
        </button>
      </div>
    </nav>
  )
}
