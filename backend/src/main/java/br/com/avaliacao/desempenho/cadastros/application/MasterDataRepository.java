package br.com.avaliacao.desempenho.cadastros.application;

import java.time.LocalDate;
import java.util.UUID;

/** Porta de escrita para cadastros e vínculos administrativos. */
public interface MasterDataRepository {

  boolean createBranch(NamedRecord branch);

  boolean deactivateBranch(UUID branchId);

  /**
   * Remove somente filial já inativa e sem qualquer lotação, preservando os registros históricos.
   */
  boolean deleteInactiveUnusedBranch(UUID branchId);

  boolean createArea(NamedRecord area);

  boolean deactivateArea(UUID areaId);

  boolean createCollaborator(NamedRecord collaborator);

  boolean deactivateCollaborator(UUID collaboratorId);

  boolean createAllocation(AllocationRecord allocation);

  boolean closeAllocation(UUID allocationId, LocalDate endsOn, UUID actorUserId);

  boolean createManagerAssignment(ManagerAssignmentRecord assignment);

  boolean closeManagerAssignment(UUID assignmentId, LocalDate endsOn, UUID actorUserId);

  boolean createUserCollaboratorLink(UserCollaboratorLinkRecord link);

  boolean closeUserCollaboratorLink(UUID linkId, LocalDate endsOn, UUID actorUserId);

  boolean createQuestionnaireAssignment(QuestionnaireAssignmentRecord assignment);

  boolean revokeQuestionnaireAssignment(UUID assignmentId, String reason, UUID actorUserId);

  void writeAdministrativeAudit(
      UUID actorUserId, String action, String resourceType, UUID resourceId, String requestId);

  record NamedRecord(UUID id, String name) {}

  record AllocationRecord(
      UUID id,
      UUID collaboratorId,
      UUID branchId,
      UUID areaId,
      String managerText,
      LocalDate startsOn,
      UUID createdByUserId) {}

  record ManagerAssignmentRecord(
      UUID id, UUID managerUserId, UUID collaboratorId, LocalDate startsOn, UUID createdByUserId) {}

  record UserCollaboratorLinkRecord(
      UUID id, UUID userId, UUID collaboratorId, LocalDate startsOn, UUID createdByUserId) {}

  record QuestionnaireAssignmentRecord(
      UUID id,
      UUID cycleId,
      UUID collaboratorId,
      UUID cycleQuestionnaireId,
      UUID assignedByUserId) {}
}
