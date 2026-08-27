package br.com.avaliacao.desempenho.questionarios.application;

import br.com.avaliacao.desempenho.questionarios.domain.model.QuestionnaireVersionDraft;
import java.util.UUID;

/**
 * Porta para persistir uma versão completa de questionário e seus artefatos de cálculo congelados.
 */
public interface QuestionnaireAdministrationRepository {

  CreatedQuestionnaireVersion createFrozenVersion(
      QuestionnaireVersionDraft draft, UUID actorUserId);

  void writeAdministrativeAudit(
      UUID actorUserId, String action, String resourceType, UUID resourceId, String requestId);

  record CreatedQuestionnaireVersion(
      UUID questionnaireVersionId,
      UUID calculationConfigurationVersionId,
      UUID classificationMatrixVersionId,
      boolean calculationConfigurationCreated,
      boolean classificationMatrixCreated) {

    public CreatedQuestionnaireVersion(
        UUID questionnaireVersionId,
        UUID calculationConfigurationVersionId,
        UUID classificationMatrixVersionId) {
      this(
          questionnaireVersionId,
          calculationConfigurationVersionId,
          classificationMatrixVersionId,
          true,
          true);
    }
  }
}
