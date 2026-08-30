import { useState } from 'react'

type ClientPagination<T> = {
  currentPage: number
  hasNextPage: boolean
  items: readonly T[]
  onNextPage: () => void
  onPreviousPage: () => void
  totalPages: number
}

/** Mantém a paginação visual local para listas já autorizadas pela API. */
export function useClientPagination<T>(items: readonly T[], pageSize: number): ClientPagination<T> {
  const [requestedPage, setRequestedPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const currentPage = Math.min(requestedPage, totalPages)
  const firstItemIndex = (currentPage - 1) * pageSize

  return {
    currentPage,
    hasNextPage: currentPage < totalPages,
    items: items.slice(firstItemIndex, firstItemIndex + pageSize),
    onNextPage: () => setRequestedPage((page) => Math.min(page + 1, totalPages)),
    onPreviousPage: () => setRequestedPage((page) => Math.max(page - 1, 1)),
    totalPages,
  }
}
