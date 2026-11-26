import { Card } from '@astryxdesign/core/Card'
import {
  BadgeCheck,
  ClipboardList,
  MessageSquareCheck,
  Star,
  UserRoundCheck,
  UserRoundPen,
  Users,
} from 'lucide-react'
import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react'
import { isAuthenticationError, type ApiClient } from '../../api/client'
import type {
  EvaluationCycle,
  IndicatorDashboard as Dashboard,
  IndicatorDashboardPoint,
} from '../../api/contracts'
import { FeedbackMessage } from '../../ui/Feedback'
import { Pagination } from '../../ui/Pagination'
import { safeLoadErrorMessage } from '../../ui/safeErrorMessage'
import { preferredReportingCycle } from '../../ui/useReportingCycles'
import './indicator-dashboard.css'

const integerFormat = new Intl.NumberFormat('pt-BR')
const percentFormat = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const axisTicks = [100, 75, 50, 25, 0] as const
const barGrading = ['strong', 'medium', 'bright'] as const

type Props = {
  api: ApiClient
  cycles: readonly EvaluationCycle[]
  refreshRevision: number
  onSessionExpired: () => void
}

export function IndicatorDashboard({ api, cycles, refreshRevision, onSessionExpired }: Props) {
  const selectId = useId()
  const [selectedCycleId, setSelectedCycleId] = useState('')
  const cycleId = selectedCycleId || preferredReportingCycle(cycles)
  const [result, setResult] = useState<{ key: string; dashboard?: Dashboard; error?: string }>()
  const key = JSON.stringify([cycleId, refreshRevision])
  const current = result?.key === key ? result : undefined

  useEffect(() => {
    if (!cycleId) return undefined

    let active = true
    void api.getIndicatorDashboard(cycleId).then(
      (dashboard) => {
        if (active) setResult({ key, dashboard })
      },
      (error: unknown) => {
        if (!active) return
        if (isAuthenticationError(error)) onSessionExpired()
        setResult({ key, error: safeLoadErrorMessage(error, 'os indicadores') })
      },
    )
    return () => {
      active = false
    }
  }, [api, cycleId, key, onSessionExpired])

  if (!cycleId) {
    return (
      <FeedbackMessage kind="info">
        O painel fica disponível para ciclos abertos ou encerrados.
      </FeedbackMessage>
    )
  }

  return (
    <div className="indicator-dashboard" aria-busy={!current}>
      <Card padding={4} className="indicator-dashboard__toolbar">
        <div className="field">
          <label htmlFor={selectId}>Ciclo do painel</label>
          <select
            id={selectId}
            value={cycleId}
            onChange={(event) => setSelectedCycleId(event.target.value)}
          >
            {cycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>
                {cycle.name}
              </option>
            ))}
          </select>
        </div>
        <p>Os resultados são apresentados somente para grupos com dados suficientes.</p>
      </Card>
      {!current && <FeedbackMessage kind="info">Carregando indicadores do ciclo…</FeedbackMessage>}
      {current?.error && <FeedbackMessage kind="error">{current.error}</FeedbackMessage>}
      {current?.dashboard && <DashboardResults key={key} dashboard={current.dashboard} />}
    </div>
  )
}

function DashboardResults({ dashboard }: { dashboard: Dashboard }) {
  const { metrics, byBranch, byArea, byItem } = dashboard
  const hasData =
    Object.values(metrics).some((metric) => metric !== null) ||
    byBranch.length > 0 ||
    byArea.length > 0 ||
    byItem.length > 0

  return (
    <>
      {!hasData && (
        <FeedbackMessage kind="info">
          Dados insuficientes para preservar a confidencialidade neste ciclo.
        </FeedbackMessage>
      )}
      <dl
        className="indicator-dashboard__kpis indicator-dashboard__kpis--counts"
        aria-label="Totais do ciclo"
      >
        <Metric
          label="Total de colaboradores"
          value={metrics.collaborators}
          icon={<Users />}
          detail="Com questionário atribuído"
        />
        <Metric
          label="Total de avaliações"
          value={metrics.assessments}
          icon={<ClipboardList />}
          detail="Rascunhos, enviadas e publicadas"
        />
        <Metric
          label="Total de gestores avaliadores"
          value={metrics.managers}
          icon={<UserRoundCheck />}
          detail="Gestores com avaliações iniciadas"
        />
        <Metric
          label="Total de autoavaliações"
          value={metrics.managerSelfAssessments}
          icon={<UserRoundPen />}
          detail="Somente de gestores"
        />
      </dl>
      <dl
        className="indicator-dashboard__kpis indicator-dashboard__kpis--percent"
        aria-label="Resultados e andamento"
      >
        <Metric
          label="Média geral das avaliações"
          value={metrics.averagePercent}
          icon={<Star />}
          detail="Notas publicadas pelos gestores · escala de 120"
          percentage
        />
        <Metric
          label="Avaliações finalizadas"
          value={metrics.finalizedPercent}
          icon={<BadgeCheck />}
          detail="Publicadas sobre o total de avaliações"
          percentage
        />
        <Metric
          label="Feedbacks realizados"
          value={metrics.feedbackPercent}
          icon={<MessageSquareCheck />}
          detail="Concluídos entre os feedbacks aplicáveis"
          percentage
        />
      </dl>
      <div className="indicator-dashboard__charts">
        <ScoreChart
          title="Média geral por filial"
          points={byBranch}
          reference={metrics.averagePercent}
        />
        <ScoreChart
          title="Média geral por área"
          points={byArea}
          reference={metrics.averagePercent}
        />
        <ScoreChart title="Média geral por item da avaliação" points={byItem} horizontal />
      </div>
    </>
  )
}

