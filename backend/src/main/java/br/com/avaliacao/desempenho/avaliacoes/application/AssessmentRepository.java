package br.com.avaliacao.desempenho.avaliacoes.application;

import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAccessContext;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentType;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.FeedbackStatus;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Porta persistente das avaliações. Todas as operações recebem o ator para validar escopo no SQL.
 */
public interface AssessmentRepository {

  AssessmentPageView listAccessible(
      AssessmentAccessContext actor,
      AssessmentListFilter filter,
      int limit,
      AssessmentCursor cursor);

  List<ManagerCreationOptionView> listManagerCreationOptions(
      UUID cycleId, AssessmentAccessContext actor);

  List<ManagerCreationOptionView> listDirectorCreationOptions(
      UUID cycleId, AssessmentAccessContext actor);

  List<CreationCycleOptionView> listCreationCycleOptions(
      AssessmentType assessmentType, AssessmentAccessContext actor);

  Optional<AssessmentDetailView> findAccessible(UUID assessmentId, AssessmentAccessContext actor);

  /** Registra a impressão já autorizada de uma avaliação, sem persistir seu conteúdo. */
  void recordPrint(UUID assessmentId, AssessmentAccessContext actor, String requestId);

  AssessmentDetailView createManagerDraft(
      UUID cycleId,
      UUID collaboratorId,
      AssessmentAccessContext actor,
      String idempotencyKey,
      String requestId);

  AssessmentDetailView createSelfAssessmentDraft(
      UUID cycleId, AssessmentAccessContext actor, String idempotencyKey, String requestId);

  AssessmentDetailView createDirectorDraft(
      UUID cycleId,
      UUID collaboratorId,
      AssessmentAccessContext actor,
      String idempotencyKey,
      String requestId);

  AssessmentDetailView replaceDraft(
      UUID assessmentId,
      DraftContent draft,
      String expectedRevision,
      AssessmentAccessContext actor,
      String requestId);

  AssessmentDetailView submit(
      UUID assessmentId,
      String expectedRevision,
      AssessmentAccessContext actor,
      String idempotencyKey,
      String requestId);

  AssessmentDetailView publish(
      UUID assessmentId, AssessmentAccessContext actor, String idempotencyKey, String requestId);

  AssessmentDetailView reopen(
      UUID assessmentId,
      String reason,
      AssessmentAccessContext actor,
      String idempotencyKey,
      String requestId);

  AssessmentDetailView completeFeedback(
      UUID assessmentId,
      LocalDate feedbackDate,
      String comment,
      AssessmentAccessContext actor,
      String idempotencyKey,
      String requestId);

  record AssessmentSummaryView(
      UUID id,
      UUID cycleId,
      String cycleName,
      String evaluatedDisplayName,
      AssessmentType type,
      String status,
      FeedbackStatus feedbackStatus,
      String revision,
      Instant updatedAt) {}

  record AssessmentPageView(List<AssessmentSummaryView> items, AssessmentCursor nextCursor) {}

  /** Filtros opcionais; o repositório sempre reaplica o escopo do ator. */
  record AssessmentListFilter(UUID cycleId, UUID collaboratorId) {
    public static AssessmentListFilter none() {
      return new AssessmentListFilter(null, null);
    }
  }

  /** Cursor estável da ordenação por atualização decrescente e identificador. */
  record AssessmentCursor(Instant updatedAt, UUID id) {}

  record ManagerCreationOptionView(UUID id, String displayName) {}

  /** Ciclo que já possui ao menos uma criação possível para a jornada solicitada. */
  record CreationCycleOptionView(UUID id, String name) {}

  record AssessmentDetailView(
      AssessmentSummaryView summary,
      String questionnaireVersion,
      List<CompetencyView> competencies,
      List<AnswerView> answers,
      String comment,
      String actionPlan,
      ResultView result,
      List<CompetencyScoreView> competencyScores,
      FeedbackView feedback) {}

  record CompetencyView(UUID id, String name, List<QuestionView> questions) {}

  record QuestionView(
      UUID id, String text, String description, boolean required, List<OptionView> options) {}

  record OptionView(UUID id, String label, int points) {}

  record AnswerView(UUID questionId, UUID optionId) {}

  record ResultView(String finalScore, String classification, String guidance) {}

  record FeedbackView(LocalDate feedbackDate, String comment, Instant completedAt) {}

  /** Pontuação já consolidada no servidor para um eixo do resumo individual. */
  record CompetencyScoreView(UUID id, String name, BigDecimal score) {}

  record DraftContent(List<AnswerView> answers, String comment, String actionPlan) {}
}
