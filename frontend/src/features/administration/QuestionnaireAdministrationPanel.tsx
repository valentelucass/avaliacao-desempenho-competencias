import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ChevronDown, ChevronUp, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { isAuthenticationError } from '../../api/client'
import type { ApiClient } from '../../api/client'
import type {
  ApprovedQuestionnaireVersion,
  CreateQuestionnaireVersionInput,
  Permission,
  QuestionnaireCompetencyInput,
} from '../../api/contracts'
import { FeedbackMessage } from '../../ui/Feedback'
import { EmptyState } from '../../ui/EmptyState'
import { ContextHelp } from '../../ui/ContextHelp'
import { Pagination } from '../../ui/Pagination'
import { safeErrorMessage } from '../../ui/safeErrorMessage'
import { useClientPagination } from '../../ui/useClientPagination'
import {
  assessmentScale,
  questionnaireTemplates,
  templateById,
  type QuestionnaireTemplate,
} from './questionnaireTemplates'

type QuestionnaireAdministrationPanelProps = {
  api: ApiClient
  permissions: readonly Permission[]
  onSessionExpired: () => void
}

type QuestionnaireBuilderDraft = {
  templateId: string
  questionnaireCode: string
  questionnaireName: string
  versionNumber: string
  title: string
  description: string
  competencies: readonly CompetencyBuilderDraft[]
}

type CompetencyBuilderDraft = {
  localKey: string
  catalogCode: string
  code: string
  name: string
  description: string
}

const defaultCalculationCode = 'MEDIA_SIMPLES_2024_1'

/**
 * Cria uma versão imutável. A escala é congelada no servidor; esta tela monta
 * somente conteúdo e ordem a partir dos modelos documentados.
 */
