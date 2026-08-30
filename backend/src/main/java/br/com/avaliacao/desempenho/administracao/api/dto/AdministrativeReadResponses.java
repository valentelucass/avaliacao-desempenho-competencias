package br.com.avaliacao.desempenho.administracao.api.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/** Respostas mínimas da administração; não representam entidades persistidas. */
public final class AdministrativeReadResponses {

  private AdministrativeReadResponses() {}

  public record NamedResource(UUID id, String name, boolean active) {}

  public record Collaborator(UUID id, String displayName, boolean active) {}

  public record ActiveAllocation(
      UUID id,
      UUID collaboratorId,
      UUID branchId,
      UUID areaId,
      String managerText,
      LocalDate startsOn) {}

  public record ActiveManagerAssignment(
      UUID id, UUID managerUserId, UUID collaboratorId, LocalDate startsOn) {}

  public record ActiveDirectorManagerAssignment(
      UUID id, UUID directorUserId, UUID managerCollaboratorId, LocalDate startsOn) {}

  public record SelectionOption(UUID id, String displayName) {}

  public record ManagerAssignmentOptions(
      List<SelectionOption> managers, List<SelectionOption> collaborators) {

    public ManagerAssignmentOptions {
      managers = List.copyOf(managers);
      collaborators = List.copyOf(collaborators);
    }
  }

  public record DirectorManagerAssignmentOptions(
      List<SelectionOption> directors, List<SelectionOption> collaborators) {

    public DirectorManagerAssignmentOptions {
      directors = List.copyOf(directors);
      collaborators = List.copyOf(collaborators);
    }
  }

  public record UserCollaboratorLinkOptions(
      List<SelectionOption> users, List<SelectionOption> collaborators) {

    public UserCollaboratorLinkOptions {
      users = List.copyOf(users);
      collaborators = List.copyOf(collaborators);
    }
  }

  public record ActiveUserCollaboratorLink(
      UUID id, UUID userId, UUID collaboratorId, LocalDate startsOn) {}

  public record ActiveQuestionnaireAssignment(
      UUID id,
      UUID cycleId,
      String cycleCode,
      String cycleName,
      UUID collaboratorId,
      UUID cycleQuestionnaireId,
      String questionnaireTitle) {}

  public record QuestionnaireAssignmentOption(
      UUID cycleId,
      String cycleCode,
      String cycleName,
      List<AppliedQuestionnaireOption> questionnaires) {

    public QuestionnaireAssignmentOption {
      questionnaires = List.copyOf(questionnaires);
    }
  }

  public record AppliedQuestionnaireOption(UUID cycleQuestionnaireId, String title) {}

  public record ApprovedQuestionnaireVersion(
      UUID questionnaireVersionId,
      String questionnaireCode,
      String questionnaireName,
      int versionNumber,
      String title,
      List<CalculationMatrixOption> configurationOptions) {

    public ApprovedQuestionnaireVersion {
      configurationOptions = List.copyOf(configurationOptions);
    }
  }

  public record CalculationMatrixOption(
      UUID calculationConfigurationVersionId,
      String calculationCode,
      int calculationVersionNumber,
      UUID classificationMatrixVersionId,
      String classificationMatrixCode,
      int classificationMatrixVersionNumber) {}

  public record DraftCycleConfiguration(
      UUID cycleId,
      String code,
      String name,
      LocalDateTime openingAtLocal,
      LocalDateTime closingAtLocal,
      String timeZone,
      boolean selfAssessmentEnabled,
      List<AppliedQuestionnaire> questionnaires) {

    public DraftCycleConfiguration {
      questionnaires = List.copyOf(questionnaires);
    }
  }

  public record AppliedQuestionnaire(
      UUID cycleQuestionnaireId,
      UUID questionnaireVersionId,
      UUID calculationConfigurationVersionId,
      UUID classificationMatrixVersionId) {}
}
