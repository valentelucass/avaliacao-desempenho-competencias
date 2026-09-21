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
export function useClientPagination<T>(
  items: readonly T[],
  pageSize: number,
  resetKey = '',
): ClientPagination<T> {
  const [requested, setRequested] = useState({ page: 1, key: resetKey })
  const requestedPage = requested.key === resetKey ? requested.page : 1
  if (requested.key !== resetKey) setRequested({ page: 1, key: resetKey })
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const currentPage = Math.min(requestedPage, totalPages)
  const firstItemIndex = (currentPage - 1) * pageSize

  return {
    currentPage,
    hasNextPage: currentPage < totalPages,
    items: items.slice(firstItemIndex, firstItemIndex + pageSize),
    onNextPage: () => setRequested({ page: Math.min(currentPage + 1, totalPages), key: resetKey }),
    onPreviousPage: () => setRequested({ page: Math.max(currentPage - 1, 1), key: resetKey }),
    totalPages,
  }
}
