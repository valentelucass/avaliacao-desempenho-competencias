package br.com.avaliacao.desempenho.administracao.application;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/**
 * Projeções administrativas minimizadas. Não contém credenciais, histórico, avaliações ou textos de
 * avaliação.
 */
public interface AdministrativeReadRepository {

  List<NamedResourceView> listBranches();

  List<NamedResourceView> listAreas();

  List<CollaboratorView> listCollaborators();

  List<ActiveAllocationView> listActiveAllocations();

  List<ActiveManagerAssignmentView> listActiveManagerAssignments();

  List<SelectionOptionView> listEligibleManagerOptions();

  List<SelectionOptionView> listActiveUserOptions();

  List<SelectionOptionView> listActiveCollaboratorOptions();

  List<ActiveUserCollaboratorLinkView> listActiveUserCollaboratorLinks();

  List<ActiveQuestionnaireAssignmentView> listActiveQuestionnaireAssignments();

  List<QuestionnaireAssignmentOptionView> listQuestionnaireAssignmentOptions();

  List<ApprovedQuestionnaireVersionView> listApprovedQuestionnaireVersions();

  Optional<DraftCycleConfigurationView> findDraftCycleConfiguration(UUID cycleId);

  record NamedResourceView(UUID id, String name, boolean active) {

    public NamedResourceView {
      Objects.requireNonNull(id, "identificador não pode ser nulo");
      requireText(name, "nome");
    }
  }

  record CollaboratorView(UUID id, String displayName, boolean active) {

    public CollaboratorView {
      Objects.requireNonNull(id, "identificador do colaborador não pode ser nulo");
      requireText(displayName, "nome de exibição");
    }
  }

  record ActiveAllocationView(
      UUID id,
      UUID collaboratorId,
      UUID branchId,
      UUID areaId,
      String managerText,
      LocalDate startsOn) {

    public ActiveAllocationView {
      Objects.requireNonNull(id, "identificador da lotação não pode ser nulo");
      Objects.requireNonNull(collaboratorId, "colaborador da lotação não pode ser nulo");
    }
  }

  record ActiveManagerAssignmentView(
      UUID id, UUID managerUserId, UUID collaboratorId, LocalDate startsOn) {

    public ActiveManagerAssignmentView {
      Objects.requireNonNull(id, "identificador do vínculo não pode ser nulo");
      Objects.requireNonNull(managerUserId, "gestor não pode ser nulo");
      Objects.requireNonNull(collaboratorId, "colaborador não pode ser nulo");
    }
  }

  /** Escolha identificável por nome de exibição, sem login, situação ou credencial. */
  record SelectionOptionView(UUID id, String displayName) {

    public SelectionOptionView {
      Objects.requireNonNull(id, "identificador da opção não pode ser nulo");
      requireText(displayName, "nome de exibição");
    }
  }

  record ManagerAssignmentOptionsView(
      List<SelectionOptionView> managers, List<SelectionOptionView> collaborators) {

    public ManagerAssignmentOptionsView {
      managers = List.copyOf(Objects.requireNonNull(managers, "gestores não podem ser nulos"));
      collaborators =
          List.copyOf(Objects.requireNonNull(collaborators, "colaboradores não podem ser nulos"));
    }
  }

  record UserCollaboratorLinkOptionsView(
      List<SelectionOptionView> users, List<SelectionOptionView> collaborators) {

    public UserCollaboratorLinkOptionsView {
      users = List.copyOf(Objects.requireNonNull(users, "usuários não podem ser nulos"));
      collaborators =
          List.copyOf(Objects.requireNonNull(collaborators, "colaboradores não podem ser nulos"));
    }
  }

  record ActiveUserCollaboratorLinkView(
      UUID id, UUID userId, UUID collaboratorId, LocalDate startsOn) {

    public ActiveUserCollaboratorLinkView {
      Objects.requireNonNull(id, "identificador do vínculo não pode ser nulo");
      Objects.requireNonNull(userId, "usuário não pode ser nulo");
      Objects.requireNonNull(collaboratorId, "colaborador não pode ser nulo");
    }
  }

