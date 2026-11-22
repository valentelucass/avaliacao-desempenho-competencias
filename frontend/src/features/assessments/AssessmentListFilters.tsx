import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { Selector } from '@astryxdesign/core/Selector'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Filter, RotateCcw, Search } from 'lucide-react'
import type { AssessmentListRequest } from '../../api/contracts'
import './assessment-list-filters.css'

export type AssessmentFilters = Pick<
  AssessmentListRequest,
  'evaluatedName' | 'managerName' | 'status' | 'feedbackStatus'
>

function setNameLimit(input: HTMLInputElement | null) {
  if (input) input.maxLength = 160
}

export function AssessmentListFilters({
  onApply,
  appliedFilters,
  exportAction,
}: {
  onApply: (filters: AssessmentFilters) => void
  appliedFilters: AssessmentFilters
  exportAction?: ReactNode
}) {
  const id = useId()
  const [draft, setDraft] = useState<AssessmentFilters>(appliedFilters)

  return (
    <form
      className="ev-filter-form"
      aria-labelledby={`${id}-title`}
      onSubmit={(event) => {
        event.preventDefault()
        const filters = {
          ...draft,
          evaluatedName: draft.evaluatedName?.trim() || undefined,
          managerName: draft.managerName?.trim() || undefined,
        }
        setDraft(filters)
        onApply(filters)
      }}
    >
      <Card padding={4} className="ev-filter-card">
        <div className="ev-filter-heading">
          <Filter size={17} aria-hidden="true" />
          <Heading level={3} id={`${id}-title`}>
            Filtrar avaliações
          </Heading>
        </div>
        <p className="ev-hint" id={`${id}-help`}>
          Combine os filtros para pesquisar em todas as páginas autorizadas. O gestor é o avaliador
          responsável; autoavaliações não têm gestor avaliador.
        </p>
        <div className="ev-filter-fields">
          <TextInput
            label="Nome do Colaborador Avaliado"
            type="search"
            ref={setNameLimit}
            aria-describedby={`${id}-help`}
            placeholder="Digite parte do nome"
            startIcon={<Search size={15} />}
            width="100%"
            value={draft.evaluatedName ?? ''}
            onChange={(value) => setDraft({ ...draft, evaluatedName: value })}
          />
          <TextInput
            label="Nome do Gestor Responsável"
            type="search"
            ref={setNameLimit}
            aria-describedby={`${id}-help`}
            placeholder="Digite parte do nome"
            startIcon={<Search size={15} />}
            width="100%"
            value={draft.managerName ?? ''}
            onChange={(value) => setDraft({ ...draft, managerName: value })}
          />
          <Selector
            label="Status da Avaliação"
            width="100%"
            value={draft.status ?? 'TODOS'}
            options={assessmentStatuses}
            onChange={(value) =>
              setDraft({
                ...draft,
                status: value === 'TODOS' ? undefined : (value as AssessmentFilters['status']),
              })
            }
          />
          <Selector
            label="Status do Feedback"
            width="100%"
            value={draft.feedbackStatus ?? 'TODOS'}
            options={feedbackStatuses}
            onChange={(value) =>
              setDraft({
                ...draft,
                feedbackStatus:
                  value === 'TODOS' ? undefined : (value as AssessmentFilters['feedbackStatus']),
              })
            }
          />
        </div>
        <div className="ev-filter-actions">
          <Button
            variant="primary"
            size="sm"
            type="submit"
            label="Aplicar filtros"
            icon={<Filter size={16} />}
          />
          <Button
            variant="secondary"
            size="sm"
            label="Limpar filtros"
            icon={<RotateCcw size={16} />}
            onClick={() => {
              setDraft({})
              onApply({})
            }}
          />
          {exportAction}
        </div>
      </Card>
    </form>
  )
}

const assessmentStatuses = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'RASCUNHO', label: 'Rascunho' },
  { value: 'ENVIADA', label: 'Enviada' },
  { value: 'PUBLICADA', label: 'Publicada' },
]
const feedbackStatuses = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'CONCLUIDO', label: 'Concluído' },
  { value: 'NAO_APLICAVEL', label: 'Não aplicável' },
]
