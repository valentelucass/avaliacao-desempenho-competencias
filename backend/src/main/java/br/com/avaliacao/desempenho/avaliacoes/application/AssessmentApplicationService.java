package br.com.avaliacao.desempenho.avaliacoes.application;

import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAccessContext;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAuthorizationPolicy;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

/**
 * Casos de uso que conservam a autorização no servidor e delegam consistência ao repositório SQL.
 */
@Service
@ConditionalOnSqlServerPersistence
@ConditionalOnProperty(prefix = "app.assessments", name = "enabled", havingValue = "true")
public class AssessmentApplicationService {

  private final AssessmentRepository repository;
  private final AssessmentAuthorizationPolicy authorizationPolicy =
      new AssessmentAuthorizationPolicy();

  public AssessmentApplicationService(AssessmentRepository repository) {
    this.repository = repository;
  }

  public AssessmentRepository.AssessmentPageView list(
      AssessmentAccessContext actor,
      AssessmentRepository.AssessmentListFilter filter,
      int limit,
      AssessmentRepository.AssessmentCursor cursor) {
    if (limit < 1 || limit > 100) {
      throw new AssessmentValidationException("O limite deve estar entre 1 e 100.");
    }
    return repository.listAccessible(
        Objects.requireNonNull(actor, "actor"),
        Objects.requireNonNullElse(filter, AssessmentRepository.AssessmentListFilter.none()),
        limit,
        cursor);
  }

  public List<AssessmentRepository.ManagerCreationOptionView> listManagerCreationOptions(
      UUID cycleId, AssessmentAccessContext actor) {
    AssessmentAccessContext safeActor = Objects.requireNonNull(actor, "actor");
    if (!authorizationPolicy.canCreateManagerAssessment(safeActor)) {
      throw new AssessmentForbiddenException();
    }
    return repository.listManagerCreationOptions(
        Objects.requireNonNull(cycleId, "cycleId"), safeActor);
  }

  public List<AssessmentRepository.ManagerCreationOptionView> listDirectorCreationOptions(
      UUID cycleId, AssessmentAccessContext actor) {
    AssessmentAccessContext safeActor = Objects.requireNonNull(actor, "actor");
    if (!authorizationPolicy.canCreateDirectorAssessment(safeActor)) {
      throw new AssessmentForbiddenException();
    }
    return repository.listDirectorCreationOptions(
        Objects.requireNonNull(cycleId, "cycleId"), safeActor);
  }

  public AssessmentRepository.AssessmentDetailView get(
      UUID assessmentId, AssessmentAccessContext actor) {
    return repository
        .findAccessible(assessmentId, actor)
        .orElseThrow(() -> new AssessmentNotFoundException(assessmentId));
  }

  /**
   * Autoriza a impressão pela mesma regra de leitura do detalhe e registra somente o evento. A
   * cópia é gerada localmente pelo navegador; a API não cria nem armazena PDF.
   */
  public void recordPrint(UUID assessmentId, AssessmentAccessContext actor, String requestId) {
    get(assessmentId, actor);
    repository.recordPrint(assessmentId, actor, requestId);
  }

  public AssessmentRepository.AssessmentDetailView createManagerDraft(
      UUID cycleId,
      UUID collaboratorId,
      AssessmentAccessContext actor,
      String idempotencyKey,
      String requestId) {
    if (!authorizationPolicy.canCreateManagerAssessment(actor)) {
      throw new AssessmentForbiddenException();
    }
    return repository.createManagerDraft(cycleId, collaboratorId, actor, idempotencyKey, requestId);
  }

  public AssessmentRepository.AssessmentDetailView createSelfAssessmentDraft(
      UUID cycleId, AssessmentAccessContext actor, String idempotencyKey, String requestId) {
    if (!authorizationPolicy.canCreateOrEditSelfAssessment(actor)) {
      throw new AssessmentForbiddenException();
    }
    return repository.createSelfAssessmentDraft(cycleId, actor, idempotencyKey, requestId);
  }

  public AssessmentRepository.AssessmentDetailView createDirectorDraft(
      UUID cycleId,
      UUID collaboratorId,
      AssessmentAccessContext actor,
      String idempotencyKey,
      String requestId) {
    if (!authorizationPolicy.canCreateDirectorAssessment(actor)) {
      throw new AssessmentForbiddenException();
    }
    return repository.createDirectorDraft(
        cycleId, collaboratorId, actor, idempotencyKey, requestId);
  }

  public AssessmentRepository.AssessmentDetailView saveDraft(
      UUID assessmentId,
      AssessmentRepository.DraftContent draft,
      String expectedRevision,
      AssessmentAccessContext actor,
      String requestId) {
    return repository.replaceDraft(assessmentId, draft, expectedRevision, actor, requestId);
  }

  public AssessmentRepository.AssessmentDetailView submit(
      UUID assessmentId,
      String expectedRevision,
      AssessmentAccessContext actor,
      String idempotencyKey,
      String requestId) {
    return repository.submit(assessmentId, expectedRevision, actor, idempotencyKey, requestId);
  }

  public AssessmentRepository.AssessmentDetailView publish(
      UUID assessmentId, AssessmentAccessContext actor, String idempotencyKey, String requestId) {
    return repository.publish(assessmentId, actor, idempotencyKey, requestId);
  }

  public AssessmentRepository.AssessmentDetailView reopen(
      UUID assessmentId,
      String reason,
      AssessmentAccessContext actor,
      String idempotencyKey,
      String requestId) {
    if (reason == null || reason.isBlank()) {
      throw new AssessmentValidationException("A reabertura exige motivo.");
    }
    return repository.reopen(assessmentId, reason.strip(), actor, idempotencyKey, requestId);
  }

  public AssessmentRepository.AssessmentDetailView completeFeedback(
      UUID assessmentId,
      LocalDate feedbackDate,
      String comment,
      AssessmentAccessContext actor,
      String idempotencyKey,
      String requestId) {
    if (feedbackDate == null || comment == null || comment.isBlank()) {
      throw new AssessmentValidationException("O feedback exige data e comentário.");
    }
    return repository.completeFeedback(
        assessmentId, feedbackDate, comment.strip(), actor, idempotencyKey, requestId);
  }
}