  record ActiveQuestionnaireAssignmentView(
      UUID id,
      UUID cycleId,
      String cycleCode,
      String cycleName,
      UUID collaboratorId,
      UUID cycleQuestionnaireId,
      String questionnaireTitle) {

    public ActiveQuestionnaireAssignmentView {
      Objects.requireNonNull(id, "identificador da atribuição não pode ser nulo");
      Objects.requireNonNull(cycleId, "ciclo não pode ser nulo");
      requireText(cycleCode, "código do ciclo");
      requireText(cycleName, "nome do ciclo");
      Objects.requireNonNull(collaboratorId, "colaborador não pode ser nulo");
      Objects.requireNonNull(cycleQuestionnaireId, "questionário aplicado não pode ser nulo");
      requireText(questionnaireTitle, "título do questionário");
    }
  }

  record QuestionnaireAssignmentOptionView(
      UUID cycleId,
      String cycleCode,
      String cycleName,
      List<AppliedQuestionnaireOptionView> questionnaires) {

    public QuestionnaireAssignmentOptionView {
      Objects.requireNonNull(cycleId, "ciclo não pode ser nulo");
      requireText(cycleCode, "código do ciclo");
      requireText(cycleName, "nome do ciclo");
      questionnaires =
          List.copyOf(Objects.requireNonNull(questionnaires, "questionários não podem ser nulos"));
    }
  }

  record AppliedQuestionnaireOptionView(UUID cycleQuestionnaireId, String title) {

    public AppliedQuestionnaireOptionView {
      Objects.requireNonNull(cycleQuestionnaireId, "questionário aplicado não pode ser nulo");
      requireText(title, "título do questionário");
    }
  }

  record ApprovedQuestionnaireVersionView(
      UUID questionnaireVersionId,
      String questionnaireCode,
      String questionnaireName,
      int versionNumber,
      String title,
      List<CalculationMatrixOptionView> configurationOptions) {

    public ApprovedQuestionnaireVersionView {
      Objects.requireNonNull(questionnaireVersionId, "versão do questionário não pode ser nula");
      requireText(questionnaireCode, "código do questionário");
      requireText(questionnaireName, "nome do questionário");
      if (versionNumber < 1) {
        throw new IllegalArgumentException("A versão do questionário deve ser positiva.");
      }
      requireText(title, "título");
      configurationOptions =
          List.copyOf(Objects.requireNonNull(configurationOptions, "opções não podem ser nulas"));
    }
  }

  record CalculationMatrixOptionView(
      UUID calculationConfigurationVersionId,
      String calculationCode,
      int calculationVersionNumber,
      UUID classificationMatrixVersionId,
      String classificationMatrixCode,
      int classificationMatrixVersionNumber) {

    public CalculationMatrixOptionView {
      Objects.requireNonNull(
          calculationConfigurationVersionId, "configuração de cálculo não pode ser nula");
      requireText(calculationCode, "código de cálculo");
      if (calculationVersionNumber < 1) {
        throw new IllegalArgumentException("A versão de cálculo deve ser positiva.");
      }
      Objects.requireNonNull(classificationMatrixVersionId, "matriz não pode ser nula");
      requireText(classificationMatrixCode, "código da matriz");
      if (classificationMatrixVersionNumber < 1) {
        throw new IllegalArgumentException("A versão da matriz deve ser positiva.");
      }
    }
  }

  record DraftCycleConfigurationView(
      UUID cycleId,
      String code,
      String name,
      Instant openingAtUtc,
      Instant closingAtUtc,
      String timeZone,
      boolean selfAssessmentEnabled,
      List<DraftAppliedQuestionnaireView> questionnaires) {

    public DraftCycleConfigurationView {
      Objects.requireNonNull(cycleId, "identificador do ciclo não pode ser nulo");
      requireText(code, "código do ciclo");
      requireText(name, "nome do ciclo");
      requireText(timeZone, "fuso horário");
      questionnaires =
          List.copyOf(Objects.requireNonNull(questionnaires, "questionários não podem ser nulos"));
    }
  }

  record DraftAppliedQuestionnaireView(
      UUID cycleQuestionnaireId,
      UUID questionnaireVersionId,
      UUID calculationConfigurationVersionId,
      UUID classificationMatrixVersionId) {

    public DraftAppliedQuestionnaireView {
      Objects.requireNonNull(cycleQuestionnaireId, "questionário aplicado não pode ser nulo");
      Objects.requireNonNull(questionnaireVersionId, "versão do questionário não pode ser nula");
      Objects.requireNonNull(
          calculationConfigurationVersionId, "configuração de cálculo não pode ser nula");
      Objects.requireNonNull(classificationMatrixVersionId, "matriz não pode ser nula");
    }
  }

  private static void requireText(String value, String field) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException(field + " não pode ser vazio");
    }
  }
}
