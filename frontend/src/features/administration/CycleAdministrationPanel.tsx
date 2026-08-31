import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CheckCircle2, Eye, Pencil, Plus, RefreshCw, XCircle } from 'lucide-react'
import { isAuthenticationError } from '../../api/client'
import type { ApiClient } from '../../api/client'
import type {
  ApprovedQuestionnaireVersion,
  AppliedCycleQuestionnaire,
  CycleQuestionnaireInput,
  DraftCycleConfiguration,
  EvaluationCycle,
  Permission,
} from '../../api/contracts'
import { FeedbackMessage } from '../../ui/Feedback'
import { EmptyState } from '../../ui/EmptyState'
import { ContextHelp } from '../../ui/ContextHelp'
import { Pagination } from '../../ui/Pagination'
import { safeErrorMessage } from '../../ui/safeErrorMessage'
import { useClientPagination } from '../../ui/useClientPagination'

type CycleAdministrationPanelProps = {
  api: ApiClient
  permissions: readonly Permission[]
  onSessionExpired: () => void
}

type CycleForm = {
  code: string
  name: string
  openingAtLocal: string
  closingAtLocal: string
  timeZone: string
  selfAssessmentEnabled: boolean
}

const emptyForm: CycleForm = {
  code: '',
  name: '',
  openingAtLocal: '',
  closingAtLocal: '',
  timeZone: 'America/Sao_Paulo',
  selfAssessmentEnabled: false,
}

/**
 * Cria e mantém somente a configuração de ciclos em rascunho. A abertura e o
 * encerramento continuam transições auditadas e validadas pela API.
 */
