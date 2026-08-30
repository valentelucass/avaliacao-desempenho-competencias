package br.com.avaliacao.desempenho.ciclosavaliacao.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleReadAccessContext;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleReadAuthorizationPolicy;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleReadScope;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleStatus;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class EvaluationCycleReadServiceTests {

  @Test
  void delegatesOnlyTheManagerRelationshipScopeToTheRepository() {
    CapturingRepository repository = new CapturingRepository();
    EvaluationCycleReadService service = new EvaluationCycleReadService(repository);
    UUID actorId = UUID.randomUUID();
    UUID cursor = UUID.randomUUID();

    EvaluationCycleReadRepository.EvaluationCyclePage page =
        service.list(
            new EvaluationCycleReadAccessContext(
                actorId, Set.of(EvaluationCycleReadAuthorizationPolicy.EVALUATE_LINKED)),
            20,
            cursor);

    assertThat(repository.actorUserId).isEqualTo(actorId);
    assertThat(repository.scope).isEqualTo(new EvaluationCycleReadScope(false, true, false, false));
    assertThat(repository.limit).isEqualTo(20);
    assertThat(repository.cursor).isEqualTo(cursor);
    assertThat(page.items()).hasSize(1);
  }

  @Test
  void rejectsInvalidPaginationBeforeCallingTheRepository() {
    CapturingRepository repository = new CapturingRepository();
    EvaluationCycleReadService service = new EvaluationCycleReadService(repository);

    assertThatThrownBy(
            () ->
                service.list(
                    actor(EvaluationCycleReadAuthorizationPolicy.CYCLES_MANAGE),
                    EvaluationCycleReadService.MAXIMUM_PAGE_LIMIT + 1,
                    null))
        .isInstanceOf(EvaluationCycleReadValidationException.class);

    assertThat(repository.listCalls).isZero();
  }

  @Test
  void returnsNotFoundForAnAppliedQuestionnaireOutsideTheResolvedScope() {
    CapturingRepository repository = new CapturingRepository();
    repository.appliedQuestionnaire = Optional.empty();
    EvaluationCycleReadService service = new EvaluationCycleReadService(repository);

    assertThatThrownBy(
            () ->
                service.getAppliedQuestionnaire(
                    UUID.randomUUID(),
                    UUID.randomUUID(),
                    actor(EvaluationCycleReadAuthorizationPolicy.FILL_OWN_SELF_ASSESSMENT)))
        .isInstanceOf(EvaluationCycleNotFoundException.class);
  }

  @Test
  void rejectsAnActorWithoutAnyConfirmedReadPath() {
    CapturingRepository repository = new CapturingRepository();
    EvaluationCycleReadService service = new EvaluationCycleReadService(repository);

    assertThatThrownBy(() -> service.list(actor(), 20, null))
        .isInstanceOf(EvaluationCycleReadForbiddenException.class);

    assertThat(repository.listCalls).isZero();
  }

  private static EvaluationCycleReadAccessContext actor(String... permissions) {
    return new EvaluationCycleReadAccessContext(UUID.randomUUID(), Set.of(permissions));
  }

  private static final class CapturingRepository implements EvaluationCycleReadRepository {

    private UUID actorUserId;
    private EvaluationCycleReadScope scope;
    private int limit;
    private UUID cursor;
    private int listCalls;
    private Optional<AppliedQuestionnaireView> appliedQuestionnaire = Optional.empty();

    @Override
    public EvaluationCyclePage listAccessible(
        UUID actorUserId, EvaluationCycleReadScope scope, int fetchLimit, UUID cursor) {
      this.actorUserId = actorUserId;
      this.scope = scope;
      this.limit = fetchLimit;
      this.cursor = cursor;
      this.listCalls++;
      return new EvaluationCyclePage(
          List.of(
              new EvaluationCycleView(UUID.randomUUID(), "Ciclo", EvaluationCycleStatus.ABERTO)),
          null);
    }

    @Override
    public Optional<AppliedQuestionnaireView> findAppliedQuestionnaireAccessible(
        UUID cycleId, UUID cycleQuestionnaireId, UUID actorUserId, EvaluationCycleReadScope scope) {
      return appliedQuestionnaire;
    }
  }
}
