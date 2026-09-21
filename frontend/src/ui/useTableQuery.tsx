import { useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useClientPagination } from './useClientPagination'
import './table-query.css'

export type TableColumn<T> = {
  key: string
  label: string
  value?: (item: T) => string | number | null | undefined
  sortValue?: (item: T) => string | number | null | undefined
  kind?: 'text' | 'date' | 'number' | 'choice'
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })
const normalize = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim()

/** Filtra e ordena o conjunto autorizado completo, antes de paginar. */
export function useTableQuery<T>(
  items: readonly T[],
  columns: readonly TableColumn<T>[],
  pageSize: number,
  initialSort = columns.find((column) => column.value)?.key ?? '',
  initialDirection: 'asc' | 'desc' = 'asc',
) {
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [sort, setSort] = useState({ key: initialSort, direction: initialDirection })
  const filtered = items.filter((item) =>
    columns.every((column) => {
      const filter = normalize(filters[column.key])
      if (!filter || !column.value) return true
      const value = normalize(column.value(item))
      if (column.kind === 'number')
        return value.replace(',', '.').includes(filter.replace(',', '.'))
      return column.kind === 'choice' || column.kind === 'date'
        ? value === filter
        : value.includes(filter)
    }),
  )
  const sortedColumn = columns.find((column) => column.key === sort.key)
  if (sortedColumn?.value) {
    const value = sortedColumn.sortValue ?? sortedColumn.value
    filtered.sort((a, b) => {
      const av = value(a)
      const bv = value(b)
      const comparison =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : collator.compare(String(av ?? ''), String(bv ?? ''))
      return sort.direction === 'asc' ? comparison : -comparison
    })
  }
  const pagination = useClientPagination(filtered, pageSize, JSON.stringify([filters, sort]))

  function headings() {
    return columns.map((column) => {
      if (!column.value)
        return (
          <th key={column.key} scope="col">
            {column.label}
          </th>
        )
      const selected = sort.key === column.key
      const Icon = !selected ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown
      return (
        <th
          key={column.key}
          scope="col"
          className="table-query-heading"
          aria-sort={selected ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
        >
          <button
            type="button"
            className="table-query-sort"
            aria-label={`Ordenar por ${column.label}: ${selected && sort.direction === 'asc' ? 'decrescente' : 'crescente'}`}
            onClick={() =>
              setSort({
                key: column.key,
                direction: selected && sort.direction === 'asc' ? 'desc' : 'asc',
              })
            }
          >
            <span>{column.label}</span>
            <Icon size={14} aria-hidden="true" />
          </button>
        </th>
      )
    })
  }

  function filterCells() {
    return columns.map((column) => {
      if (!column.value)
        return <td key={column.key} className="table-query-filter-cell--empty" aria-hidden="true" />

      const filter = filters[column.key] ?? ''
      const choices =
        column.kind === 'choice'
          ? Array.from(new Set(items.map((item) => String(column.value!(item) ?? '')))).sort(
              collator.compare,
            )
          : []
      return (
        <td key={column.key} className="table-query-filter-cell">
          <div className="table-query-filter">
            {column.kind === 'choice' ? (
              <select
                aria-label={`Filtrar ${column.label}`}
                value={filter}
                onChange={(event) =>
                  setFilters({ ...filters, [column.key]: event.currentTarget.value })
                }
              >
                <option value="">Todas</option>
                {choices.filter(Boolean).map((choice) => (
                  <option key={choice}>{choice}</option>
                ))}
              </select>
            ) : (
              <input
                aria-label={`Filtrar ${column.label}`}
                type={column.kind === 'date' ? 'date' : 'search'}
                placeholder="Filtrar…"
                value={filter}
                maxLength={160}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.preventDefault()
                }}
                onChange={(event) =>
                  setFilters({ ...filters, [column.key]: event.currentTarget.value })
                }
              />
            )}
          </div>
        </td>
      )
    })
  }

  function emptyRow() {
    return pagination.items.length === 0 ? (
      <tr>
        <td colSpan={columns.length} role="status">
          Nenhum registro corresponde aos filtros.
        </td>
      </tr>
    ) : null
  }
  return { ...pagination, headings, filterCells, emptyRow, filteredCount: filtered.length }
}
