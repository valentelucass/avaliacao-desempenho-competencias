import { Card } from '@astryxdesign/core/Card'
import { useId, useRef, useState, type CSSProperties } from 'react'
import type {
  IndicatorDashboardArea,
  IndicatorDashboardMetrics,
  IndicatorDashboardWeek,
} from '../../api/contracts'
import { Pagination } from '../../ui/Pagination'
import { ActionButton } from '../../ui/ActionButton'
import { useAccessibleDialog } from '../../ui/useAccessibleDialog'
import { formatPercent, integerFormat } from './indicatorDashboardFormat'

const columns = [
  { key: 'collaborators', label: 'Colaboradores', format: integerFormat.format },
  { key: 'assessments', label: 'Avaliações registradas', format: integerFormat.format },
  { key: 'averagePercent', label: 'Média da área', format: formatPercent },
  { key: 'finalizedPercent', label: 'Finalizadas', format: formatPercent },
  { key: 'feedbackPercent', label: 'Feedbacks realizados', format: formatPercent },
] as const
const areasPerPage = 6

export function IndicatorAreaSummary({
  areas,
  totals,
}: {
  areas: readonly IndicatorDashboardArea[]
  totals: IndicatorDashboardMetrics
}) {
  const id = useId()
  const [page, setPage] = useState(1)
  const start = (page - 1) * areasPerPage
  const areaPage = areas.slice(start, start + areasPerPage)

  return (
    <Card
      padding={4}
      className="indicator-dashboard__detail-card indicator-dashboard__area-summary"
    >
      <h2 id={id}>Resumo por área</h2>
      {areas.length === 0 ? (
        <p className="indicator-dashboard__empty-chart">
          Dados insuficientes para resumir as áreas.
        </p>
      ) : (
        <>
          <table aria-labelledby={id} className="indicator-area-table" role="table">
            <thead role="rowgroup">
              <tr role="row">
                <th scope="col" role="columnheader">
                  Área
                </th>
                {columns.map(({ key, label }) => (
                  <th key={key} scope="col" role="columnheader">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody role="rowgroup">
              {areaPage.map((area) => (
                <AreaRow key={area.label} values={area} label={area.label} />
              ))}
            </tbody>
            <tfoot role="rowgroup">
              <AreaRow values={totals} label="Total do ciclo" />
            </tfoot>
          </table>
          <Pagination
            currentPage={page}
            hasNextPage={start + areasPerPage < areas.length}
            itemCountOnPage={areaPage.length}
            itemLabel="áreas"
            totalPages={Math.ceil(areas.length / areasPerPage)}
            onNextPage={() => setPage((current) => current + 1)}
            onPreviousPage={() => setPage((current) => current - 1)}
            showItemCount={false}
          />
        </>
      )}
    </Card>
  )
}

function AreaRow({
  label,
  values,
}: {
  label: string
  values: Omit<IndicatorDashboardArea, 'label'>
}) {
  return (
    <tr role="row">
      <th role="rowheader" scope="row">
        {label}
      </th>
      {columns.map((column) => {
        const value = values[column.key]
        return (
          <td key={column.key} role="cell">
            <span className="indicator-area-table__mobile-label" aria-hidden="true">
              {column.label}
            </span>
            {value === null ? (
              <span aria-label="Dados insuficientes">—</span>
            ) : (
              column.format(value)
            )}
          </td>
        )
      })}
    </tr>
  )
}

const trendTicks = [100, 90, 80, 70, 60]
const minTrend = 60
const millisecondsPerWeek = 7 * 24 * 60 * 60 * 1000
const shortDate = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
})
const longDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' })

function trendY(value: number) {
  return (100 - value) * (100 / (100 - minTrend))
}

export function IndicatorEvolution({
  weeks,
  reference,
}: {
  weeks: readonly IndicatorDashboardWeek[]
  reference: number | null
}) {
  const id = useId()
  const [showAverages, setShowAverages] = useState(false)
  return (
    <>
      <Card padding={4} className="indicator-dashboard__detail-card">
        <h2 id={id}>Evolução da média geral</h2>
        {weeks.length === 0 ? (
          <p className="indicator-dashboard__empty-chart">
            Dados insuficientes para exibir a evolução semanal.
          </p>
        ) : (
          <>
            <figure className="indicator-trend" aria-labelledby={id}>
              <figcaption>Notas de gestores por semana de publicação.</figcaption>
              <TrendPlot weeks={weeks} reference={reference} />
            </figure>
            <div className="indicator-trend__action">
              <ActionButton
                label="Ver médias por semana"
                variant="secondary"
                size="sm"
                type="button"
                aria-haspopup="dialog"
                onClick={() => setShowAverages(true)}
              />
            </div>
          </>
        )}
      </Card>
      {showAverages && (
        <WeeklyAveragesDialog weeks={weeks} onClose={() => setShowAverages(false)} />
      )}
    </>
  )
}

function WeeklyAveragesDialog({
  weeks,
  onClose,
}: {
  weeks: readonly IndicatorDashboardWeek[]
  onClose: () => void
}) {
  const id = useId()
  const dialog = useRef<HTMLElement>(null)
  useAccessibleDialog({ dialogRef: dialog, isOpen: true, onRequestClose: onClose })

  return (
    <div
      className="account-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="card account-dialog indicator-trend-dialog"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
      >
        <h2 id={id} tabIndex={-1} data-dialog-initial-focus>
          Médias por semana
        </h2>
        <table aria-labelledby={id}>
          <thead>
            <tr>
              <th scope="col">Semana de</th>
              <th scope="col">Média</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map(({ weekStart, averagePercent }) => (
              <tr key={weekStart}>
                <th scope="row">
                  <time dateTime={weekStart}>{longDate.format(new Date(weekStart))}</time>
                </th>
                <td>{formatPercent(averagePercent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="indicator-trend-dialog__actions">
          <ActionButton
            label="Fechar"
            variant="secondary"
            size="sm"
            type="button"
            onClick={onClose}
          />
        </div>
      </section>
    </div>
  )
}

function TrendPlot({
  weeks,
  reference,
}: {
  weeks: readonly IndicatorDashboardWeek[]
  reference: number | null
}) {
  const start = Date.parse(weeks[0].weekStart)
  const span = Date.parse(weeks[weeks.length - 1].weekStart) - start
  const points = weeks.map((week) => {
    const date = Date.parse(week.weekStart)
    return {
      ...week,
      date,
      x: span === 0 ? 50 : ((date - start) / span) * 100,
      y: trendY(week.averagePercent),
    }
  })
  const step = span === 0 ? 0 : (100 * millisecondsPerWeek) / span
  const gaps = points.slice(1).flatMap((point, index) => {
    const previous = points[index]
    return point.date - previous.date > millisecondsPerWeek
      ? [{ start: previous.x + step / 2, end: point.x - step / 2 }]
      : []
  })
  const line = points
    .map(({ x, y, date }, index) => {
      const previous = points[index - 1]
      return (previous && date - previous.date === millisecondsPerWeek ? 'L' : 'M') + x + ' ' + y
    })
    .join(' ')
  const tickCount = Math.min(4, points.length)
  const labelIndices = new Set(
    Array.from({ length: tickCount }, (_, index) =>
      Math.round((index * (points.length - 1)) / Math.max(1, tickCount - 1)),
    ),
  )

  return (
    <>
      <div className="indicator-trend__graph" aria-hidden="true">
        <div className="indicator-trend__axis">
          {trendTicks.map((tick) => (
            <span key={tick} style={{ top: trendY(tick) + '%' }}>
              {tick}%
            </span>
          ))}
        </div>
        <div className="indicator-trend__plot">
          {gaps.map(({ start, end }) => (
            <span
              key={start}
              className="indicator-trend__gap"
              style={{ left: start + '%', width: end - start + '%' }}
            />
          ))}
          {trendTicks.map((tick) => (
            <span
              key={tick}
              className="indicator-trend__guide"
              style={{ top: trendY(tick) + '%' }}
            />
          ))}
          {reference !== null && (
            <span
              className="indicator-trend__guide indicator-trend__guide--reference"
              style={{ top: trendY(reference) + '%' }}
            />
          )}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
            <path d={line} vectorEffect="non-scaling-stroke" />
          </svg>
          {points.map(({ weekStart, x, y, date, averagePercent }) => (
            <span
              className="indicator-trend__point"
              key={weekStart}
              style={{ '--x': x + '%', '--y': y + '%' } as CSSProperties}
              title={shortDate.format(date) + ' · ' + formatPercent(averagePercent)}
            />
          ))}
          {points
            .filter((_, index) => labelIndices.has(index))
            .map(({ weekStart, x, date }) => (
              <span
                className="indicator-trend__date"
                key={weekStart}
                style={{ left: x + '%' }}
                data-edge={x === 0 ? 'start' : x === 100 ? 'end' : undefined}
              >
                {shortDate.format(date)}
              </span>
            ))}
        </div>
      </div>
      <div className="indicator-trend__legend">
        {reference !== null && (
          <p className="indicator-dashboard__legend">
            <span aria-hidden="true" /> Média do ciclo · {formatPercent(reference)}
          </p>
        )}
        {gaps.length > 0 && (
          <p className="indicator-dashboard__legend">
            <span className="indicator-trend__gap-key" aria-hidden="true" /> Sem média disponível na
            semana
          </p>
        )}
      </div>
    </>
  )
}
