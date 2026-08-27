package br.com.avaliacao.desempenho.ciclosavaliacao.application;

import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleConfigurationDraft;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleDraft;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleStatus;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Porta de escrita para ciclos de rascunho e seus questionários efetivamente aplicados. */
public interface EvaluationCycleAdministrationRepository {

  CreatedCycle createDraftCycle(EvaluationCycleDraft draft, UUID actorUserId, String requestId);

  boolean replaceDraftConfiguration(
      UUID cycleId, EvaluationCycleConfigurationDraft configuration, UUID actorUserId);

  Optional<EvaluationCycleStatus> lockCurrentStatus(UUID cycleId);

  boolean transition(
      UUID cycleId,
      EvaluationCycleStatus sourceStatus,
      EvaluationCycleStatus targetStatus,
      UUID actorUserId,
      String requestId);

  void writeAdministrativeAudit(
      UUID actorUserId, String action, String resourceType, UUID resourceId, String requestId);

  record CreatedCycle(UUID cycleId, List<AppliedQuestionnaire> questionnaires) {

    public CreatedCycle {
      questionnaires = List.copyOf(questionnaires);
    }
  }

  record AppliedQuestionnaire(UUID cycleQuestionnaireId, UUID questionnaireVersionId) {}
}
