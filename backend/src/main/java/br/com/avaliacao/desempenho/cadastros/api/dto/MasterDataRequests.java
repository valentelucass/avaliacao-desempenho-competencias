package br.com.avaliacao.desempenho.cadastros.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.UUID;

/** DTOs de escrita; o ator e a auditoria são sempre obtidos do contexto autenticado no servidor. */
public final class MasterDataRequests {

  private MasterDataRequests() {}

  public record NamedResource(@NotBlank @Size(max = 200) String name) {}

  public record Collaborator(@NotBlank @Size(max = 200) String displayName) {}

  public record Allocation(
      @NotNull UUID collaboratorId,
      UUID branchId,
      UUID areaId,
      @Size(max = 200) String managerText,
      @NotNull LocalDate startsOn) {}

  public record ManagerAssignment(
      @NotNull UUID managerUserId, @NotNull UUID collaboratorId, @NotNull LocalDate startsOn) {}

  public record UserCollaboratorLink(
      @NotNull UUID userId, @NotNull UUID collaboratorId, @NotNull LocalDate startsOn) {}

  public record QuestionnaireAssignment(
      @NotNull UUID cycleId, @NotNull UUID collaboratorId, @NotNull UUID cycleQuestionnaireId) {}

  public record Close(@NotNull LocalDate endsOn) {}

  public record Revocation(@NotBlank @Size(max = 500) String reason) {}
}
