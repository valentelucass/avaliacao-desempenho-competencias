package br.com.avaliacao.desempenho.administracao.application;

import br.com.avaliacao.desempenho.administracao.application.AdministrativeReadException.Reason;
import br.com.avaliacao.desempenho.administracao.application.AdministrativeReadRepository.DraftCycleConfigurationView;
import br.com.avaliacao.desempenho.administracao.domain.model.AdministrativeReadAccessContext;
import br.com.avaliacao.desempenho.administracao.domain.model.AdministrativeReadAuthorizationPolicy;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

/** Coordena a leitura minimizada e repete a permissão específica antes do repositório. */
@Service
@ConditionalOnSqlServerPersistence
public class AdministrativeReadService {

  private final AdministrativeReadRepository repository;
  private final AdministrativeReadAuthorizationPolicy authorizationPolicy;

  @Autowired
  public AdministrativeReadService(AdministrativeReadRepository repository) {
    this(repository, new AdministrativeReadAuthorizationPolicy());
  }

  AdministrativeReadService(
      AdministrativeReadRepository repository,
      AdministrativeReadAuthorizationPolicy authorizationPolicy) {
    this.repository = Objects.requireNonNull(repository, "repositório não pode ser nulo");
    this.authorizationPolicy =
        Objects.requireNonNull(authorizationPolicy, "política de autorização não pode ser nula");
  }

  public List<AdministrativeReadRepository.NamedResourceView> listBranches(
      AdministrativeReadAccessContext actor) {
    require(authorizationPolicy.mayReadMasterData(actor));
    return read(repository::listBranches);
  }

  public List<AdministrativeReadRepository.NamedResourceView> listAreas(
      AdministrativeReadAccessContext actor) {
    require(authorizationPolicy.mayReadMasterData(actor));
    return read(repository::listAreas);
  }

  public List<AdministrativeReadRepository.CollaboratorView> listCollaborators(
      AdministrativeReadAccessContext actor) {
    require(authorizationPolicy.mayReadMasterData(actor));
    return read(repository::listCollaborators);
  }

  public List<AdministrativeReadRepository.ActiveAllocationView> listActiveAllocations(
      AdministrativeReadAccessContext actor) {
    require(authorizationPolicy.mayReadMasterData(actor));
    return read(repository::listActiveAllocations);
  }

  public List<AdministrativeReadRepository.ActiveManagerAssignmentView>
      listActiveManagerAssignments(AdministrativeReadAccessContext actor) {
    require(authorizationPolicy.mayReadManagerAssignments(actor));
    return read(repository::listActiveManagerAssignments);
  }

  public AdministrativeReadRepository.ManagerAssignmentOptionsView managerAssignmentOptions(
      AdministrativeReadAccessContext actor) {
    require(authorizationPolicy.mayReadManagerAssignments(actor));
    return read(
        () ->
            new AdministrativeReadRepository.ManagerAssignmentOptionsView(
                repository.listEligibleManagerOptions(),
                repository.listActiveCollaboratorOptions()));
  }

  public AdministrativeReadRepository.UserCollaboratorLinkOptionsView userCollaboratorLinkOptions(
      AdministrativeReadAccessContext actor) {
    require(authorizationPolicy.mayReadUserCollaboratorAssignments(actor));
    return read(
        () ->
            new AdministrativeReadRepository.UserCollaboratorLinkOptionsView(
                repository.listActiveUserOptions(), repository.listActiveCollaboratorOptions()));
  }

  public List<AdministrativeReadRepository.ActiveUserCollaboratorLinkView>
      listActiveUserCollaboratorLinks(AdministrativeReadAccessContext actor) {
    require(authorizationPolicy.mayReadUserCollaboratorAssignments(actor));
    return read(repository::listActiveUserCollaboratorLinks);
  }

  public List<AdministrativeReadRepository.ActiveQuestionnaireAssignmentView>
      listActiveQuestionnaireAssignments(AdministrativeReadAccessContext actor) {
    require(authorizationPolicy.mayReadMasterData(actor));
    return read(repository::listActiveQuestionnaireAssignments);
  }

  public List<AdministrativeReadRepository.QuestionnaireAssignmentOptionView>
      listQuestionnaireAssignmentOptions(AdministrativeReadAccessContext actor) {
    require(authorizationPolicy.mayReadMasterData(actor));
    return read(repository::listQuestionnaireAssignmentOptions);
  }

  public List<AdministrativeReadRepository.ApprovedQuestionnaireVersionView>
      listApprovedQuestionnaireVersions(AdministrativeReadAccessContext actor) {
    require(authorizationPolicy.mayReadApprovedQuestionnaireVersions(actor));
    return read(repository::listApprovedQuestionnaireVersions);
  }

  public DraftCycleConfiguration draftCycleConfiguration(
      UUID cycleId, AdministrativeReadAccessContext actor) {
    Objects.requireNonNull(cycleId, "identificador do ciclo não pode ser nulo");
    require(authorizationPolicy.mayReadDraftCycleConfiguration(actor));
    DraftCycleConfigurationView view =
        read(() -> repository.findDraftCycleConfiguration(cycleId))
            .orElseThrow(
                () ->
                    new AdministrativeReadException(
                        Reason.NOT_FOUND, "A configuração solicitada não está disponível."));
    return mapDraftConfiguration(view);
  }

  private static DraftCycleConfiguration mapDraftConfiguration(DraftCycleConfigurationView source) {
    try {
      ZoneId zoneId = ZoneId.of(source.timeZone());
      return new DraftCycleConfiguration(
          source.cycleId(),
          source.code(),
          source.name(),
          localDateTime(source.openingAtUtc(), zoneId),
          localDateTime(source.closingAtUtc(), zoneId),
          source.timeZone(),
          source.selfAssessmentEnabled(),
          source.questionnaires());
    } catch (DateTimeException exception) {
      throw new AdministrativeReadException(
          Reason.UNAVAILABLE, "A configuração administrativa não está disponível.");
    }
  }

  private static LocalDateTime localDateTime(Instant value, ZoneId zoneId) {
    return value == null ? null : value.atZone(zoneId).toLocalDateTime();
  }

  private static void require(boolean permitted) {
    if (!permitted) {
      throw new AdministrativeReadException(
          Reason.FORBIDDEN, "Acesso administrativo não permitido.");
    }
  }

  private static <T> T read(Supplier<T> operation) {
    try {
      return operation.get();
    } catch (AdministrativeReadException exception) {
      throw exception;
    } catch (DataAccessException exception) {
      throw new AdministrativeReadException(
          Reason.UNAVAILABLE, "A leitura administrativa não está disponível.");
    }
  }

  /** Configuração de rascunho no mesmo formato local aceito pela escrita administrativa. */
  public record DraftCycleConfiguration(
      UUID cycleId,
      String code,
      String name,
      LocalDateTime openingAtLocal,
      LocalDateTime closingAtLocal,
      String timeZone,
      boolean selfAssessmentEnabled,
      List<AdministrativeReadRepository.DraftAppliedQuestionnaireView> questionnaires) {

    public DraftCycleConfiguration {
      questionnaires = List.copyOf(questionnaires);
    }
  }
}