function Metric({
  label,
  value,
  icon,
  detail,
  percentage = false,
}: {
  label: string
  value: number | null
  icon: ReactNode
  detail: string
  percentage?: boolean
}) {
  return (
    <Card padding={4} className="indicator-dashboard__metric">
      <dt>
        {label}
        <span className="indicator-dashboard__metric-icon" aria-hidden="true">
          {icon}
        </span>
      </dt>
      <dd>
        {value === null ? (
          <span aria-label="Dados insuficientes">—</span>
        ) : percentage ? (
          formatPercent(value)
        ) : (
          integerFormat.format(value)
        )}
      </dd>
      <dd className="indicator-dashboard__metric-detail">{detail}</dd>
    </Card>
  )
}

function ScoreChart({
  title,
  points,
  horizontal = false,
  reference = null,
}: {
  title: string
  points: readonly IndicatorDashboardPoint[]
  horizontal?: boolean
  reference?: number | null
}) {
  const id = useId()
  const [page, setPage] = useState(1)
  const pageSize = horizontal ? 7 : 5
  const pointsOnPage = points.slice((page - 1) * pageSize, page * pageSize)
  const hasData = points.length > 0
  return (
    <Card padding={4} className="indicator-dashboard__chart">
      <section aria-labelledby={id}>
        <h2 id={id}>{title}</h2>
        {!hasData ? (
          <p className="indicator-dashboard__empty-chart">
            Dados insuficientes para exibir este recorte.
          </p>
        ) : (
          <>
            {horizontal ? (
              <ol className="indicator-dashboard__horizontal-chart" aria-label="Médias de 0 a 100%">
                {pointsOnPage.map((point, index) => (
                  <li key={point.label + index}>
                    <span className="indicator-dashboard__item-label" title={point.label}>
                      {point.label}
                    </span>
                    <span className="indicator-dashboard__track" aria-hidden="true">
                      <span style={scoreStyle(point.averagePercent)} />
                    </span>
                    <strong>{formatPercent(point.averagePercent)}</strong>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="indicator-dashboard__vertical-chart">
                <div className="indicator-dashboard__axis" aria-hidden="true">
                  {axisTicks.map((tick) => (
                    <span key={tick} style={scoreStyle(tick)}>
                      {tick}
                    </span>
                  ))}
                </div>
                <div className="indicator-dashboard__bar-plot">
                  <div className="indicator-dashboard__gridlines" aria-hidden="true">
                    {axisTicks.map((tick) => (
                      <span key={tick} style={scoreStyle(tick)} />
                    ))}
                    {reference !== null && (
                      <span
                        className="indicator-dashboard__reference"
                        style={scoreStyle(reference)}
                      />
                    )}
                  </div>
                  <ol aria-label="Médias de 0 a 100%">
                    {pointsOnPage.map((point, index) => (
                      <li key={point.label + index}>
                        <div
                          className="indicator-dashboard__bar-cell"
                          style={scoreStyle(point.averagePercent)}
                        >
                          <span
                            className="indicator-dashboard__bar"
                            data-tone={barGrading[index % barGrading.length]}
                            aria-hidden="true"
                          />
                          <strong>{formatPercent(point.averagePercent)}</strong>
                        </div>
                        <span className="indicator-dashboard__group-label" title={point.label}>
                          {point.label}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
            {!horizontal && reference !== null && (
              <p className="indicator-dashboard__legend">
                <span aria-hidden="true" /> Média geral · {formatPercent(reference)}
              </p>
            )}
            <Pagination
              currentPage={page}
              hasNextPage={page * pageSize < points.length}
              itemCountOnPage={pointsOnPage.length}
              itemLabel={title.toLowerCase()}
              totalPages={Math.ceil(points.length / pageSize)}
              onNextPage={() => setPage((previous) => previous + 1)}
              onPreviousPage={() => setPage((previous) => previous - 1)}
              showItemCount={false}
            />
          </>
        )}
      </section>
    </Card>
  )
}

function formatPercent(value: number) {
  return percentFormat.format(value / 100)
}

function scoreStyle(percentage: number): CSSProperties {
  return { '--score': percentage + '%' } as CSSProperties
}
