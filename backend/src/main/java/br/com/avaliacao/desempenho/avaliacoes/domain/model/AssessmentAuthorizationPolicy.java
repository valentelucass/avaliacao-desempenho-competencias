package br.com.avaliacao.desempenho.avaliacoes.domain.model;

import java.util.Objects;
import java.util.UUID;

/** Permissões de alto nível; o repositório ainda deve validar o vínculo por recurso no SQL. */
public final class AssessmentAuthorizationPolicy {

  public static final String EVALUATE_LINKED = "AVALIACOES.AVALIAR_VINCULADOS";
  public static final String EVALUATE_LINKED_MANAGERS = "AVALIACOES.AVALIAR_GERENCIAS_VINCULADAS";
  public static final String VIEW_OWN_RESPONSES = "AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS";
  public static final String VIEW_ALL = "AVALIACOES.VISUALIZAR_TODAS";
  public static final String PUBLISH = "AVALIACOES.PUBLICAR";
  public static final String REOPEN = "AVALIACOES.REABRIR";
  public static final String RECORD_OWN_FEEDBACK = "AVALIACOES.REGISTRAR_FEEDBACK_PROPRIO";
  public static final String FILL_OWN_SELF_ASSESSMENT = "AUTOAVALIACOES.PREENCHER_PROPRIA";
  public static final String SUBMIT_OWN_SELF_ASSESSMENT = "AUTOAVALIACOES.ENVIAR_PROPRIA";
  public static final String VIEW_OWN_SELF_ASSESSMENT = "AUTOAVALIACOES.VISUALIZAR_PROPRIA";

  public boolean canCreateManagerAssessment(AssessmentAccessContext actor) {
    return Objects.requireNonNull(actor, "actor").has(EVALUATE_LINKED);
  }

  public boolean canCreateDirectorAssessment(AssessmentAccessContext actor) {
    AssessmentAccessContext safeActor = Objects.requireNonNull(actor, "actor");
    return safeActor.has(EVALUATE_LINKED_MANAGERS)
        && safeActor.hasRole("DIRETORIA")
        && !safeActor.hasRole("ADMINISTRADOR_PLATAFORMA");
  }

  public boolean canCreateOrEditSelfAssessment(AssessmentAccessContext actor) {
    return Objects.requireNonNull(actor, "actor").has(FILL_OWN_SELF_ASSESSMENT);
  }

  public boolean canSubmit(AssessmentAccessContext actor, AssessmentOwnership ownership) {
    Objects.requireNonNull(actor, "actor");
    AssessmentOwnership assessment = Objects.requireNonNull(ownership, "ownership");
    if (!actor.userId().equals(assessment.authorUserId())) {
      return false;
    }
    return switch (assessment.type()) {
      case GESTOR -> actor.has(EVALUATE_LINKED);
      case DIRETORIA_GERENCIA ->
          actor.has(EVALUATE_LINKED_MANAGERS)
              && actor.hasRole("DIRETORIA")
              && !actor.hasRole("ADMINISTRADOR_PLATAFORMA");
      case AUTOAVALIACAO -> actor.has(SUBMIT_OWN_SELF_ASSESSMENT);
    };
  }

  public boolean canView(AssessmentAccessContext actor, AssessmentOwnership ownership) {
    Objects.requireNonNull(actor, "actor");
    AssessmentOwnership assessment = Objects.requireNonNull(ownership, "ownership");
    if (actor.has(VIEW_ALL)) {
      return true;
    }
    if (!actor.userId().equals(assessment.authorUserId())) {
      return false;
    }
    return switch (assessment.type()) {
      case GESTOR -> actor.has(VIEW_OWN_RESPONSES);
      case DIRETORIA_GERENCIA ->
          actor.has(EVALUATE_LINKED_MANAGERS)
              && actor.hasRole("DIRETORIA")
              && !actor.hasRole("ADMINISTRADOR_PLATAFORMA");
      case AUTOAVALIACAO -> actor.has(VIEW_OWN_SELF_ASSESSMENT);
    };
  }

  public boolean canPublish(AssessmentAccessContext actor, AssessmentType type) {
    AssessmentAccessContext safeActor = Objects.requireNonNull(actor, "actor");
    Objects.requireNonNull(type, "tipo não pode ser nulo");
    return safeActor.has(PUBLISH) && hasAdministrativeDecisionRole(safeActor);
  }

  public boolean canReopen(AssessmentAccessContext actor, AssessmentType type) {
    AssessmentAccessContext safeActor = Objects.requireNonNull(actor, "actor");
    Objects.requireNonNull(type, "tipo não pode ser nulo");
    return safeActor.has(REOPEN) && hasAdministrativeDecisionRole(safeActor);
  }

  public boolean canRecordOwnFeedback(
      AssessmentAccessContext actor, AssessmentOwnership ownership, FeedbackStatus feedbackStatus) {
    AssessmentAccessContext safeActor = Objects.requireNonNull(actor, "actor");
    AssessmentOwnership assessment = Objects.requireNonNull(ownership, "assessment");
    return safeActor.userId().equals(assessment.authorUserId())
        && assessment.type() != AssessmentType.AUTOAVALIACAO
        && feedbackStatus == FeedbackStatus.PENDENTE
        && safeActor.has(RECORD_OWN_FEEDBACK)
        && (assessment.type() != AssessmentType.DIRETORIA_GERENCIA
            || (safeActor.hasRole("DIRETORIA") && !safeActor.hasRole("ADMINISTRADOR_PLATAFORMA")));
  }

  private static boolean hasAdministrativeDecisionRole(AssessmentAccessContext actor) {
    return !actor.hasRole("ADMINISTRADOR_PLATAFORMA")
        && (actor.hasRole("GERENCIA_RH") || actor.hasRole("DIRETORIA"));
  }

  public record AssessmentOwnership(UUID authorUserId, AssessmentType type) {

    public AssessmentOwnership {
      Objects.requireNonNull(authorUserId, "authorUserId");
      Objects.requireNonNull(type, "type");
    }
  }
}
