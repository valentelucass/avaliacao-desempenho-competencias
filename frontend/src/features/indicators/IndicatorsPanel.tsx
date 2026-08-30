import { useEffect, useId, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { BarChart3, Download, Filter } from 'lucide-react'
import { isAuthenticationError } from '../../api/client'
import type { ApiClient } from '../../api/client'
import type {
  AvailableIndicatorResponse,
  IndicatorExport,
  IndicatorFilterOption,
  IndicatorFilterOptions,
  IndicatorMetric,
  IndicatorQuery,
  IndicatorResponse,
  PopulationDimension,
} from '../../api/contracts'
import { FeedbackMessage } from '../../ui/Feedback'
import { Pagination } from '../../ui/Pagination'
import { safeErrorMessage } from '../../ui/safeErrorMessage'
import { useClientPagination } from '../../ui/useClientPagination'

type IndicatorsPanelProps = {
  api: ApiClient
  canExport: boolean
  onSessionExpired: () => void
}

const populationDimensions: readonly {
  value: PopulationDimension
  label: string
}[] = [
  { value: 'BRANCH', label: 'Filial' },
  { value: 'AREA', label: 'Área' },
  { value: 'MANAGER', label: 'Gestor' },
]

const indicatorMetrics: readonly {
  value: IndicatorMetric
  label: string
}[] = [
  { value: 'FINAL_SCORE_AVERAGE', label: 'Média da nota final' },
  { value: 'COMPETENCY_SCORE_AVERAGE', label: 'Média por competência' },
  { value: 'CLASSIFICATION_DISTRIBUTION', label: 'Distribuição por classificação' },
]

const emptyFilterOptions: IndicatorFilterOptions = {
  branches: [],
  areas: [],
  managers: [],
  competencies: [],
}

export function IndicatorsPanel({ api, canExport, onSessionExpired }: IndicatorsPanelProps) {
  const cycleId = useId()
  const metricId = useId()
  const dimensionId = useId()
  const dimensionValueId = useId()
  const competencyId = useId()
  const [cycles, setCycles] = useState<readonly { id: string; name: string }[]>([])
  const [selectedCycleId, setSelectedCycleId] = useState('')
  const [metric, setMetric] = useState<IndicatorMetric>('FINAL_SCORE_AVERAGE')
  const [populationDimension, setPopulationDimension] = useState<PopulationDimension>()
  const [populationValueId, setPopulationValueId] = useState('')
  const [competencyValueId, setCompetencyValueId] = useState('')
  const [filterOptions, setFilterOptions] = useState<IndicatorFilterOptions>(emptyFilterOptions)
  const [indicator, setIndicator] = useState<IndicatorResponse>()
  const [error, setError] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [isLoadingCycles, setIsLoadingCycles] = useState(true)
  const [isLoadingFilterOptions, setIsLoadingFilterOptions] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  useEffect(() => {
    let isCurrent = true

    async function loadCycles() {
      try {
        const availableCycles = await api.listAllCycles()
        if (isCurrent) {
          setCycles(availableCycles)
        }
      } catch (requestError) {
        if (isAuthenticationError(requestError)) {
          onSessionExpired()
          return
        }
        if (isCurrent) {
          setError(safeErrorMessage(requestError))
        }
      } finally {
        if (isCurrent) {
          setIsLoadingCycles(false)
        }
      }
    }

    void loadCycles()
    return () => {
      isCurrent = false
    }
  }, [api, onSessionExpired])

  useEffect(() => {
    if (!selectedCycleId) {
      return undefined
    }

    let isCurrent = true
    async function loadFilterOptions() {
      setIsLoadingFilterOptions(true)
      try {
        const options = await api.getIndicatorFilterOptions(selectedCycleId)
        if (isCurrent) {
          setFilterOptions(options)
        }
      } catch (requestError) {
        if (isAuthenticationError(requestError)) {
          onSessionExpired()
          return
        }
        if (isCurrent) {
          setFilterOptions(emptyFilterOptions)
          setError(safeErrorMessage(requestError))
        }
      } finally {
        if (isCurrent) {
          setIsLoadingFilterOptions(false)
        }
      }
    }

    // oxlint-disable-next-line react/set-state-in-effect -- Network loading is asynchronous.
    void loadFilterOptions()
    return () => {
      isCurrent = false
    }
  }, [api, onSessionExpired, selectedCycleId])

  function queryFromForm(): IndicatorQuery | null {
    if (!selectedCycleId) {
      setError('Selecione o ciclo de avaliação para consultar os indicadores.')
      return null
    }

    if (populationDimension && !populationValueId) {
      setError('Selecione a opção autorizada para a dimensão escolhida.')
      return null
    }

    const competencyIdValue = competencyValueId
    if (metric === 'COMPETENCY_SCORE_AVERAGE' && !competencyIdValue) {
      setError('Selecione a competência para consultar a média por competência.')
      return null
    }

    const query: IndicatorQuery = { cycleId: selectedCycleId, metric }
    if (metric === 'COMPETENCY_SCORE_AVERAGE') {
      query.competencyId = competencyIdValue
    }

    const populationValue = populationValueId
    if (populationDimension === 'BRANCH') {
      query.branchId = populationValue
    }
    if (populationDimension === 'AREA') {
      query.areaId = populationValue
    }
    if (populationDimension === 'MANAGER') {
      query.managerUserId = populationValue
    }

    return query
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = queryFromForm()
    if (!query) {
      return
    }

    setIsLoading(true)
    setError(undefined)
    setStatus(undefined)
    setIndicator(undefined)
    try {
      const response = await api.getIndicators(query)
      setIndicator(response)
      setStatus(
        isAvailable(response)
          ? 'Indicadores atualizados.'
          : 'Dados insuficientes para preservar a confidencialidade.',
      )
    } catch (requestError) {
      handleRequestError(requestError)
    } finally {
      setIsLoading(false)
    }
  }

  async function exportCsv() {
    const query = queryFromForm()
    if (!query || !indicator || !isAvailable(indicator)) {
      return
    }

    setIsExporting(true)
    setError(undefined)
    setStatus(undefined)
    try {
      const result = await api.exportIndicators(query)
      if (isIndicatorResponse(result)) {
        setIndicator(result)
        setStatus('Dados insuficientes para preservar a confidencialidade.')
        return
      }

      download(result)
      setStatus('Arquivo CSV agregado preparado para download.')
    } catch (requestError) {
      handleRequestError(requestError)
    } finally {
      setIsExporting(false)
    }
  }

  function handleRequestError(requestError: unknown) {
    if (isAuthenticationError(requestError)) {
      onSessionExpired()
      return
    }
    setError(safeErrorMessage(requestError))
  }

  function clearPopulationDimension() {
    setPopulationDimension(undefined)
    setPopulationValueId('')
  }

  function invalidateCurrentQuery() {
    setIndicator(undefined)
    setError(undefined)
    setStatus(undefined)
  }

  const canExportCsv = canExport && indicator !== undefined && isAvailable(indicator)
  const needsCompetency = metric === 'COMPETENCY_SCORE_AVERAGE'
  const populationOptions = optionsForPopulationDimension(filterOptions, populationDimension)

  return (
    <section aria-labelledby="indicators-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Dados agregados</p>
          <h2 id="indicators-title">Indicadores de avaliação</h2>
          <p className="muted">
            Somente grupos confidenciais são exibidos. Nenhuma contagem ou resultado individual é
            apresentado.
          </p>
        </div>
      </div>

      <form
        className="card filter-panel stack-form"
        onSubmit={handleSubmit}
        noValidate
        aria-busy={isLoading}
      >
        <div className="filter-panel__title">
          <Filter aria-hidden="true" size={18} strokeWidth={2} />
          <span>Filtros da consulta</span>
        </div>
        {error ? <FeedbackMessage kind="error">{error}</FeedbackMessage> : null}
        {status ? (
          <FeedbackMessage kind={indicator && !isAvailable(indicator) ? 'warning' : 'status'}>
            {status}
          </FeedbackMessage>
        ) : null}

        <div className="field">
          <label htmlFor={cycleId}>Ciclo de avaliação</label>
          <select
            id={cycleId}
            value={selectedCycleId}
            onChange={(event) => {
              setSelectedCycleId(event.target.value)
              clearPopulationDimension()
              setCompetencyValueId('')
              setFilterOptions(emptyFilterOptions)
              invalidateCurrentQuery()
            }}
            disabled={isLoadingCycles || isLoading || isLoadingFilterOptions}
            required
          >
            <option value="">Selecione um ciclo</option>
            {cycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>
                {cycle.name}
              </option>
            ))}
          </select>
          {isLoadingCycles ? <p className="field-hint">Carregando ciclos autorizados…</p> : null}
        </div>

        <div className="field">
          <label htmlFor={metricId}>Métrica</label>
          <select
            id={metricId}
            value={metric}
            onChange={(event) => {
              const selectedMetric = event.target.value as IndicatorMetric
              setMetric(selectedMetric)
              if (selectedMetric !== 'COMPETENCY_SCORE_AVERAGE') {
                setCompetencyValueId('')
              }
              invalidateCurrentQuery()
            }}
            disabled={isLoading}
            required
          >
            {indicatorMetrics.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="filter-fieldset" disabled={isLoading || isLoadingFilterOptions}>
          <legend>Dimensão populacional opcional</legend>
          <p className="field-hint">
            Escolha no máximo uma dimensão. Combinações são bloqueadas pelo servidor.
          </p>
          <div className="field">
            <label htmlFor={dimensionId}>Dimensão</label>
            <select
              id={dimensionId}
              value={populationDimension ?? ''}
              onChange={(event) => {
                const value = event.target.value as PopulationDimension | ''
                if (!value) {
                  clearPopulationDimension()
                  invalidateCurrentQuery()
                  return
                }
                setPopulationDimension(value)
                setPopulationValueId('')
                invalidateCurrentQuery()
              }}
            >
              <option value="">Sem dimensão adicional</option>
              {populationDimensions.map((dimension) => (
                <option key={dimension.value} value={dimension.value}>
                  {dimension.label}
                </option>
              ))}
            </select>
          </div>

          {populationDimension ? (
            <div className="field">
              <label htmlFor={dimensionValueId}>Opção autorizada</label>
              <select
                id={dimensionValueId}
                value={populationValueId}
                onChange={(event) => {
                  setPopulationValueId(event.target.value)
                  invalidateCurrentQuery()
                }}
                aria-describedby={`${dimensionValueId}-hint`}
                required
              >
                <option value="">Selecione uma opção</option>
                {populationOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="field-hint" id={`${dimensionValueId}-hint`}>
                {populationOptions.length === 0
                  ? 'Não há opções confidenciais disponíveis para esta dimensão neste ciclo.'
                  : 'As opções são filtradas pelo servidor para preservar a confidencialidade.'}
              </p>
            </div>
          ) : null}
        </fieldset>

        {needsCompetency ? (
          <div className="field">
            <label htmlFor={competencyId}>Competência</label>
            <select
              id={competencyId}
              value={competencyValueId}
              onChange={(event) => {
                setCompetencyValueId(event.target.value)
                invalidateCurrentQuery()
              }}
              disabled={isLoading || isLoadingFilterOptions}
              aria-describedby={`${competencyId}-hint`}
              required
            >
              <option value="">Selecione uma competência</option>
              {filterOptions.competencies.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="field-hint" id={`${competencyId}-hint`}>
              {filterOptions.competencies.length === 0
                ? 'Não há competências confidenciais disponíveis neste ciclo.'
                : 'A competência seleciona a métrica por competência; não altera a população.'}
            </p>
          </div>
        ) : null}

        <div className="action-row">
          <button
            className="button button--primary"
            type="submit"
            disabled={isLoading || isLoadingCycles || isLoadingFilterOptions}
          >
            <BarChart3 aria-hidden="true" size={17} strokeWidth={2} />
            {isLoading ? 'Consultando…' : 'Consultar indicadores'}
          </button>
          {canExportCsv ? (
            <button
              className="button"
              type="button"
              onClick={() => void exportCsv()}
              disabled={isExporting || isLoading}
            >
              <Download aria-hidden="true" size={17} strokeWidth={2} />
              {isExporting ? 'Preparando CSV…' : 'Exportar CSV agregado'}
            </button>
          ) : null}
        </div>
      </form>

      {indicator && isAvailable(indicator) ? <AvailableIndicators indicator={indicator} /> : null}
    </section>
  )
}

function AvailableIndicators({ indicator }: { indicator: AvailableIndicatorResponse }) {
  if (indicator.metric === 'CLASSIFICATION_DISTRIBUTION') {
    return <ClassificationDistribution distribution={indicator.classificationDistribution ?? []} />
  }

  const label =
    indicator.metric === 'COMPETENCY_SCORE_AVERAGE'
      ? 'Média da competência selecionada'
      : 'Média da nota final'

  return (
    <section className="card indicator-results" aria-labelledby="indicator-results-title">
      <div className="card-title-row">
        <h3 id="indicator-results-title">Resultado agregado</h3>
        <BarChart3 aria-hidden="true" size={19} strokeWidth={2} />
      </div>
      <dl className="metric-list">
        <div>
          <dt>{label}</dt>
          <dd className="metric-list__value">{formatDecimal(indicator.averageScore)}</dd>
        </div>
      </dl>
    </section>
  )
}

function ClassificationDistribution({
  distribution,
}: {
  distribution: NonNullable<AvailableIndicatorResponse['classificationDistribution']>
}) {
  const pagination = useClientPagination(distribution, 5)

  return (
    <section className="card indicator-results" aria-labelledby="indicator-results-title">
      <div className="card-title-row">
        <h3 id="indicator-results-title">Resultado agregado</h3>
        <BarChart3 aria-hidden="true" size={19} strokeWidth={2} />
      </div>
      <h4>Distribuição por classificação</h4>
      <table>
        <thead>
          <tr>
            <th scope="col">Classificação</th>
            <th scope="col">Percentual</th>
          </tr>
        </thead>
        <tbody>
          {pagination.items.map((item) => (
            <tr key={item.classification}>
              <th data-label="Classificação" scope="row">
                {item.classification}
              </th>
              <td data-label="Percentual">
                <span className="distribution-value">{formatPercentage(item.percentage)}</span>
                <span
                  aria-hidden="true"
                  className="distribution-bar"
                  style={{ '--distribution-width': `${item.percentage}%` } as CSSProperties}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination
        currentPage={pagination.currentPage}
        hasNextPage={pagination.hasNextPage}
        itemCountOnPage={pagination.items.length}
        itemLabel="classificações"
        onNextPage={pagination.onNextPage}
        onPreviousPage={pagination.onPreviousPage}
        totalPages={pagination.totalPages}
      />
    </section>
  )
}

function optionsForPopulationDimension(
  options: IndicatorFilterOptions,
  dimension: PopulationDimension | undefined,
): readonly IndicatorFilterOption[] {
  if (dimension === 'BRANCH') {
    return options.branches
  }
  if (dimension === 'AREA') {
    return options.areas
  }
  if (dimension === 'MANAGER') {
    return options.managers
  }
  return []
}

function isAvailable(indicator: IndicatorResponse): indicator is AvailableIndicatorResponse {
  return indicator.availability === 'AVAILABLE'
}

function isIndicatorResponse(
  result: IndicatorExport | IndicatorResponse,
): result is IndicatorResponse {
  return 'availability' in result
}

function download(exported: IndicatorExport) {
  const url = URL.createObjectURL(exported.content)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = exported.filename
  anchor.hidden = true
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function formatDecimal(value: number | undefined): string {
  if (typeof value !== 'number') {
    return 'Indisponível'
  }

  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value)
}

function formatPercentage(value: number): string {
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value)}%`
}
