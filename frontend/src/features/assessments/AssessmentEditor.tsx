import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Printer } from 'lucide-react'
import { isAuthenticationError } from '../../api/client'
import type { ApiClient } from '../../api/client'
import type { AssessmentDetail, AssessmentDraftInput } from '../../api/contracts'
import { FeedbackMessage } from '../../ui/Feedback'
import { safeErrorMessage } from '../../ui/safeErrorMessage'

type AssessmentEditorProps = {
  api: ApiClient
  assessmentId: string
  canEditManagerAssessment: boolean
  canEditSelfAssessment: boolean
  canSubmitSelfAssessment: boolean
  canPublish: boolean
  canReopen: boolean
  onBack: () => void
  onChanged: () => void
  onSessionExpired: () => void
}

export function AssessmentEditor({
  api,
  assessmentId,
  canEditManagerAssessment,
  canEditSelfAssessment,
  canSubmitSelfAssessment,
  canPublish,
  canReopen,
  onBack,
  onChanged,
  onSessionExpired,
}: AssessmentEditorProps) {
  const [assessment, setAssessment] = useState<AssessmentDetail>()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [comment, setComment] = useState('')
  const [actionPlan, setActionPlan] = useState('')
  const [reopenReason, setReopenReason] = useState('')
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
  const canEditDraft =
    isDraft && (assessment?.type === 'GESTOR' ? canEditManagerAssessment : canEditSelfAssessment)
  const canSubmitDraft =
    isDraft && (assessment?.type === 'GESTOR' ? canEditManagerAssessment : canSubmitSelfAssessment)

  function applyDetail(detail: AssessmentDetail) {
    setAssessment(detail)
    setAnswers(
      Object.fromEntries(detail.answers.map((answer) => [answer.questionId, answer.optionId])),
    )
    setComment(detail.comment ?? '')
    setActionPlan(detail.actionPlan ?? '')
    setReopenReason('')
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
      const updated = await api.submitAssessment(assessment.id, assessment.revision)
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
    if (
      !assessment ||
      assessment.type !== 'GESTOR' ||
      assessment.status !== 'ENVIADA' ||
      !canPublish
    ) {
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
    if (
      !assessment ||
      assessment.type !== 'GESTOR' ||
      assessment.status !== 'PUBLICADA' ||
      !canReopen
    ) {
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

  function handleRequestError(requestError: unknown) {
    if (isAuthenticationError(requestError)) {
      onSessionExpired()
      return
    }
    setError(safeErrorMessage(requestError))
  }

  async function printAssessment() {
    if (!assessment || isPrinting) {
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
          <h2 id="assessment-title">Avaliação de {assessment.evaluated.displayName}</h2>
          <p className="muted">Ciclo: {assessment.cycle.name}</p>
        </div>
        <div className="action-row print-hidden">
          <button className="button" type="button" disabled={isPrinting} onClick={printAssessment}>
            <Printer aria-hidden="true" size={17} strokeWidth={2} />
            {isPrinting ? 'Registrando impressão…' : 'Imprimir / PDF'}
          </button>
          <button className="button" type="button" onClick={onBack}>
            Voltar para a lista
          </button>
        </div>
      </div>

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
            <legend>{competency.name}</legend>
            {competency.questions.map((question) => {
              const questionError = missingQuestionIds.includes(question.id)
              const helpId = `question-${question.id}-help`
              const errorId = `question-${question.id}-error`
              return (
                <div className="question" key={question.id}>
                  <p className="question__text" id={`${question.id}-label`}>
                    {question.text}
                  </p>
                  {question.description ? <p id={helpId}>{question.description}</p> : null}
                  <div
                    aria-describedby={question.description ? helpId : undefined}
                    aria-invalid={questionError || undefined}
                    className="answer-options"
                    role="radiogroup"
                    aria-labelledby={`${question.id}-label`}
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

        <div className="field">
          <label htmlFor="assessment-comment">Comentário opcional</label>
          <textarea
            id="assessment-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            disabled={!canEditDraft || isSaving}
            rows={4}
          />
        </div>

        <div className="field">
          <label htmlFor="assessment-action-plan">Plano de ação opcional</label>
          <textarea
            id="assessment-action-plan"
            value={actionPlan}
            onChange={(event) => setActionPlan(event.target.value)}
            disabled={!canEditDraft || isSaving}
            rows={4}
          />
        </div>

        {assessment.result ? <ServerCalculatedResult result={assessment.result} /> : null}

        {canEditDraft || canSubmitDraft ? (
          <div className="action-row">
            {canEditDraft ? (
              <button
                className="button"
                type="button"
                onClick={() => void saveDraft()}
                disabled={isSaving}
              >
                {isSaving ? 'Salvando…' : 'Salvar rascunho'}
              </button>
            ) : null}
            {canSubmitDraft ? (
              <button className="button button--primary" type="submit" disabled={isSaving}>
                Enviar avaliação
              </button>
            ) : null}
          </div>
        ) : null}

        {assessment.type === 'GESTOR' && assessment.status === 'ENVIADA' && canPublish ? (
          <div className="action-row">
            <button
              className="button button--primary"
              type="button"
              onClick={() => void publishAssessment()}
              disabled={isSaving}
            >
              {isSaving ? 'Publicando…' : 'Publicar avaliação'}
            </button>
          </div>
        ) : null}

        {assessment.type === 'GESTOR' && assessment.status === 'PUBLICADA' && canReopen ? (
          <section className="card" aria-labelledby="reopen-assessment-title">
            <h3 id="reopen-assessment-title">Reabrir avaliação</h3>
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

        {!canEditDraft &&
        !canSubmitDraft &&
        !(assessment.type === 'GESTOR' && assessment.status === 'ENVIADA' && canPublish) &&
        !(assessment.type === 'GESTOR' && assessment.status === 'PUBLICADA' && canReopen) ? (
          <FeedbackMessage kind="status">
            Esta avaliação está disponível somente para consulta com as permissões atuais.
          </FeedbackMessage>
        ) : null}
      </form>
    </section>
  )
}

function ServerCalculatedResult({ result }: { result: NonNullable<AssessmentDetail['result']> }) {
  const score = new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(result.finalScore)

  return (
    <section className="result-card" aria-labelledby="server-result-title">
      <h3 id="server-result-title">Resultado calculado no servidor</h3>
      <dl>
        <div>
          <dt>Nota final</dt>
          <dd>{score}</dd>
        </div>
        <div>
          <dt>Classificação</dt>
          <dd>{result.classification.label}</dd>
        </div>
      </dl>
      {result.classification.guidance ? <p>{result.classification.guidance}</p> : null}
    </section>
  )
}
