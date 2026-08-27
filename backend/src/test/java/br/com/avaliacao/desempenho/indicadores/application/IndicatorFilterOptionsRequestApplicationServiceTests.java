package br.com.avaliacao.desempenho.indicadores.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorFilterOption;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorFilterOptions;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;

class IndicatorFilterOptionsRequestApplicationServiceTests {

  @Test
  void returnsOptionsAndAuditsOnlyTheCycleLevelOperation() {
    UUID actorId = UUID.randomUUID();
    UUID cycleId = UUID.randomUUID();
    IndicatorFilterOptions expected = options();
    List<IndicatorAuditRecord> records = new ArrayList<>();
    IndicatorFilterOptionsRequestApplicationService service =
        new IndicatorFilterOptionsRequestApplicationService(
            ignored -> expected, ignored -> {}, records::add);

    IndicatorFilterOptions result = service.get(authorizedContext(actorId, "options-1"), cycleId);

    assertThat(result).isEqualTo(expected);
    assertThat(records)
        .singleElement()
        .extracting(
            IndicatorAuditRecord::actorUserId,
            IndicatorAuditRecord::operation,
            IndicatorAuditRecord::outcome,
            IndicatorAuditRecord::cycleId,
            IndicatorAuditRecord::query,
            IndicatorAuditRecord::requestId)
        .containsExactly(
            actorId,
            IndicatorAuditRecord.Operation.OPTIONS,
            IndicatorAuditRecord.Outcome.AVAILABLE,
            cycleId,
            null,
            "options-1");
  }

  @Test
  void deniesAUserWithThePermissionButWithoutAnEligibleRoleBeforeQueryingOptions() {
    AtomicBoolean queried = new AtomicBoolean();
    List<IndicatorAuditRecord> records = new ArrayList<>();
    IndicatorFilterOptionsRequestApplicationService service =
        new IndicatorFilterOptionsRequestApplicationService(
            ignored -> {
              queried.set(true);
              return options();
            },
            ignored -> {},
            records::add);

    assertThatThrownBy(
            () ->
                service.get(
                    new IndicatorExecutionContext(
                        UUID.randomUUID(),
                        Set.of("INDICADORES.VISUALIZAR"),
                        Set.of("GESTOR"),
                        "options-denied"),
                    UUID.randomUUID()))
        .isInstanceOf(IndicatorAccessDeniedException.class);

    assertThat(queried).isFalse();
    assertThat(records)
        .singleElement()
        .extracting(IndicatorAuditRecord::operation, IndicatorAuditRecord::outcome)
        .containsExactly(
            IndicatorAuditRecord.Operation.OPTIONS, IndicatorAuditRecord.Outcome.ACCESS_DENIED);
  }

  @Test
  void rateLimitsOptionLookupBeforeExecutingTheSqlPort() {
    AtomicBoolean queried = new AtomicBoolean();
    List<IndicatorAuditRecord> records = new ArrayList<>();
    IndicatorFilterOptionsRequestApplicationService service =
        new IndicatorFilterOptionsRequestApplicationService(
            ignored -> {
              queried.set(true);
              return options();
            },
            ignored -> {
              throw new IndicatorRateLimitExceededException();
            },
            records::add);

    assertThatThrownBy(
            () ->
                service.get(
                    authorizedContext(UUID.randomUUID(), "options-limit"), UUID.randomUUID()))
        .isInstanceOf(IndicatorRateLimitExceededException.class);

    assertThat(queried).isFalse();
    assertThat(records)
        .singleElement()
        .extracting(IndicatorAuditRecord::operation, IndicatorAuditRecord::outcome)
        .containsExactly(
            IndicatorAuditRecord.Operation.OPTIONS, IndicatorAuditRecord.Outcome.RATE_LIMITED);
  }

  private static IndicatorExecutionContext authorizedContext(UUID actorId, String requestId) {
    return new IndicatorExecutionContext(
        actorId, Set.of("INDICADORES.VISUALIZAR"), Set.of("GERENCIA_RH"), requestId);
  }

  private static IndicatorFilterOptions options() {
    return new IndicatorFilterOptions(
        List.of(new IndicatorFilterOption(UUID.randomUUID(), "Filial Centro")),
        List.of(new IndicatorFilterOption(UUID.randomUUID(), "Operações")),
        List.of(new IndicatorFilterOption(UUID.randomUUID(), "Gestor")),
        List.of(new IndicatorFilterOption(UUID.randomUUID(), "Comunicação")));
  }
}
