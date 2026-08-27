package br.com.avaliacao.desempenho.ciclosavaliacao.adminapi.dto;

import java.util.List;
import java.util.UUID;

/** Identificadores mínimos para criar atribuições de questionário no ciclo posteriormente. */
public record CreatedEvaluationCycleResponse(
    UUID cycleId, List<AppliedQuestionnaire> questionnaires) {

  public CreatedEvaluationCycleResponse {
    questionnaires = List.copyOf(questionnaires);
  }

  public record AppliedQuestionnaire(UUID cycleQuestionnaireId, UUID questionnaireVersionId) {}
}
