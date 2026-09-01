import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Printer } from 'lucide-react'
import { isAuthenticationError } from '../../api/client'
import type { ApiClient } from '../../api/client'
import type { AssessmentDetail, AssessmentDraftInput } from '../../api/contracts'
import { FeedbackMessage } from '../../ui/Feedback'
import { ContextHelp } from '../../ui/ContextHelp'
import { safeErrorMessage } from '../../ui/safeErrorMessage'
import { IndividualAssessmentSummary } from './IndividualAssessmentSummary'

type AssessmentEditorProps = {
  api: ApiClient
  assessmentId: string
  canEditManagerAssessment: boolean
  canEditDirectorAssessment: boolean
  canEditSelfAssessment: boolean
  canSubmitSelfAssessment: boolean
  canPublish: boolean
  canReopen: boolean
  canRecordFeedback: boolean
  onBack: () => void
  onChanged: () => void
  onSessionExpired: () => void
}

export function AssessmentEditor({
  api,
  assessmentId,
  canEditManagerAssessment,
  canEditDirectorAssessment,
  canEditSelfAssessment,
  canSubmitSelfAssessment,
  canPublish,
  canReopen,
  canRecordFeedback,
  onBack,
  onChanged,
  onSessionExpired,
}: AssessmentEditorProps) {
  const [assessment, setAssessment] = useState<AssessmentDetail>()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [comment, setComment] = useState('')
  const [actionPlan, setActionPlan] = useState('')
  const [reopenReason, setReopenReason] = useState('')
  const [feedbackDate, setFeedbackDate] = useState('')
  const [feedbackComment, setFeedbackComment] = useState('')
  const [error, setError] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [missingQuestionIds, setMissingQuestionIds] = useState<readonly string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const errorSummaryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let isCurrent = true

    async function loadAssessment() {
      setIsLoading(true)
      setError(undefined)
      try {
        const detail = await api.getAssessment(assessmentId)
        if (isCurrent) {
          applyDetail(detail)
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
          setIsLoading(false)
        }
      }
    }

    void loadAssessment()
    return () => {
      isCurrent = false
    }
  }, [api, assessmentId, onSessionExpired])

  const questions = useMemo(
    () =>
      assessment?.questionnaire.competencies.flatMap((competency) => competency.questions) ?? [],
    [assessment],
  )
  const isDraft = assessment?.status === 'RASCUNHO'
  const canEditDraft = isDraft && canEditAssessmentType(assessment?.type)
  const canSubmitDraft =
    isDraft &&
    (assessment?.type === 'AUTOAVALIACAO'
      ? canSubmitSelfAssessment
      : canEditAssessmentType(assessment?.type))
  const canCompleteFeedback =
    assessment?.status === 'PUBLICADA' &&
    assessment.feedbackStatus === 'PENDENTE' &&
    assessment.type !== 'AUTOAVALIACAO' &&
    canRecordFeedback
  const hasPrintableSummary =
    (assessment?.status === 'ENVIADA' || assessment?.status === 'PUBLICADA') &&
    assessment.result !== undefined &&
    (assessment.competencyScores?.length ?? 0) > 0

  function applyDetail(detail: AssessmentDetail) {
    setAssessment(detail)
    setAnswers(
      Object.fromEntries(detail.answers.map((answer) => [answer.questionId, answer.optionId])),
    )
    setComment(detail.comment ?? '')
    setActionPlan(detail.actionPlan ?? '')
    setReopenReason('')
    setFeedbackDate('')
    setFeedbackComment('')
    setMissingQuestionIds([])
  }

  function draftInput(): AssessmentDraftInput {
    return {
      answers: Object.entries(answers).map(([questionId, optionId]) => ({ questionId, optionId })),
      comment: comment.trim() || undefined,
      actionPlan: actionPlan.trim() || undefined,
    }
  }

  async function saveDraft() {
    if (!assessment || !canEditDraft) {
      return
    }

    setIsSaving(true)
    setError(undefined)
    setStatus(undefined)
    try {
      const updated = await api.saveAssessment(assessment.id, draftInput(), assessment.revision)
      applyDetail(updated)
      setStatus('Rascunho salvo com sucesso.')
      onChanged()
    } catch (requestError) {
      handleRequestError(requestError)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!assessment || !canSubmitDraft) {
      return
    }

    const missing = questions
      .filter((question) => question.required && !answers[question.id])
      .map((question) => question.id)
    setMissingQuestionIds(missing)
    if (missing.length > 0) {
      setStatus(undefined)
      setError('Responda todas as perguntas obrigatórias antes de enviar a avaliação.')
      requestAnimationFrame(() => errorSummaryRef.current?.focus())
      return
    }

    setIsSaving(true)
    setError(undefined)
    setStatus(undefined)
    try {
      const saved = await api.saveAssessment(assessment.id, draftInput(), assessment.revision)
      applyDetail(saved)
      const updated = await api.submitAssessment(saved.id, saved.revision)
      applyDetail(updated)
      setStatus('Avaliação enviada. O resultado exibido é calculado pelo servidor.')
      onChanged()
    } catch (requestError) {
      handleRequestError(requestError)
    } finally {
      setIsSaving(false)
    }
  }

  async function publishAssessment() {
    if (!assessment || assessment.status !== 'ENVIADA' || !canPublish) {
      return
    }

    setIsSaving(true)
    setError(undefined)
    setStatus(undefined)
    try {
      const updated = await api.publishAssessment(assessment.id)
      applyDetail(updated)
      setStatus('Avaliação publicada com sucesso.')
      onChanged()
    } catch (requestError) {
      handleRequestError(requestError)
    } finally {
      setIsSaving(false)
    }
  }

  async function reopenAssessment() {
    if (!assessment || assessment.status !== 'PUBLICADA' || !canReopen) {
      return
    }
    const reason = reopenReason.trim()
    if (!reason) {
      setError('Informe o motivo da reabertura antes de continuar.')
      return
    }

    setIsSaving(true)
    setError(undefined)
    setStatus(undefined)
    try {
      const updated = await api.reopenAssessment(assessment.id, reason)
      applyDetail(updated)
      setStatus('Avaliação reaberta em rascunho. A versão publicada foi preservada.')
      onChanged()
    } catch (requestError) {
      handleRequestError(requestError)
    } finally {
      setIsSaving(false)
    }
  }

  async function completeFeedback() {
    if (!assessment || !canCompleteFeedback) {
      return
    }
    if (!feedbackDate || !feedbackComment.trim()) {
      setError('Informe a data e o comentário do feedback antes de concluir.')
      return
    }

    setIsSaving(true)
    setError(undefined)
    setStatus(undefined)
    try {
      const updated = await api.completeAssessmentFeedback(assessment.id, {
        feedbackDate,
        comment: feedbackComment.trim(),
      })
      applyDetail(updated)
      setStatus('Feedback registrado e concluído com sucesso.')
      onChanged()
    } catch (requestError) {
      handleRequestError(requestError)
    } finally {
      setIsSaving(false)
    }
  }

  function canEditAssessmentType(type: AssessmentDetail['type'] | undefined) {
    if (type === 'GESTOR') {
      return canEditManagerAssessment
    }
    if (type === 'DIRETORIA_GERENCIA') {
      return canEditDirectorAssessment
    }
    return canEditSelfAssessment
  }

  function handleRequestError(requestError: unknown) {
    if (isAuthenticationError(requestError)) {
      onSessionExpired()
      return
    }
    setError(safeErrorMessage(requestError))
  }

  async function printAssessment() {
    if (!assessment || !hasPrintableSummary || isPrinting) {
      return
    }

    setIsPrinting(true)
    setError(undefined)
    try {
      await api.recordAssessmentPrint(assessment.id)
      window.print()
    } catch (requestError) {
      handleRequestError(requestError)
    } finally {
      setIsPrinting(false)
    }
  }

  function selectAnswer(questionId: string, optionId: string) {
    setAnswers((current) => ({ ...current, [questionId]: optionId }))
    setMissingQuestionIds((current) => current.filter((id) => id !== questionId))
  }

  if (isLoading) {
    return <FeedbackMessage kind="info">Carregando avaliação…</FeedbackMessage>
  }

  if (!assessment) {
    return (
      <section className="card" aria-labelledby="assessment-error-title">
        <h2 id="assessment-error-title">Avaliação indisponível</h2>
        {error ? <FeedbackMessage kind="error">{error}</FeedbackMessage> : null}
        <div className="action-row print-hidden">
          <button className="button" type="button" onClick={onBack}>
            Voltar para a lista
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="assessment-editor" aria-labelledby="assessment-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{assessment.type}</p>
          <div className="context-help__heading">
            <h2 id="assessment-title">Avaliação de {assessment.evaluated.displayName}</h2>
            <ContextHelp title="Como preencher esta avaliação">
              <p>
                Salve o rascunho para continuar depois. A nota, a classificação e as permissões são
                confirmadas pelo servidor quando a avaliação é enviada.
              </p>
            </ContextHelp>
          </div>
          <p className="muted">Ciclo: {assessment.cycle.name}</p>
        </div>
        <div className="action-row print-hidden">
          <button
            className="button"
            type="button"
            disabled={isPrinting || !hasPrintableSummary}
            onClick={printAssessment}
          >
            <Printer aria-hidden="true" size={17} strokeWidth={2} />
            {isPrinting ? 'Registrando impressão…' : 'Imprimir / PDF'}
          </button>
          <button className="button" type="button" onClick={onBack}>
            Voltar para a lista
          </button>
        </div>
      </div>

      {!hasPrintableSummary ? (
        <p className="field-hint assessment-editor__print-hint">
          A impressão com gráfico e resumo fica disponível após o envio da avaliação.
        </p>
      ) : null}

      {error ? (
        <div className="error-summary" ref={errorSummaryRef} tabIndex={-1}>
          <FeedbackMessage kind="error">{error}</FeedbackMessage>
        </div>
      ) : null}
      {status ? <FeedbackMessage kind="status">{status}</FeedbackMessage> : null}

      <form className="stack-form" onSubmit={handleSubmit} noValidate aria-busy={isSaving}>
        {assessment.questionnaire.competencies.map((competency) => (
          <fieldset
            className="competency-card"
            key={competency.id}
            disabled={!canEditDraft || isSaving}
          >
            <legend id={`${competency.id}-label`}>{competency.name}</legend>
            {competency.questions.map((question) => {
              const questionError = missingQuestionIds.includes(question.id)
              const questionTitleIsRedundant =
                question.text.trim().toLocaleLowerCase('pt-BR') ===
                competency.name.trim().toLocaleLowerCase('pt-BR')
              const helpId = `question-${question.id}-help`
              const errorId = `question-${question.id}-error`
              const questionLabelId = questionTitleIsRedundant
                ? `${competency.id}-label`
                : `${question.id}-label`
              return (
                <div className="question" key={question.id}>
                  {!questionTitleIsRedundant ? (
                    <p className="question__text" id={questionLabelId}>
                      {question.text}
                    </p>
                  ) : null}
                  {question.description ? <p id={helpId}>{question.description}</p> : null}
                  <div
                    aria-describedby={question.description ? helpId : undefined}
                    aria-invalid={questionError || undefined}
                    className="answer-options"
                    role="radiogroup"
                    aria-labelledby={questionLabelId}
                    aria-errormessage={questionError ? errorId : undefined}
                  >
                    {question.options.map((option) => {
                      const optionId = `question-${question.id}-option-${option.id}`
                      return (
                        <label className="answer-option" htmlFor={optionId} key={option.id}>
                          <input
                            id={optionId}
                            name={`question-${question.id}`}
                            type="radio"
                            checked={answers[question.id] === option.id}
                            onChange={() => selectAnswer(question.id, option.id)}
                            required={question.required}
                          />
                          <span>{option.label}</span>
                          <output aria-hidden="true" className="answer-option__points">
                            {option.points}
                          </output>
                        </label>
                      )
                    })}
                  </div>
                  {questionError ? (
                    <p className="field-error" id={errorId}>
                      Selecione uma resposta para esta pergunta.
                    </p>
                  ) : null}
                </div>
              )
            })}
          </fieldset>
        ))}

        <div className="assessment-editor__narrative-fields">
          <div className="field assessment-editor__narrative-field">
            <label htmlFor="assessment-comment">Comentário opcional</label>
            <textarea
              id="assessment-comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              disabled={!canEditDraft || isSaving}
              rows={4}
            />
          </div>

          <div className="field assessment-editor__narrative-field">
            <label htmlFor="assessment-action-plan">Plano de ação opcional</label>
            <textarea
              id="assessment-action-plan"
              value={actionPlan}
              onChange={(event) => setActionPlan(event.target.value)}
              disabled={!canEditDraft || isSaving}
              rows={4}
            />
          </div>
        </div>

        <div className="assessment-editor__print-sheet">
          <header className="assessment-editor__print-heading" aria-hidden="true">
            <div>
              <p>Resumo individual de desempenho</p>
              <h2>Avaliação de {assessment.evaluated.displayName}</h2>
            </div>
            <dl>
              <div>
                <dt>Ciclo</dt>
                <dd>{assessment.cycle.name}</dd>
              </div>
              <div>
                <dt>Tipo</dt>
                <dd>{assessmentTypeLabel(assessment.type)}</dd>
              </div>
            </dl>
          </header>
          <IndividualAssessmentSummary assessment={assessment} displayMode="chart" />
          <section className="assessment-print-signature" aria-label="Assinatura do colaborador">
            <span>Assinatura do colaborador</span>
            <div aria-hidden="true" className="assessment-print-signature__line" />
          </section>
        </div>

        {canEditDraft || canSubmitDraft ? (
          <div className="action-row">
            {canEditDraft ? (
              <button
                className="button button--success"
                type="button"
                onClick={() => void saveDraft()}
                disabled={isSaving}
              >
                {isSaving ? 'Salvando…' : 'Salvar rascunho'}
              </button>
            ) : null}
            {canSubmitDraft ? (
              <button className="button button--success" type="submit" disabled={isSaving}>
                Enviar avaliação
              </button>
            ) : null}
          </div>
        ) : null}

        {assessment.status === 'ENVIADA' && canPublish ? (
          <div className="action-row">
            <button
              className="button button--success"
              type="button"
              onClick={() => void publishAssessment()}
              disabled={isSaving}
            >
              {isSaving ? 'Publicando…' : 'Publicar avaliação'}
            </button>
          </div>
        ) : null}

        {assessment.status === 'PUBLICADA' && canReopen ? (
          <section
            className="assessment-editor__administrative-action"
            aria-labelledby="reopen-assessment-title"
          >
            <div className="context-help__heading">
              <h3 id="reopen-assessment-title">Reabrir avaliação</h3>
              <ContextHelp title="O que acontece na reabertura">
                <p>
                  A reabertura exige motivo e mantém a versão publicada no histórico. O resultado
                  anterior não é sobrescrito silenciosamente.
                </p>
              </ContextHelp>
            </div>
            <p className="field-hint">
              A reabertura exige motivo e preserva a versão publicada no histórico.
            </p>
            <div className="field">
              <label htmlFor="assessment-reopen-reason">Motivo da reabertura</label>
              <textarea
                id="assessment-reopen-reason"
                value={reopenReason}
                onChange={(event) => setReopenReason(event.target.value)}
                disabled={isSaving}
                maxLength={80}
                rows={3}
                required
              />
            </div>
            <div className="action-row">
              <button
                className="button"
                type="button"
                onClick={() => void reopenAssessment()}
                disabled={isSaving || !reopenReason.trim()}
              >
                {isSaving ? 'Reabrindo…' : 'Reabrir avaliação'}
              </button>
            </div>
          </section>
        ) : null}

        {assessment.status === 'PUBLICADA' ? (
          <section
            className="assessment-editor__feedback"
            aria-labelledby="assessment-feedback-title"
          >
            <div>
              <div className="context-help__heading">
                <h3 id="assessment-feedback-title">Feedback</h3>
                <ContextHelp title="Como registrar o feedback">
                  <p>
                    O feedback registra a conversa entre avaliador e avaliado. Ao concluí-lo, ele
                    passa a integrar o histórico da versão publicada.
                  </p>
                </ContextHelp>
              </div>
              <p className="field-hint">
                {assessment.feedbackStatus === 'NAO_APLICAVEL'
                  ? 'Não se aplica a autoavaliações.'
                  : assessment.feedbackStatus === 'CONCLUIDO'
                    ? 'O registro abaixo faz parte do histórico desta versão publicada.'
                    : 'Registre a conversa com o colaborador para concluir esta etapa.'}
              </p>
            </div>
            {assessment.feedback ? (
              <dl className="assessment-editor__feedback-record">
                <div>
                  <dt>Data do feedback</dt>
                  <dd>
                    {new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(
                      new Date(`${assessment.feedback.feedbackDate}T00:00:00Z`),
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Registro</dt>
                  <dd>{assessment.feedback.comment}</dd>
                </div>
              </dl>
            ) : null}
            {canCompleteFeedback ? (
              <div className="assessment-editor__feedback-form">
                <div className="field">
                  <label htmlFor="assessment-feedback-date">Data do feedback</label>
                  <input
                    id="assessment-feedback-date"
                    type="date"
                    value={feedbackDate}
                    onChange={(event) => setFeedbackDate(event.target.value)}
                    disabled={isSaving}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="assessment-feedback-comment">Comentário do feedback</label>
                  <textarea
                    id="assessment-feedback-comment"
                    value={feedbackComment}
                    onChange={(event) => setFeedbackComment(event.target.value)}
                    disabled={isSaving}
                    maxLength={2000}
                    rows={4}
                    required
                  />
                </div>
                <div className="action-row">
                  <button
                    className="button button--success"
                    type="button"
                    onClick={() => void completeFeedback()}
                    disabled={isSaving || !feedbackDate || !feedbackComment.trim()}
                  >
                    {isSaving ? 'Salvando…' : 'Concluir feedback'}
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {!canEditDraft &&
        !canSubmitDraft &&
        !(assessment.status === 'ENVIADA' && canPublish) &&
        !(assessment.status === 'PUBLICADA' && canReopen) &&
        !canCompleteFeedback ? (
          <FeedbackMessage kind="status">
            Esta avaliação está disponível somente para consulta com as permissões atuais.
          </FeedbackMessage>
        ) : null}
      </form>
    </section>
  )
}

function assessmentTypeLabel(type: AssessmentDetail['type']): string {
  const labels: Record<AssessmentDetail['type'], string> = {
    AUTOAVALIACAO: 'Autoavaliação',
    DIRETORIA_GERENCIA: 'Avaliação de Diretoria',
    GESTOR: 'Avaliação de gestor',
  }

  return labels[type]
}
