package br.com.avaliacao.desempenho.ciclosavaliacao.application;

import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleReadAccessContext;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleReadAuthorizationPolicy;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleReadScope;
import java.util.Objects;
import java.util.UUID;

/** Coordena a política de visibilidade com a consulta parametrizada do repositório. */
public final class EvaluationCycleReadService {

  public static final int DEFAULT_PAGE_LIMIT = 20;
  public static final int MAXIMUM_PAGE_LIMIT = 100;

  private final EvaluationCycleReadRepository repository;
  private final EvaluationCycleReadAuthorizationPolicy authorizationPolicy;

  public EvaluationCycleReadService(EvaluationCycleReadRepository repository) {
    this(repository, new EvaluationCycleReadAuthorizationPolicy());
  }

  EvaluationCycleReadService(
      EvaluationCycleReadRepository repository,
      EvaluationCycleReadAuthorizationPolicy authorizationPolicy) {
    this.repository = Objects.requireNonNull(repository, "repositório não pode ser nulo");
    this.authorizationPolicy =
        Objects.requireNonNull(authorizationPolicy, "política de autorização não pode ser nula");
  }

  public EvaluationCycleReadRepository.EvaluationCyclePage list(
      EvaluationCycleReadAccessContext actor, int limit, UUID cursor) {
    requireValidLimit(limit);
    EvaluationCycleReadScope scope = resolveScope(actor);
    return repository.listAccessible(actor.userId(), scope, limit, cursor);
  }

  public EvaluationCycleReadRepository.AppliedQuestionnaireView getAppliedQuestionnaire(
      UUID cycleId, UUID cycleQuestionnaireId, EvaluationCycleReadAccessContext actor) {
    Objects.requireNonNull(cycleId, "identificador do ciclo não pode ser nulo");
    Objects.requireNonNull(
        cycleQuestionnaireId, "identificador do questionário aplicado não pode ser nulo");
    EvaluationCycleReadScope scope = resolveScope(actor);
    return repository
        .findAppliedQuestionnaireAccessible(cycleId, cycleQuestionnaireId, actor.userId(), scope)
        .orElseThrow(EvaluationCycleNotFoundException::new);
  }

  private EvaluationCycleReadScope resolveScope(EvaluationCycleReadAccessContext actor) {
    EvaluationCycleReadAccessContext access =
        Objects.requireNonNull(actor, "ator não pode ser nulo");
    return authorizationPolicy
        .scopeFor(access)
        .orElseThrow(EvaluationCycleReadForbiddenException::new);
  }

  private static void requireValidLimit(int limit) {
    if (limit < 1 || limit > MAXIMUM_PAGE_LIMIT) {
      throw new EvaluationCycleReadValidationException("O limite de paginação é inválido.");
    }
  }
}
