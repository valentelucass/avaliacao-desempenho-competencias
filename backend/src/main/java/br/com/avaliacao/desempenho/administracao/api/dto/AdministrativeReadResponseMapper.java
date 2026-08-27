package br.com.avaliacao.desempenho.administracao.api.dto;

import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.ActiveAllocation;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.ActiveManagerAssignment;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.ActiveQuestionnaireAssignment;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.ActiveUserCollaboratorLink;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.AppliedQuestionnaire;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.AppliedQuestionnaireOption;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.ApprovedQuestionnaireVersion;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.CalculationMatrixOption;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.Collaborator;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.DraftCycleConfiguration;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.ManagerAssignmentOptions;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.NamedResource;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.QuestionnaireAssignmentOption;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.SelectionOption;
import br.com.avaliacao.desempenho.administracao.api.dto.AdministrativeReadResponses.UserCollaboratorLinkOptions;
import br.com.avaliacao.desempenho.administracao.application.AdministrativeReadRepository;
import br.com.avaliacao.desempenho.administracao.application.AdministrativeReadService;
import java.util.List;

/** Converte projeções de aplicação em DTOs sem ampliar os dados retornados. */
public final class AdministrativeReadResponseMapper {

  public List<NamedResource> toNamedResources(
      List<AdministrativeReadRepository.NamedResourceView> source) {
    return source.stream()
        .map(value -> new NamedResource(value.id(), value.name(), value.active()))
        .toList();
  }

  public List<Collaborator> toCollaborators(
      List<AdministrativeReadRepository.CollaboratorView> source) {
    return source.stream()
        .map(value -> new Collaborator(value.id(), value.displayName(), value.active()))
        .toList();
  }

  public List<ActiveAllocation> toActiveAllocations(
      List<AdministrativeReadRepository.ActiveAllocationView> source) {
    return source.stream()
        .map(
            value ->
                new ActiveAllocation(
                    value.id(),
                    value.collaboratorId(),
                    value.branchId(),
                    value.areaId(),
                    value.managerText(),
                    value.startsOn()))
        .toList();
  }

  public List<ActiveManagerAssignment> toActiveManagerAssignments(
      List<AdministrativeReadRepository.ActiveManagerAssignmentView> source) {
    return source.stream()
        .map(
            value ->
                new ActiveManagerAssignment(
                    value.id(), value.managerUserId(), value.collaboratorId(), value.startsOn()))
        .toList();
  }

  public ManagerAssignmentOptions toManagerAssignmentOptions(
      AdministrativeReadRepository.ManagerAssignmentOptionsView source) {
    return new ManagerAssignmentOptions(
        toSelectionOptions(source.managers()), toSelectionOptions(source.collaborators()));
  }

  public UserCollaboratorLinkOptions toUserCollaboratorLinkOptions(
      AdministrativeReadRepository.UserCollaboratorLinkOptionsView source) {
    return new UserCollaboratorLinkOptions(
        toSelectionOptions(source.users()), toSelectionOptions(source.collaborators()));
  }

  public List<ActiveUserCollaboratorLink> toActiveUserCollaboratorLinks(
      List<AdministrativeReadRepository.ActiveUserCollaboratorLinkView> source) {
    return source.stream()
        .map(
            value ->
                new ActiveUserCollaboratorLink(
                    value.id(), value.userId(), value.collaboratorId(), value.startsOn()))
        .toList();
  }

  public List<ActiveQuestionnaireAssignment> toActiveQuestionnaireAssignments(
      List<AdministrativeReadRepository.ActiveQuestionnaireAssignmentView> source) {
    return source.stream()
        .map(
            value ->
                new ActiveQuestionnaireAssignment(
                    value.id(),
                    value.cycleId(),
                    value.cycleCode(),
                    value.cycleName(),
                    value.collaboratorId(),
                    value.cycleQuestionnaireId(),
                    value.questionnaireTitle()))
        .toList();
  }

  public List<QuestionnaireAssignmentOption> toQuestionnaireAssignmentOptions(
      List<AdministrativeReadRepository.QuestionnaireAssignmentOptionView> source) {
    return source.stream().map(this::toQuestionnaireAssignmentOption).toList();
  }

  public List<ApprovedQuestionnaireVersion> toApprovedQuestionnaireVersions(
      List<AdministrativeReadRepository.ApprovedQuestionnaireVersionView> source) {
    return source.stream().map(this::toApprovedQuestionnaireVersion).toList();
  }

  public DraftCycleConfiguration toDraftCycleConfiguration(
      AdministrativeReadService.DraftCycleConfiguration source) {
    return new DraftCycleConfiguration(
        source.cycleId(),
        source.code(),
        source.name(),
        source.openingAtLocal(),
        source.closingAtLocal(),
        source.timeZone(),
        source.selfAssessmentEnabled(),
        source.questionnaires().stream().map(this::toAppliedQuestionnaire).toList());
  }

  private ApprovedQuestionnaireVersion toApprovedQuestionnaireVersion(
      AdministrativeReadRepository.ApprovedQuestionnaireVersionView source) {
    return new ApprovedQuestionnaireVersion(
        source.questionnaireVersionId(),
        source.questionnaireCode(),
        source.questionnaireName(),
        source.versionNumber(),
        source.title(),
        source.configurationOptions().stream().map(this::toCalculationMatrixOption).toList());
  }

  private QuestionnaireAssignmentOption toQuestionnaireAssignmentOption(
      AdministrativeReadRepository.QuestionnaireAssignmentOptionView source) {
    return new QuestionnaireAssignmentOption(
        source.cycleId(),
        source.cycleCode(),
        source.cycleName(),
        source.questionnaires().stream().map(this::toAppliedQuestionnaireOption).toList());
  }

  private AppliedQuestionnaireOption toAppliedQuestionnaireOption(
      AdministrativeReadRepository.AppliedQuestionnaireOptionView source) {
    return new AppliedQuestionnaireOption(source.cycleQuestionnaireId(), source.title());
  }

  private CalculationMatrixOption toCalculationMatrixOption(
      AdministrativeReadRepository.CalculationMatrixOptionView source) {
    return new CalculationMatrixOption(
        source.calculationConfigurationVersionId(),
        source.calculationCode(),
        source.calculationVersionNumber(),
        source.classificationMatrixVersionId(),
        source.classificationMatrixCode(),
        source.classificationMatrixVersionNumber());
  }

  private AppliedQuestionnaire toAppliedQuestionnaire(
      AdministrativeReadRepository.DraftAppliedQuestionnaireView source) {
    return new AppliedQuestionnaire(
        source.cycleQuestionnaireId(),
        source.questionnaireVersionId(),
        source.calculationConfigurationVersionId(),
        source.classificationMatrixVersionId());
  }

  private List<SelectionOption> toSelectionOptions(
      List<AdministrativeReadRepository.SelectionOptionView> source) {
    return source.stream()
        .map(value -> new SelectionOption(value.id(), value.displayName()))
        .toList();
  }
}