export function QuestionnaireAdministrationPanel({
  api,
  permissions,
  onSessionExpired,
}: QuestionnaireAdministrationPanelProps) {
  const formPrefix = useId().replaceAll(':', '')
  const rowSequence = useRef(1)
  const [versions, setVersions] = useState<readonly ApprovedQuestionnaireVersion[]>([])
  const [draft, setDraft] = useState<QuestionnaireBuilderDraft>(createInitialDraft)
  const [isLoadingVersions, setIsLoadingVersions] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [loadError, setLoadError] = useState<string>()
  const [submitError, setSubmitError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const canManageQuestionnaires = permissions.includes('QUESTIONARIOS.GERIR')
  const versionsPagination = useClientPagination(versions, 5)

  const loadApprovedVersions = useCallback(async () => {
    if (!canManageQuestionnaires) {
      return
    }
    setIsLoadingVersions(true)
    setLoadError(undefined)
    try {
      setVersions(await api.listApprovedQuestionnaireVersions())
    } catch (requestError) {
      if (isAuthenticationError(requestError)) {
        onSessionExpired()
        return
      }
      setLoadError(safeErrorMessage(requestError))
    } finally {
      setIsLoadingVersions(false)
    }
  }, [api, canManageQuestionnaires, onSessionExpired])

  useEffect(() => {
    if (!canManageQuestionnaires) {
      return
    }
    // oxlint-disable-next-line react/set-state-in-effect -- Network loading is asynchronous.
    void loadApprovedVersions()
  }, [canManageQuestionnaires, loadApprovedVersions])

  function nextRowKey(prefix: string): string {
    rowSequence.current += 1
    return prefix + '-' + rowSequence.current
  }

  function updateDraft<Field extends Exclude<keyof QuestionnaireBuilderDraft, 'competencies'>>(
    field: Field,
    value: QuestionnaireBuilderDraft[Field],
  ) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function updateCompetency(
    competencyIndex: number,
    update: (competency: CompetencyBuilderDraft) => CompetencyBuilderDraft,
  ) {
    setDraft((current) => ({
      ...current,
      competencies: current.competencies.map((competency, index) =>
        index === competencyIndex ? update(competency) : competency,
      ),
    }))
  }

  function selectTemplate(templateId: string) {
    const template = templateById(templateId)
    if (!template) {
      setDraft(createInitialDraft())
      return
    }
    setDraft(createTemplateDraft(template, (prefix) => nextRowKey(prefix)))
    setSubmitError(undefined)
    setNotice(undefined)
  }

  function selectCompetency(competencyIndex: number, catalogCode: string) {
    const template = templateById(draft.templateId)
    const item = template?.items.find((candidate) => candidate.code === catalogCode)
    if (!template || !item) {
      return
    }
    updateCompetency(competencyIndex, (current) => ({
      ...current,
      catalogCode: item.code,
      code: template.questionnaireCode + '_' + item.code,
      name: item.name,
      description: item.description,
    }))
  }

  function addCompetency() {
    if (draft.competencies.length >= 100) {
      return
    }
    setDraft((current) => ({
      ...current,
      competencies: [...current.competencies, createCompetencyDraft(nextRowKey('competency'))],
    }))
  }

  function removeCompetency(competencyIndex: number) {
    if (draft.competencies.length <= 1) {
      return
    }
    setDraft((current) => ({
      ...current,
      competencies: current.competencies.filter((_, index) => index !== competencyIndex),
    }))
  }

  function moveCompetency(competencyIndex: number, direction: -1 | 1) {
    setDraft((current) => ({
      ...current,
      competencies: moveItem(current.competencies, competencyIndex, direction),
    }))
  }

  async function createQuestionnaireVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(undefined)
    setNotice(undefined)
    const validation = buildCreateInput(draft)
    if ('error' in validation) {
      setSubmitError(validation.error)
      return
    }

    setIsCreating(true)
    try {
      await api.createQuestionnaireVersion(validation.input)
      setDraft(createInitialDraft())
      setNotice(
        'Versão criada e aprovada. O conteúdo e a escala ficam congelados para preservar as avaliações históricas.',
      )
      await loadApprovedVersions()
    } catch (requestError) {
      if (isAuthenticationError(requestError)) {
        onSessionExpired()
        return
      }
      setSubmitError(safeErrorMessage(requestError))
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <section
      aria-labelledby="questionnaire-administration-title"
      className="questionnaire-administration"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Administração de conteúdo</p>
          <div className="context-help__heading">
            <h2 id="questionnaire-administration-title">Questionários</h2>
            <ContextHelp title="Por que as versões são imutáveis">
              <p>
                Ao aprovar uma versão, o conteúdo, as competências e a escala daquela versão ficam
                preservados para os ciclos que a utilizarem.
              </p>
              <p className="context-help__note">
                Uma versão nova não reinterpreta nem recalcula avaliações que já usam uma versão
                anterior.
              </p>
            </ContextHelp>
          </div>
          <p className="muted">
            Escolha um modelo, confira cada competência e crie uma versão imutável. A resposta e a
            nota de cada avaliação continuam validadas pelo servidor.
          </p>
        </div>
        {canManageQuestionnaires ? (
          <button
            className="button"
            type="button"
            onClick={() => void loadApprovedVersions()}
            disabled={isLoadingVersions || isCreating}
          >
            <RefreshCw aria-hidden="true" size={17} strokeWidth={2} />
            {isLoadingVersions ? 'Atualizando…' : 'Atualizar versões'}
          </button>
        ) : null}
      </div>

      {!canManageQuestionnaires ? (
        <FeedbackMessage kind="error">
          Você não possui a permissão necessária para administrar questionários.
        </FeedbackMessage>
      ) : null}

      {canManageQuestionnaires ? (
        <>
          {notice ? <FeedbackMessage kind="status">{notice}</FeedbackMessage> : null}

          <section
            className="card questionnaire-versions"
            aria-labelledby="questionnaire-versions-title"
          >
            <div className="section-heading questionnaire-versions__heading">
              <h3 id="questionnaire-versions-title">Versões aprovadas</h3>
              <p className="muted">
                A lista serve para conferir o catálogo disponível aos ciclos, sem expor
                identificadores técnicos ou conteúdo sensível.
              </p>
            </div>
            {isLoadingVersions ? (
              <FeedbackMessage kind="info">Carregando versões aprovadas…</FeedbackMessage>
            ) : null}
            {loadError ? <FeedbackMessage kind="error">{loadError}</FeedbackMessage> : null}
            {!isLoadingVersions && !loadError && versions.length === 0 ? (
              <EmptyState className="empty-state--compact" title="Nenhuma versão aprovada">
                Ainda não há questionários aprovados para consulta. Uma versão precisa ser criada,
                validada e aprovada antes de aparecer nesta lista.
              </EmptyState>
            ) : null}
            {!isLoadingVersions && !loadError && versions.length > 0 ? (
              <div className="administration-users">
                <table className="questionnaire-versions__table">
                  <caption className="visually-hidden">
                    Versões de questionário aprovadas e suas configurações disponíveis
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Questionário</th>
                      <th scope="col">Versão</th>
                      <th scope="col">Título</th>
                      <th scope="col">Configuração aprovada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versionsPagination.items.map((version) => (
                      <tr key={version.questionnaireVersionId}>
                        <td data-label="Questionário">
                          <strong>{version.questionnaireName}</strong>
                          <span className="questionnaire-versions__code">
                            {version.questionnaireCode}
                          </span>
                        </td>
                        <td data-label="Versão">v{version.versionNumber}</td>
                        <td data-label="Título">
                          <span className="questionnaire-versions__value">{version.title}</span>
                        </td>
                        <td data-label="Configuração aprovada">
                          <span className="questionnaire-versions__value">
                            {formatConfigurationOptions(version)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination
                  currentPage={versionsPagination.currentPage}
                  hasNextPage={versionsPagination.hasNextPage}
                  isLoading={isLoadingVersions || isCreating}
                  itemCountOnPage={versionsPagination.items.length}
                  itemLabel="versões aprovadas"
                  onNextPage={versionsPagination.onNextPage}
                  onPreviousPage={versionsPagination.onPreviousPage}
                  totalPages={versionsPagination.totalPages}
                />
              </div>
            ) : null}
          </section>

          <section className="card" aria-labelledby="create-questionnaire-version-title">
            <div>
              <h3 id="create-questionnaire-version-title">Criar versão a partir de um modelo</h3>
              <p className="muted">
                Cada competência vira um item obrigatório de avaliação. A autoavaliação usa o
                questionário aplicável do ciclo; ela não precisa de um quarto modelo separado.
              </p>
            </div>
            <form
              className="stack-form questionnaire-builder"
              onSubmit={createQuestionnaireVersion}
              noValidate
              aria-busy={isCreating}
            >
              {submitError ? <FeedbackMessage kind="error">{submitError}</FeedbackMessage> : null}
              <fieldset
                className="filter-fieldset questionnaire-builder__details"
                disabled={isCreating}
              >
                <legend>Modelo e versão</legend>
                <div className="questionnaire-builder__details-grid">
                  <div className="field questionnaire-builder__template">
                    <label htmlFor={formPrefix + '-template'}>Modelo de competências</label>
                    <select
                      id={formPrefix + '-template'}
                      name="questionnaireTemplate"
                      value={draft.templateId}
                      onChange={(event) => selectTemplate(event.target.value)}
                      required
                    >
                      <option value="">Selecione um modelo</option>
                      {questionnaireTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.questionnaireName} ({template.items.length} competências)
                        </option>
                      ))}
                    </select>
                    <p className="field-hint">
                      O modelo preenche os itens documentados para a versão 2024.1.
                    </p>
                  </div>
                  <div className="field questionnaire-builder__version">
                    <label htmlFor={formPrefix + '-questionnaire-version'}>
                      Versão do questionário
                    </label>
                    <input
                      id={formPrefix + '-questionnaire-version'}
                      name="questionnaireVersion"
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={draft.versionNumber}
                      onChange={(event) => updateDraft('versionNumber', event.target.value)}
                      required
                    />
                  </div>
                  <div className="field questionnaire-builder__title">
                    <label htmlFor={formPrefix + '-title'}>Título exibido</label>
                    <input
                      id={formPrefix + '-title'}
                      name="title"
                      value={draft.title}
                      onChange={(event) => updateDraft('title', event.target.value)}
                      maxLength={200}
                      required
                    />
                  </div>
                  <div className="field questionnaire-builder__description">
                    <label htmlFor={formPrefix + '-description'}>
                      Descrição da versão (opcional)
                    </label>
                    <textarea
                      id={formPrefix + '-description'}
                      name="description"
                      value={draft.description}
                      onChange={(event) => updateDraft('description', event.target.value)}
                      maxLength={1000}
                      rows={1}
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset className="filter-fieldset questionnaire-scale" disabled={isCreating}>
                <legend>Escala de respostas aplicada</legend>
                <p className="field-hint">
                  Estas são as alternativas que aparecerão ao avaliador. Os pontos são definidos no
                  servidor, portanto não podem ser alterados por esta tela.
                </p>
                <ol
                  className="questionnaire-response-scale"
                  aria-label="Escala de respostas aplicada"
                >
                  {assessmentScale.map((option) => (
                    <li key={option.code}>
                      <span className="questionnaire-answers-preview__points">{option.points}</span>
                      <span className="questionnaire-answers-preview__label">{option.label}</span>
                    </li>
                  ))}
                </ol>
              </fieldset>

              {draft.templateId ? (
                <fieldset className="filter-fieldset" disabled={isCreating}>
                  <legend>Competências da versão</legend>
                  <p className="field-hint">
                    Selecione uma competência para ver sua descrição e as respostas que serão
                    apresentadas. Cada bloco equivale a uma pergunta obrigatória.
                  </p>
                  <div className="questionnaire-competency-list">
                    {draft.competencies.map((competency, competencyIndex) => {
                      const competencyPrefix = formPrefix + '-' + competency.localKey
                      const isFirstCompetency = competencyIndex === 0
                      const isLastCompetency = competencyIndex === draft.competencies.length - 1
                      const template = templateById(draft.templateId)
                      return (
                        <details
                          className="competency-card questionnaire-competency"
                          key={competency.localKey}
                          open={competencyIndex === 0}
                        >
                          <summary>
                            <span>Competência {competencyIndex + 1}</span>
                            <strong>{competency.name || 'Selecione uma competência'}</strong>
                          </summary>
                          <div className="questionnaire-competency__actions">
                            <button
                              className="button button--quiet"
                              type="button"
                              onClick={() => moveCompetency(competencyIndex, -1)}
                              disabled={isFirstCompetency}
                              aria-label={
                                'Mover competência ' + (competencyIndex + 1) + ' para cima'
                              }
                            >
                              <ChevronUp aria-hidden="true" size={16} strokeWidth={2} />
                              Subir
                            </button>
                            <button
                              className="button button--quiet"
                              type="button"
                              onClick={() => moveCompetency(competencyIndex, 1)}
                              disabled={isLastCompetency}
                              aria-label={
                                'Mover competência ' + (competencyIndex + 1) + ' para baixo'
                              }
                            >
                              <ChevronDown aria-hidden="true" size={16} strokeWidth={2} />
                              Descer
                            </button>
                            <button
                              className="button button--danger"
                              type="button"
                              onClick={() => removeCompetency(competencyIndex)}
                              disabled={draft.competencies.length === 1}
                              aria-label={'Remover competência ' + (competencyIndex + 1)}
                            >
                              <Trash2 aria-hidden="true" size={16} strokeWidth={2} />
                              Remover
                            </button>
                          </div>
                          <div className="questionnaire-competency__content">
                            {!competency.catalogCode ? (
                              <div className="field questionnaire-competency__catalog">
                                <label htmlFor={competencyPrefix + '-catalog'}>
                                  Competência a avaliar
                                </label>
                                <select
                                  id={competencyPrefix + '-catalog'}
                                  value={competency.catalogCode}
                                  onChange={(event) =>
                                    selectCompetency(competencyIndex, event.target.value)
                                  }
                                  required
                                >
                                  <option value="">Selecione uma competência</option>
                                  {template?.items.map((item) => (
                                    <option key={item.code} value={item.code}>
                                      {item.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : null}
                            <div className="field">
                              <label htmlFor={competencyPrefix + '-description'}>
                                Descrição do item
                              </label>
                              <textarea
                                id={competencyPrefix + '-description'}
                                value={competency.description}
                                onChange={(event) =>
                                  updateCompetency(competencyIndex, (current) => ({
                                    ...current,
                                    catalogCode: '',
                                    code: '',
                                    description: event.target.value,
                                  }))
                                }
                                maxLength={2000}
                                rows={3}
                                required
                              />
                            </div>
                            <section
                              className="questionnaire-answers-preview"
                              aria-labelledby={competencyPrefix + '-answers-title'}
                            >
                              <h4 id={competencyPrefix + '-answers-title'}>
                                Respostas disponíveis
                              </h4>
                              <ol className="questionnaire-response-scale">
                                {assessmentScale.map((option) => (
                                  <li key={option.code}>
                                    <span className="questionnaire-answers-preview__points">
                                      {option.points}
                                    </span>
                                    <span className="questionnaire-answers-preview__label">
                                      {option.label}
                                    </span>
                                  </li>
                                ))}
                              </ol>
                            </section>
                          </div>
                        </details>
                      )
                    })}
                  </div>
                  <button
                    className="button"
                    type="button"
                    onClick={addCompetency}
                    disabled={draft.competencies.length >= 100}
                  >
                    <Plus aria-hidden="true" size={17} strokeWidth={2} />
                    Adicionar competência
                  </button>
                </fieldset>
              ) : null}

              <div className="action-row">
                <button
                  className="button button--success"
                  type="submit"
                  disabled={isCreating || !draft.templateId}
                >
                  <Save aria-hidden="true" size={17} strokeWidth={2} />
                  {isCreating ? 'Criando versão…' : 'Criar e aprovar versão'}
                </button>
              </div>
            </form>
          </section>
        </>
      ) : null}
    </section>
  )
}

function createInitialDraft(): QuestionnaireBuilderDraft {
  return {
    templateId: '',
    questionnaireCode: '',
    questionnaireName: '',
    versionNumber: '1',
    title: '',
    description: '',
    competencies: [],
  }
}

function createTemplateDraft(
  template: QuestionnaireTemplate,
  nextRowKey: (prefix: string) => string,
): QuestionnaireBuilderDraft {
  return {
    templateId: template.id,
    questionnaireCode: template.questionnaireCode,
    questionnaireName: template.questionnaireName,
    versionNumber: '1',
    title: template.title,
    description: template.description,
    competencies: template.items.map((item) => ({
      localKey: nextRowKey('competency'),
      catalogCode: item.code,
      code: template.questionnaireCode + '_' + item.code,
      name: item.name,
      description: item.description,
    })),
  }
}

function createCompetencyDraft(localKey: string): CompetencyBuilderDraft {
  return { localKey, catalogCode: '', code: '', name: '', description: '' }
}

function moveItem<Item>(
  items: readonly Item[],
  itemIndex: number,
  direction: -1 | 1,
): readonly Item[] {
  const destination = itemIndex + direction
  if (destination < 0 || destination >= items.length) {
    return items
  }
  const moved = [...items]
  const [item] = moved.splice(itemIndex, 1)
  moved.splice(destination, 0, item)
  return moved
}

function buildCreateInput(
  draft: QuestionnaireBuilderDraft,
): { input: CreateQuestionnaireVersionInput } | { error: string } {
  const questionnaireCode = normalizeCode(draft.questionnaireCode)
  const questionnaireName = requiredText(draft.questionnaireName)
  const versionNumber = positiveInteger(draft.versionNumber)
  const title = requiredText(draft.title)
  if (!questionnaireCode || !questionnaireName || !versionNumber || !title) {
    return { error: 'Selecione um modelo e informe uma versão e título válidos.' }
  }
  if (draft.competencies.length === 0) {
    return { error: 'Inclua ao menos uma competência.' }
  }

  const usedCodes = new Set<string>()
  const competencies: QuestionnaireCompetencyInput[] = []
  for (const [competencyIndex, competency] of draft.competencies.entries()) {
    const position = competencyIndex + 1
    const competencyName = requiredText(competency.name)
    const competencyDescription = requiredText(competency.description)
    const baseCode = normalizeCode(competency.code) ?? questionnaireCode + '_ITEM_' + position
    if (!competencyName || !competencyDescription) {
      return { error: 'Selecione uma competência válida na posição ' + position + '.' }
    }
    const competencyCode = uniqueCode(baseCode, usedCodes)
    competencies.push({
      code: competencyCode,
      name: competencyName,
      versionNumber: 1,
      description: competencyDescription,
      order: position,
      questions: [
        {
          code: competencyCode + '_PERGUNTA',
          text: competencyName,
          description: competencyDescription,
          order: 1,
        },
      ],
    })
  }

  const description = optionalText(draft.description)
  return {
    input: {
      questionnaire: { code: questionnaireCode, name: questionnaireName },
      versionNumber,
      title,
      ...(description ? { description } : {}),
      calculation: { code: defaultCalculationCode, versionNumber: 1 },
      classificationMatrixVersionNumber: 1,
      competencies,
    },
  }
}

function uniqueCode(baseCode: string, usedCodes: Set<string>): string {
  let candidate = baseCode
  let suffix = 2
  while (usedCodes.has(candidate)) {
    candidate = baseCode + '_' + suffix
    suffix += 1
  }
  usedCodes.add(candidate)
  return candidate
}

function normalizeCode(value: string): string | undefined {
  const normalized = value.trim().toLocaleUpperCase('en-US')
  return normalized && /^[A-Z0-9_.-]+$/.test(normalized) ? normalized : undefined
}

function requiredText(value: string): string | undefined {
  return value.trim() || undefined
}

function optionalText(value: string): string | undefined {
  return requiredText(value)
}

function positiveInteger(value: string): number | undefined {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function formatConfigurationOptions(version: ApprovedQuestionnaireVersion): string {
  if (version.configurationOptions.length === 0) {
    return 'Configuração não informada'
  }
  return version.configurationOptions
    .map(
      (option) =>
        option.calculationCode +
        ' v' +
        option.calculationVersionNumber +
        ' · ' +
        option.classificationMatrixCode +
        ' v' +
        option.classificationMatrixVersionNumber,
    )
    .join('; ')
}
