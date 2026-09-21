import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const pageTransitionDurationMs = 220

type PaginationProps = {
  currentPage: number
  hasNextPage: boolean
  isLoading?: boolean
  itemCountOnPage: number
  itemLabel: string
  onNextPage: () => void
  onPreviousPage: () => void
  showItemCount?: boolean
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
  showItemCount = true,
  totalPages,
}: PaginationProps) {
  const [isTransitioning, setIsTransitioning] = useState(false)
  const paginationRef = useRef<HTMLElement>(null)
  const anchorTopRef = useRef<number | undefined>(undefined)
  const isBusy = isLoading || isTransitioning
  // Em uma resposta cursorizada antiga, a última página ainda permite inferir o máximo.
  const maximumPage = totalPages ?? (!hasNextPage ? currentPage : undefined)

  function beginPageNavigation(onPageChange: () => void) {
    anchorTopRef.current = paginationRef.current?.getBoundingClientRect().top
    setIsTransitioning(true)
    onPageChange()
  }

  useLayoutEffect(() => {
    const pagination = paginationRef.current
    const anchorTop = anchorTopRef.current
    if (!isTransitioning || !pagination || anchorTop === undefined) {
      return
    }

    const offset = pagination.getBoundingClientRect().top - anchorTop
    if (Math.abs(offset) > 1 && typeof window.scrollBy === 'function') {
      window.scrollBy({ top: offset, behavior: 'auto' })
    }
    anchorTopRef.current = pagination.getBoundingClientRect().top
  }, [currentPage, isLoading, isTransitioning, itemCountOnPage])

  useEffect(() => {
    if (!isTransitioning || isLoading) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      anchorTopRef.current = undefined
      setIsTransitioning(false)
    }, pageTransitionDurationMs)
    return () => window.clearTimeout(timeoutId)
  }, [isLoading, isTransitioning])

  if (currentPage === 1 && !hasNextPage) {
    return null
  }

  return (
    <nav
      ref={paginationRef}
      aria-busy={isBusy}
      aria-label={`Paginação de ${itemLabel}`}
      className={`pagination${isTransitioning ? ' pagination--transitioning' : ''}`}
    >
      <span aria-live="polite" className="visually-hidden">
        {isTransitioning
          ? isLoading
            ? `Carregando página ${currentPage}.`
            : `Página ${currentPage} atualizada.`
          : ''}
      </span>
      <p className="pagination__summary">
        Página {currentPage}
        {maximumPage !== undefined ? ` de ${maximumPage}` : ''}
        {showItemCount ? ` · ${itemCountOnPage} ${itemLabel} exibidos` : ''}
      </p>
      <div className="pagination__controls">
        <button
          aria-label="Página anterior"
          className="icon-button"
          disabled={isBusy || currentPage === 1}
          onClick={() => beginPageNavigation(onPreviousPage)}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={18} strokeWidth={2} />
        </button>
        <span
          aria-current="page"
          className={`pagination__page${maximumPage !== undefined ? ' pagination__page--with-total' : ''}`}
        >
          {maximumPage !== undefined ? `${currentPage} / ${maximumPage}` : currentPage}
        </span>
        <button
          aria-label="Próxima página"
          className="icon-button"
          disabled={isBusy || !hasNextPage}
          onClick={() => beginPageNavigation(onNextPage)}
          type="button"
        >
          <ChevronRight aria-hidden="true" size={18} strokeWidth={2} />
        </button>
      </div>
    </nav>
  )
}
