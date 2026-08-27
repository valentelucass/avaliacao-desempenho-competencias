package br.com.avaliacao.desempenho.avaliacoes.application;

import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAccessContext;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Porta persistente das avaliações. Todas as operações recebem o ator para validar escopo no SQL.
 */
public interface AssessmentRepository {

  AssessmentPageView listAccessible(
      AssessmentAccessContext actor, int limit, AssessmentCursor cursor);

  List<ManagerCreationOptionView> listManagerCreationOptions(
      UUID cycleId, AssessmentAccessContext actor);

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

  record AssessmentSummaryView(
      UUID id,
      UUID cycleId,
      String cycleName,
      String evaluatedDisplayName,
      AssessmentType type,
      String status,
      String revision,
      Instant updatedAt) {}

  record AssessmentPageView(List<AssessmentSummaryView> items, AssessmentCursor nextCursor) {}

  /** Cursor estável da ordenação por atualização decrescente e identificador. */
  record AssessmentCursor(Instant updatedAt, UUID id) {}

  record ManagerCreationOptionView(UUID id, String displayName) {}

  record AssessmentDetailView(
      AssessmentSummaryView summary,
      String questionnaireVersion,
      List<CompetencyView> competencies,
      List<AnswerView> answers,
      String comment,
      String actionPlan,
      ResultView result) {}

  record CompetencyView(UUID id, String name, List<QuestionView> questions) {}

  record QuestionView(
      UUID id, String text, String description, boolean required, List<OptionView> options) {}

  record OptionView(UUID id, String label, int points) {}

  record AnswerView(UUID questionId, UUID optionId) {}

  record ResultView(String finalScore, String classification, String guidance) {}

  record DraftContent(List<AnswerView> answers, String comment, String actionPlan) {}
}
