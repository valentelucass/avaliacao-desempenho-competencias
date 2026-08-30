package br.com.avaliacao.desempenho.avaliacoes.api.dto;

import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentValidationException;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentType;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/** Corpo de criação; o tipo escolhe somente um fluxo já autorizado no servidor. */
public record CreateAssessmentRequest(
    @NotNull AssessmentType type, @NotNull UUID cycleId, UUID collaboratorId) {

  public UUID managerCollaboratorId() {
    if (type != AssessmentType.GESTOR || collaboratorId == null) {
      throw new AssessmentValidationException(
          "Uma avaliação de gestor exige o colaborador e o tipo correspondente.");
    }
    return collaboratorId;
  }

  public UUID directorCollaboratorId() {
    if (type != AssessmentType.DIRETORIA_GERENCIA || collaboratorId == null) {
      throw new AssessmentValidationException(
          "Uma avaliação de Diretoria exige a Gerência e o tipo correspondente.");
    }
    return collaboratorId;
  }

  public void requireSelfAssessment() {
    if (type != AssessmentType.AUTOAVALIACAO || collaboratorId != null) {
      throw new AssessmentValidationException(
          "A autoavaliação não aceita colaborador informado pelo cliente.");
    }
  }
}