export function CycleAdministrationPanel({
  api,
  permissions,
  onSessionExpired,
}: CycleAdministrationPanelProps) {
  const codeId = useId()
  const nameId = useId()
  const openingId = useId()
  const closingId = useId()
  const timeZoneId = useId()
  const selfAssessmentId = useId()
  const [cycles, setCycles] = useState<readonly EvaluationCycle[]>([])
  const [versions, setVersions] = useState<readonly ApprovedQuestionnaireVersion[]>([])
  const [selectedCycle, setSelectedCycle] = useState<EvaluationCycle>()
  const [draft, setDraft] = useState<DraftCycleConfiguration>()
  const [appliedQuestionnaire, setAppliedQuestionnaire] = useState<AppliedCycleQuestionnaire>()
  const [form, setForm] = useState<CycleForm>(emptyForm)
  const [selectedOptionKeys, setSelectedOptionKeys] = useState<readonly string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingDraft, setIsLoadingDraft] = useState(false)
  const [isLoadingAppliedQuestionnaire, setIsLoadingAppliedQuestionnaire] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  const canManageCycles = permissions.includes('CICLOS.GERIR')
  const optionIndex = useMemo(
    () =>
      new Map(
        versions.flatMap((version) =>
          version.configurationOptions.map((option) => [
            optionKey(version.questionnaireVersionId, option),
            {
              questionnaireVersionId: version.questionnaireVersionId,
              calculationConfigurationVersionId: option.calculationConfigurationVersionId,
              classificationMatrixVersionId: option.classificationMatrixVersionId,
            } satisfies CycleQuestionnaireInput,
          ]),
        ),
      ),
    [versions],
  )
  const selectedQuestionnaires = useMemo(
    () =>
      selectedOptionKeys
        .map((key) => optionIndex.get(key))
        .filter((option): option is CycleQuestionnaireInput => option !== undefined),
    [optionIndex, selectedOptionKeys],
  )
  const cyclesPagination = useClientPagination(cycles, 10)
  const versionsPagination = useClientPagination(versions, 5)

  const loadData = useCallback(async () => {
    if (!canManageCycles) {
      return
    }

    setIsLoading(true)
    setError(undefined)
    try {
      const [loadedCycles, loadedVersions] = await Promise.all([
        api.listAllCycles(),
        api.listApprovedQuestionnaireVersions(),
      ])
      setCycles(loadedCycles)
      setVersions(loadedVersions)
    } catch (requestError) {
      if (isAuthenticationError(requestError)) {
        onSessionExpired()
        return
      }
      setError(safeErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [api, canManageCycles, onSessionExpired])

  useEffect(() => {
    if (!canManageCycles) {
      return
    }
    // oxlint-disable-next-line react/set-state-in-effect -- A leitura é assíncrona.
    void loadData()
  }, [canManageCycles, loadData])

  const resetForm = useCallback(() => {
    setSelectedCycle(undefined)
    setDraft(undefined)
    setAppliedQuestionnaire(undefined)
    setForm(emptyForm)
    setSelectedOptionKeys([])
    setError(undefined)
    setNotice(undefined)
  }, [])

  const selectCycle = useCallback(
    async (cycle: EvaluationCycle) => {
      setSelectedCycle(cycle)
      setDraft(undefined)
      setAppliedQuestionnaire(undefined)
      setError(undefined)
      setNotice(undefined)

      if (cycle.status !== 'RASCUNHO') {
        setForm(emptyForm)
        setSelectedOptionKeys([])
        return
      }

      setIsLoadingDraft(true)
      try {
        const loadedDraft = await api.getEvaluationCycleAdministrationDraft(cycle.id)
        setDraft(loadedDraft)
        setForm({
          code: loadedDraft.code,
          name: loadedDraft.name,
          openingAtLocal: loadedDraft.openingAtLocal,
          closingAtLocal: loadedDraft.closingAtLocal,
          timeZone: loadedDraft.timeZone,
          selfAssessmentEnabled: loadedDraft.selfAssessmentEnabled,
        })
        setSelectedOptionKeys(
          loadedDraft.questionnaires.map((questionnaire) =>
            optionKey(questionnaire.questionnaireVersionId, questionnaire),
          ),
        )
      } catch (requestError) {
        if (isAuthenticationError(requestError)) {
          onSessionExpired()
          return
        }
        setError(safeErrorMessage(requestError))
      } finally {
        setIsLoadingDraft(false)
      }
    },
    [api, onSessionExpired],
  )

  async function saveCycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canManageCycles) {
      return
    }

    const code = form.code.trim()
    const name = form.name.trim()
    setError(undefined)
    setNotice(undefined)
    if (!name || (!selectedCycle && !code)) {
      setError('Informe o código e o nome do ciclo.')
      return
    }
    if (!form.openingAtLocal || !form.closingAtLocal) {
      setError('Informe as datas de abertura e encerramento do ciclo.')
      return
    }
    if (form.openingAtLocal >= form.closingAtLocal) {
      setError('O encerramento deve ocorrer depois da abertura.')
      return
    }
    if (!form.timeZone.trim()) {
      setError('Informe o fuso horário do ciclo.')
      return
    }
    if (selectedQuestionnaires.length === 0) {
      setError('Selecione ao menos um questionário aprovado para o ciclo.')
      return
    }
    if (selectedQuestionnaires.length !== selectedOptionKeys.length) {
      setError('Uma configuração selecionada não está mais disponível. Atualize a tela.')
      return
    }

    const configuration = {
      name,
      openingAtLocal: form.openingAtLocal,
      closingAtLocal: form.closingAtLocal,
      timeZone: form.timeZone.trim(),
      selfAssessmentEnabled: form.selfAssessmentEnabled,
      questionnaires: selectedQuestionnaires,
    }

    setIsSaving(true)
    try {
      if (selectedCycle) {
        if (selectedCycle.status !== 'RASCUNHO') {
          setError('Somente um ciclo em rascunho pode ter a configuração alterada.')
          return
        }
        await api.replaceEvaluationCycle(selectedCycle.id, { configuration })
        await selectCycle(selectedCycle)
        setNotice('Configuração do ciclo em rascunho atualizada.')
      } else {
        const created = await api.createEvaluationCycle({ code, configuration })
        const newCycle: EvaluationCycle = { id: created.cycleId, name, status: 'RASCUNHO' }
        setCycles((currentCycles) => [newCycle, ...currentCycles])
        setSelectedCycle(newCycle)
        setDraft({
          cycleId: created.cycleId,
          code,
          ...configuration,
          questionnaires: created.questionnaires.map((questionnaire) => ({
            cycleQuestionnaireId: questionnaire.cycleQuestionnaireId,
            questionnaireVersionId: questionnaire.questionnaireVersionId,
            calculationConfigurationVersionId:
              selectedQuestionnaires.find(
                (selected) =>
                  selected.questionnaireVersionId === questionnaire.questionnaireVersionId,
              )?.calculationConfigurationVersionId ?? '',
            classificationMatrixVersionId:
              selectedQuestionnaires.find(
                (selected) =>
                  selected.questionnaireVersionId === questionnaire.questionnaireVersionId,
              )?.classificationMatrixVersionId ?? '',
          })),
        })
        setForm((currentForm) => ({ ...currentForm, code }))
        setNotice('Ciclo criado como rascunho. Revise-o antes de abrir.')
      }
    } catch (requestError) {
      if (isAuthenticationError(requestError)) {
        onSessionExpired()
        return
      }
      setError(safeErrorMessage(requestError))
    } finally {
      setIsSaving(false)
    }
  }

  async function transitionCycle(action: 'open' | 'close') {
    if (!selectedCycle || !canManageCycles) {
      return
    }
    const verb = action === 'open' ? 'abrir' : 'encerrar'
    if (!window.confirm(`Confirma ${verb} o ciclo “${selectedCycle.name}”?`)) {
      return
    }

    setError(undefined)
    setNotice(undefined)
    setIsTransitioning(true)
    try {
      if (action === 'open') {
        await api.openEvaluationCycle(selectedCycle.id)
      } else {
        await api.closeEvaluationCycle(selectedCycle.id)
      }
      const status = action === 'open' ? 'ABERTO' : 'ENCERRADO'
      const updatedCycle = { ...selectedCycle, status }
      setSelectedCycle(updatedCycle)
      setCycles((currentCycles) =>
        currentCycles.map((cycle) => (cycle.id === updatedCycle.id ? updatedCycle : cycle)),
      )
      setNotice(action === 'open' ? 'Ciclo aberto.' : 'Ciclo encerrado.')
    } catch (requestError) {
      if (isAuthenticationError(requestError)) {
        onSessionExpired()
        return
      }
      setError(safeErrorMessage(requestError))
    } finally {
      setIsTransitioning(false)
    }
  }

  async function viewAppliedQuestionnaire(cycleQuestionnaireId: string) {
    if (!selectedCycle) {
      return
    }

    setError(undefined)
    setNotice(undefined)
    setIsLoadingAppliedQuestionnaire(true)
    try {
      const loadedQuestionnaire = await api.getAppliedCycleQuestionnaire(
        selectedCycle.id,
        cycleQuestionnaireId,
      )
      setAppliedQuestionnaire(loadedQuestionnaire)
    } catch (requestError) {
      if (isAuthenticationError(requestError)) {
        onSessionExpired()
        return
      }
      setError(safeErrorMessage(requestError))
    } finally {
      setIsLoadingAppliedQuestionnaire(false)
    }
  }

  function toggleQuestionnaireOption(key: string, checked: boolean) {
    setSelectedOptionKeys((currentKeys) =>
      checked
        ? [...new Set([...currentKeys, key])]
        : currentKeys.filter((currentKey) => currentKey !== key),
    )
  }

  if (!canManageCycles) {
    return (
      <FeedbackMessage kind="error">
        Você não possui permissão para administrar ciclos de avaliação.
      </FeedbackMessage>
    )
  }

  return (
    <section aria-labelledby="cycle-administration-title" className="stack-form">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Administração de ciclos</p>
          <div className="context-help__heading">
            <h2 id="cycle-administration-title">Ciclos de avaliação</h2>
            <ContextHelp title="Como funciona o ciclo">
              <ul>
                <li>
                  <span>Rascunho: </span>
                  permite revisar a janela e os questionários aplicados.
                </li>
                <li>
                  <span>Aberto: </span>
                  permite criar avaliações dentro da vigência configurada.
                </li>
                <li>
                  <span>Encerrado: </span>
                  impede novas avaliações para aquele ciclo.
                </li>
              </ul>
              <p className="context-help__note">
                Versões aprovadas de questionário ficam vinculadas ao ciclo e não são alteradas.
              </p>
            </ContextHelp>
          </div>
          <p className="muted">
            Um ciclo usa versões aprovadas e imutáveis de questionário. A API valida o estado e
            registra cada alteração administrativa.
          </p>
        </div>
        <div className="action-row">
          <button
            className="button"
            type="button"
            disabled={isLoading}
            onClick={() => void loadData()}
          >
            <RefreshCw aria-hidden="true" size={17} strokeWidth={2} />
            Atualizar
          </button>
          <button className="button button--primary" type="button" onClick={resetForm}>
            <Plus aria-hidden="true" size={17} strokeWidth={2} />
            Novo ciclo
          </button>
        </div>
      </div>

      {error ? <FeedbackMessage kind="error">{error}</FeedbackMessage> : null}
      {notice ? <FeedbackMessage kind="status">{notice}</FeedbackMessage> : null}
      {isLoading ? (
        <FeedbackMessage kind="info">Carregando ciclos e versões aprovadas…</FeedbackMessage>
      ) : null}

      <section className="card" aria-labelledby="cycle-list-title">
        <h3 id="cycle-list-title">Ciclos disponíveis</h3>
        {!isLoading && cycles.length === 0 ? (
          <EmptyState className="empty-state--compact" title="Nenhum ciclo disponível">
            Ainda não há ciclos que esta conta possa consultar. Crie um ciclo para iniciar a
            configuração de questionários e jornadas.
          </EmptyState>
        ) : null}
        {cycles.length > 0 ? (
          <div className="administration-users">
            <table>
              <caption className="visually-hidden">Ciclos disponíveis</caption>
              <thead>
                <tr>
                  <th scope="col">Ciclo</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Ação</th>
                </tr>
              </thead>
              <tbody>
                {cyclesPagination.items.map((cycle) => (
                  <tr key={cycle.id}>
                    <td data-label="Ciclo">{cycle.name}</td>
                    <td data-label="Situação">
                      <span className={`status-badge status-badge--${cycle.status.toLowerCase()}`}>
                        {formatCycleStatus(cycle.status)}
                      </span>
                    </td>
                    <td data-label="Ação">
                      <div className="table-actions">
                        <button
                          className="button"
                          type="button"
                          onClick={() => void selectCycle(cycle)}
                          disabled={isLoadingDraft}
                        >
                          <Pencil aria-hidden="true" size={16} strokeWidth={2} />
                          {cycle.status === 'RASCUNHO' ? 'Configurar' : 'Consultar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              currentPage={cyclesPagination.currentPage}
              hasNextPage={cyclesPagination.hasNextPage}
              isLoading={isLoading || isLoadingDraft}
              itemCountOnPage={cyclesPagination.items.length}
              itemLabel="ciclos"
              onNextPage={cyclesPagination.onNextPage}
              onPreviousPage={cyclesPagination.onPreviousPage}
              totalPages={cyclesPagination.totalPages}
            />
          </div>
        ) : null}
      </section>

      <form
        className="card stack-form cycle-configuration-form"
        onSubmit={saveCycle}
        noValidate
        aria-busy={isSaving}
      >
        <div className="card-title-row">
          <div>
            <h3>{selectedCycle ? `Configuração: ${selectedCycle.name}` : 'Novo ciclo'}</h3>
            {selectedCycle && selectedCycle.status !== 'RASCUNHO' ? (
              <p className="muted">
                Ciclos abertos ou encerrados são apenas consultáveis nesta tela.
              </p>
            ) : (
              <p className="muted">Inclua ao menos uma combinação de questionário aprovada.</p>
            )}
          </div>
        </div>
        {isLoadingDraft ? (
          <FeedbackMessage kind="info">Carregando configuração do rascunho…</FeedbackMessage>
        ) : null}
        <div className="cycle-configuration-form__details-grid">
          <div className="field">
            <label htmlFor={codeId}>Código do ciclo</label>
            <input
              id={codeId}
              value={form.code}
              maxLength={100}
              disabled={Boolean(selectedCycle) || isLoadingDraft || isSaving}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor={nameId}>Nome do ciclo</label>
            <input
              id={nameId}
              value={form.name}
              maxLength={200}
              disabled={selectedCycle?.status !== undefined && selectedCycle.status !== 'RASCUNHO'}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor={timeZoneId}>Fuso horário</label>
            <input
              id={timeZoneId}
              value={form.timeZone}
              maxLength={100}
              disabled={selectedCycle?.status !== undefined && selectedCycle.status !== 'RASCUNHO'}
              onChange={(event) =>
                setForm((current) => ({ ...current, timeZone: event.target.value }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor={openingId}>Abertura</label>
            <input
              id={openingId}
              type="datetime-local"
              value={form.openingAtLocal}
              disabled={selectedCycle?.status !== undefined && selectedCycle.status !== 'RASCUNHO'}
              onChange={(event) =>
                setForm((current) => ({ ...current, openingAtLocal: event.target.value }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor={closingId}>Encerramento</label>
            <input
              id={closingId}
              type="datetime-local"
              value={form.closingAtLocal}
              disabled={selectedCycle?.status !== undefined && selectedCycle.status !== 'RASCUNHO'}
              onChange={(event) =>
                setForm((current) => ({ ...current, closingAtLocal: event.target.value }))
              }
            />
          </div>
          <label className="checkbox-field" htmlFor={selfAssessmentId}>
            <input
              id={selfAssessmentId}
              type="checkbox"
              checked={form.selfAssessmentEnabled}
              disabled={selectedCycle?.status !== undefined && selectedCycle.status !== 'RASCUNHO'}
              onChange={(event) =>
                setForm((current) => ({ ...current, selfAssessmentEnabled: event.target.checked }))
              }
            />
            Permitir autoavaliação neste ciclo
          </label>
        </div>

        <fieldset
          className="filter-fieldset"
          disabled={selectedCycle?.status !== undefined && selectedCycle.status !== 'RASCUNHO'}
        >
          <legend>Questionários aplicados</legend>
          {versions.length === 0 && !isLoading ? (
            <EmptyState className="empty-state--compact" title="Nenhuma versão aprovada">
              Não há versões aprovadas disponíveis para aplicar a um ciclo. Aprove um questionário
              antes de configurar este ciclo.
            </EmptyState>
          ) : (
            <div className="cycle-questionnaire-table">
              <table>
                <caption className="visually-hidden">
                  Questionários e configurações disponíveis para o ciclo
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Questionário</th>
                    <th scope="col">Versão</th>
                    <th scope="col">Configuração</th>
                    <th scope="col">Aplicar</th>
                  </tr>
                </thead>
                <tbody>
                  {versionsPagination.items.map((version) => (
                    <tr key={version.questionnaireVersionId}>
                      <td data-label="Questionário">
                        <strong>{version.questionnaireName}</strong>
                        <span className="cycle-questionnaire-table__title">{version.title}</span>
                      </td>
                      <td data-label="Versão">v{version.versionNumber}</td>
                      <td data-label="Configuração">
                        {version.configurationOptions.map((option) => (
                          <span
                            className="cycle-questionnaire-table__configuration"
                            key={optionKey(version.questionnaireVersionId, option)}
                          >
                            {formatConfigurationOption(option)}
                          </span>
                        ))}
                      </td>
                      <td data-label="Aplicar">
                        {version.configurationOptions.map((option) => {
                          const key = optionKey(version.questionnaireVersionId, option)
                          const configurationLabel = formatConfigurationOption(option)
                          return (
                            <label
                              className="cycle-questionnaire-table__selection"
                              htmlFor={key}
                              key={key}
                            >
                              <input
                                aria-label={configurationLabel}
                                id={key}
                                type="checkbox"
                                checked={selectedOptionKeys.includes(key)}
                                onChange={(event) =>
                                  toggleQuestionnaireOption(key, event.target.checked)
                                }
                              />
                              <span>Aplicar</span>
                            </label>
                          )
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                currentPage={versionsPagination.currentPage}
                hasNextPage={versionsPagination.hasNextPage}
                isLoading={isLoading || isLoadingDraft}
                itemCountOnPage={versionsPagination.items.length}
                itemLabel="questionários aprovados"
                onNextPage={versionsPagination.onNextPage}
                onPreviousPage={versionsPagination.onPreviousPage}
                totalPages={versionsPagination.totalPages}
              />
            </div>
          )}
        </fieldset>

        {selectedCycle?.status === 'RASCUNHO' || !selectedCycle ? (
          <div className="action-row">
            <button
              className="button button--success"
              type="submit"
              disabled={isSaving || isLoadingDraft}
            >
              <CheckCircle2 aria-hidden="true" size={17} strokeWidth={2} />
              {isSaving ? 'Salvando…' : selectedCycle ? 'Salvar configuração' : 'Criar ciclo'}
            </button>
          </div>
        ) : null}
      </form>

      {selectedCycle?.status === 'RASCUNHO' ? (
        <section className="card stack-form" aria-labelledby="cycle-transition-title">
          <h3 id="cycle-transition-title">Abrir ciclo</h3>
          <p className="muted">
            Ao abrir, a configuração do ciclo deixa de ser editável. Confirme somente após revisar a
            janela e os questionários aplicados.
          </p>
          <div className="action-row">
            <button
              className="button button--success"
              type="button"
              disabled={isTransitioning}
              onClick={() => void transitionCycle('open')}
            >
              <CheckCircle2 aria-hidden="true" size={17} strokeWidth={2} />
              {isTransitioning ? 'Processando…' : 'Abrir ciclo'}
            </button>
          </div>
        </section>
      ) : null}
      {selectedCycle?.status === 'ABERTO' ? (
        <section className="card stack-form" aria-labelledby="cycle-close-title">
          <h3 id="cycle-close-title">Encerrar ciclo</h3>
          <p className="muted">
            O encerramento impede novas avaliações. A API confirma a transição e a audita.
          </p>
          <div className="action-row">
            <button
              className="button button--danger"
              type="button"
              disabled={isTransitioning}
              onClick={() => void transitionCycle('close')}
            >
              <XCircle aria-hidden="true" size={17} strokeWidth={2} />
              {isTransitioning ? 'Processando…' : 'Encerrar ciclo'}
            </button>
          </div>
        </section>
      ) : null}
      {draft && selectedCycle ? (
        <section className="card stack-form" aria-labelledby="applied-questionnaire-title">
          <div className="card-title-row">
            <div>
              <h3 id="applied-questionnaire-title">Questionário aplicado</h3>
              <p className="muted">
                Consulte o conteúdo que ficará vinculado ao ciclo. Esta visualização não permite
                alterar perguntas, opções ou regras de cálculo.
              </p>
            </div>
          </div>
          <div className="action-row">
            {draft.questionnaires.map((questionnaire, index) => (
              <button
                className="button"
                disabled={isLoadingAppliedQuestionnaire}
                key={questionnaire.cycleQuestionnaireId}
                onClick={() => void viewAppliedQuestionnaire(questionnaire.cycleQuestionnaireId)}
                type="button"
              >
                <Eye aria-hidden="true" size={17} strokeWidth={2} />
                Visualizar questionário aplicado {index + 1}
              </button>
            ))}
          </div>
          {isLoadingAppliedQuestionnaire ? (
            <FeedbackMessage kind="info">Carregando questionário aplicado…</FeedbackMessage>
          ) : null}
          {appliedQuestionnaire ? (
            <section className="stack-form" aria-labelledby="applied-questionnaire-content-title">
              <div>
                <p className="eyebrow">{appliedQuestionnaire.questionnaireCode}</p>
                <h4 id="applied-questionnaire-content-title">
                  {appliedQuestionnaire.title} · versão{' '}
                  {appliedQuestionnaire.questionnaireVersionNumber}
                </h4>
              </div>
              {appliedQuestionnaire.competencies.map((competency) => (
                <section className="competency-card" key={competency.id}>
                  <h5>{competency.name}</h5>
                  <ol className="questionnaire-preview__questions">
                    {competency.questions.map((question) => (
                      <li key={question.id}>
                        <strong>{question.text}</strong>
                        {question.description ? <p>{question.description}</p> : null}
                        <p className="field-hint">
                          {question.required ? 'Resposta obrigatória' : 'Resposta opcional'}
                        </p>
                        <ul aria-label={`Opções de resposta para ${question.text}`}>
                          {question.options.map((option) => (
                            <li key={option.id}>{option.label}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </section>
          ) : null}
        </section>
      ) : null}
      {draft && selectedCycle?.status === 'RASCUNHO' ? (
        <p className="muted">
          O rascunho selecionado contém {draft.questionnaires.length} questionário(s) aplicado(s).
        </p>
      ) : null}
    </section>
  )
}

function optionKey(
  questionnaireVersionId: string,
  option: {
    calculationConfigurationVersionId: string
    classificationMatrixVersionId: string
  },
): string {
  return `${questionnaireVersionId}:${option.calculationConfigurationVersionId}:${option.classificationMatrixVersionId}`
}

function formatConfigurationOption(
  option: ApprovedQuestionnaireVersion['configurationOptions'][number],
) {
  return `${option.calculationCode} v${option.calculationVersionNumber} · ${option.classificationMatrixCode} v${option.classificationMatrixVersionNumber}`
}

function formatCycleStatus(status: string): string {
  const labels: Record<string, string> = {
    RASCUNHO: 'Rascunho',
    ABERTO: 'Aberto',
    ENCERRADO: 'Encerrado',
  }
  return labels[status] ?? status
}
