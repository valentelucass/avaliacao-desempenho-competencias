import { Badge } from '@astryxdesign/core/Badge'
import { Card } from '@astryxdesign/core/Card'
import { Filter, ListChecks } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { isAuthenticationError, type ApiClient } from '../../api/client'
import type { AssessmentCoveragePage, AssessmentStartStatus } from '../../api/contracts'
import { ActionButton } from '../../ui/ActionButton'
import { EmptyState } from '../../ui/EmptyState'
import { FeedbackMessage } from '../../ui/Feedback'
import { Pagination } from '../../ui/Pagination'
import { safeLoadErrorMessage } from '../../ui/safeErrorMessage'
import {
  isReportingCycle,
  preferredReportingCycle,
  useReportingCycles,
} from '../../ui/useReportingCycles'
import './assessment-coverage.css'

const pageSize = 12

type Props = {
  api: ApiClient
  refreshRevision: number
  onClose: () => void
  onSelectAssessment: (assessmentId: string) => void
  onSessionExpired: () => void
}

export function AssessmentCoveragePanel({
  api,
  refreshRevision,
  onClose,
  onSelectAssessment,
  onSessionExpired,
}: Props) {
  const id = useId()
  const available = useReportingCycles(api, onSessionExpired)
  const cycles = available.cycles.filter(isReportingCycle)
  const [selectedCycleId, setSelectedCycleId] = useState('')
  const [status, setStatus] = useState<AssessmentStartStatus>('PENDENTE')
  const [name, setName] = useState('')
  const [filters, setFilters] = useState<{
    status: AssessmentStartStatus
    name: string
    page: number
  }>({
    status: 'PENDENTE',
    name: '',
    page: 1,
  })
  const cycleId = selectedCycleId || preferredReportingCycle(cycles)
  const [result, setResult] = useState<{
    key: string
    data?: AssessmentCoveragePage
    error?: string
  }>()
  const key = JSON.stringify([cycleId, refreshRevision, filters])
  const current = result?.key === key ? result : undefined
  const isLoading = available.isLoading || (Boolean(cycleId) && !current)

  useEffect(() => {
    if (!cycleId) return undefined

    let active = true
    void api
      .listAssessmentCoverage({
        cycleId,
        status: filters.status,
        evaluatedName: filters.name || undefined,
        page: filters.page,
        limit: pageSize,
      })
      .then(
        (data) => {
          if (active) setResult({ key, data })
        },
        (error: unknown) => {
          if (!active) return
          if (isAuthenticationError(error)) onSessionExpired()
          setResult({ key, error: safeLoadErrorMessage(error, 'o acompanhamento da avaliação') })
        },
      )
    return () => {
      active = false
    }
  }, [api, cycleId, filters, key, onSessionExpired])

  const error = available.error ?? current?.error
  const data = current?.data

  return (
    <section className="assessment-coverage" aria-labelledby={id + '-title'}>
      <Card className="assessment-coverage__filters" padding={4}>
        <div className="assessment-coverage__heading">
          <div className="ev-filter-heading">
            <ListChecks size={18} aria-hidden="true" />
            <h2 id={id + '-title'}>Acompanhamento do início</h2>
          </div>
          <ActionButton
            type="button"
            variant="secondary"
            size="sm"
            label="Voltar às avaliações"
            onClick={onClose}
          />
        </div>
        <p className="ev-hint">
          Consulte os colaboradores com questionário atribuído. Um rascunho de gestor ou Diretoria
          já conta como avaliação iniciada.
        </p>
        <form
          className="assessment-coverage__form"
          onSubmit={(event) => {
            event.preventDefault()
            setResult(undefined)
            setFilters({ status, name: name.trim(), page: 1 })
          }}
        >
          <div className="field">
            <label htmlFor={id + '-cycle'}>Ciclo da avaliação</label>
            <select
              id={id + '-cycle'}
              value={cycleId}
              disabled={available.isLoading || cycles.length === 0}
              onChange={(event) => {
                setSelectedCycleId(event.target.value)
                setFilters((currentFilters) => ({ ...currentFilters, page: 1 }))
              }}
            >
              {cycles.length === 0 && <option value="">Nenhum ciclo disponível</option>}
              {cycles.map((cycle) => (
                <option key={cycle.id} value={cycle.id}>
                  {cycle.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={id + '-status'}>Início da avaliação</label>
            <select
              id={id + '-status'}
              value={status}
              onChange={(event) =>
                setStatus(event.target.value === 'INICIADA' ? 'INICIADA' : 'PENDENTE')
              }
            >
              <option value="PENDENTE">Pendente</option>
              <option value="INICIADA">Iniciada</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor={id + '-name'}>Nome do colaborador</label>
            <input
              id={id + '-name'}
              type="search"
              maxLength={160}
              placeholder="Digite parte do nome"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <ActionButton
            type="submit"
            variant="primary"
            size="sm"
            icon={<Filter size={16} aria-hidden="true" />}
            label="Aplicar filtros"
            disabled={!cycleId}
          />
        </form>
      </Card>

      {isLoading && <FeedbackMessage kind="info">Carregando acompanhamento…</FeedbackMessage>}
      {error && <FeedbackMessage kind="error">{error}</FeedbackMessage>}
      {!isLoading && !error && (!data || data.items.length === 0) && (
        <EmptyState title={cycleId ? 'Nenhum colaborador encontrado' : 'Nenhum ciclo disponível'}>
          {cycleId
            ? 'Nenhum colaborador corresponde à situação e ao nome pesquisados neste ciclo.'
            : 'O acompanhamento fica disponível para ciclos abertos ou encerrados.'}
        </EmptyState>
      )}

      {data && data.items.length > 0 && (
        <Card className="assessment-coverage__results" padding={0}>
          <ul aria-label="Colaboradores por status de início">
            {data.items.map((item) => (
              <li key={item.collaboratorId}>
                <strong>{item.displayName}</strong>
                <Badge
                  className="dashboard-status-badge"
                  variant={item.assessmentId ? 'success' : 'warning'}
                  label={item.assessmentId ? 'Iniciada' : 'Pendente'}
                />
                {item.assessmentId && (
                  <ActionButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    label="Abrir avaliação"
                    onClick={() => {
                      if (item.assessmentId) onSelectAssessment(item.assessmentId)
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Pagination
        currentPage={filters.page}
        hasNextPage={data?.hasNextPage ?? false}
        itemCountOnPage={data?.items.length ?? 0}
        itemLabel="colaboradores"
        isLoading={isLoading}
        onNextPage={() =>
          setFilters((currentFilters) => ({ ...currentFilters, page: currentFilters.page + 1 }))
        }
        onPreviousPage={() =>
          setFilters((currentFilters) => ({ ...currentFilters, page: currentFilters.page - 1 }))
        }
      />
    </section>
  )
}
