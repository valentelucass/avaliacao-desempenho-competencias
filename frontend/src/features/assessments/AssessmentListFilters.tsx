import { useId, useState } from 'react'
import { Filter, RotateCcw } from 'lucide-react'
import type { AssessmentListRequest } from '../../api/contracts'
import './assessment-list-filters.css'

export type AssessmentFilters = Pick<
  AssessmentListRequest,
  'evaluatedName' | 'managerName' | 'status' | 'feedbackStatus'
>

export function AssessmentListFilters({ onApply }: { onApply: (filters: AssessmentFilters) => void }) {
  const id = useId()
  const [draft, setDraft] = useState<AssessmentFilters>({})

  return (
    <form
      className="card assessment-list-filters"
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
      <h3 id={`${id}-title`}>Filtrar avaliações</h3>
      <p className="muted" id={`${id}-help`}>
        Combine os filtros para pesquisar em todas as páginas autorizadas. O gestor é o avaliador
        responsável; autoavaliações não têm gestor avaliador.
      </p>
      <div className="assessment-list-filters__grid">
        <div className="field">
          <label htmlFor={`${id}-evaluated`}>Nome do Colaborador Avaliado</label>
          <input id={`${id}-evaluated`} type="search" maxLength={160}
            placeholder="Digite parte do nome" value={draft.evaluatedName ?? ''}
            onChange={(event) => setDraft({ ...draft, evaluatedName: event.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-manager`}>Nome do Gestor Responsável</label>
          <input id={`${id}-manager`} type="search" maxLength={160}
            aria-describedby={`${id}-help`} placeholder="Digite parte do nome"
            value={draft.managerName ?? ''}
            onChange={(event) => setDraft({ ...draft, managerName: event.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-status`}>Status da Avaliação</label>
          <select id={`${id}-status`} value={draft.status ?? ''}
            onChange={(event) => setDraft({ ...draft, status: event.target.value as AssessmentFilters['status'] || undefined })}>
            <option value="">Todos</option>
            <option value="RASCUNHO">Rascunho</option>
            <option value="ENVIADA">Enviada</option>
            <option value="PUBLICADA">Publicada</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-feedback`}>Status do Feedback</label>
          <select id={`${id}-feedback`} value={draft.feedbackStatus ?? ''}
            onChange={(event) => setDraft({ ...draft, feedbackStatus: event.target.value as AssessmentFilters['feedbackStatus'] || undefined })}>
            <option value="">Todos</option>
            <option value="PENDENTE">Pendente</option>
            <option value="CONCLUIDO">Concluído</option>
            <option value="NAO_APLICAVEL">Não aplicável</option>
          </select>
        </div>
      </div>
      <div className="assessment-list-filters__actions">
        <button className="button button--primary" type="submit">
          <Filter aria-hidden="true" size={18} /> Aplicar filtros
        </button>
        <button className="button" type="button" onClick={() => {setDraft({}); onApply({})}}>
          <RotateCcw aria-hidden="true" size={18} /> Limpar filtros
        </button>
      </div>
    </form>
  )
}
