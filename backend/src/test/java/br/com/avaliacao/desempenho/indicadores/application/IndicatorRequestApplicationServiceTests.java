package br.com.avaliacao.desempenho.indicadores.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorFilterViolation;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorMetric;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorQuery;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorResult;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class IndicatorRequestApplicationServiceTests {

  @Test
  void recordsTheAvailableQueryBeforeReturningTheAggregate() {
    List<IndicatorAuditRecord> records = new ArrayList<>();
    UUID actor = UUID.randomUUID();
    IndicatorQuery query = query();
    IndicatorRequestApplicationService service =
        new IndicatorRequestApplicationService(
            ignored ->
                new IndicatorResult.Available(
                    IndicatorMetric.FINAL_SCORE_AVERAGE, new BigDecimal("100.0"), List.of()),
            ignored -> new IndicatorExportResult.InsufficientData(),
            ignored -> {},
            records::add);

    IndicatorResult result = service.get(authorizedContext(actor, "request-1"), query);

    assertThat(result).isInstanceOf(IndicatorResult.Available.class);
    assertThat(records)
        .singleElement()
        .extracting(
            IndicatorAuditRecord::actorUserId,
            IndicatorAuditRecord::operation,
            IndicatorAuditRecord::outcome,
            IndicatorAuditRecord::query,
            IndicatorAuditRecord::requestId)
        .containsExactly(
            actor,
            IndicatorAuditRecord.Operation.QUERY,
            IndicatorAuditRecord.Outcome.AVAILABLE,
            query,
            "request-1");
  }

  @Test
  void auditsValidationDenialWithoutMarkingTheResultAsAvailable() {
    List<IndicatorAuditRecord> records = new ArrayList<>();
    IndicatorRequestApplicationService service =
        new IndicatorRequestApplicationService(
            ignored -> {
              throw new IndicatorFilterViolation("combinação inválida");
            },
            ignored -> new IndicatorExportResult.InsufficientData(),
            ignored -> {},
            records::add);

    assertThatThrownBy(
            () -> service.get(authorizedContext(UUID.randomUUID(), "request-2"), query()))
        .isInstanceOf(IndicatorFilterViolation.class);

    assertThat(records)
        .singleElement()
        .extracting(IndicatorAuditRecord::operation, IndicatorAuditRecord::outcome)
        .containsExactly(
            IndicatorAuditRecord.Operation.QUERY, IndicatorAuditRecord.Outcome.VALIDATION_DENIED);
  }

  @Test
  void auditsAndStopsRequestsThatExceedTheLocalLimit() {
    List<IndicatorAuditRecord> records = new ArrayList<>();
    IndicatorRequestApplicationService service =
        new IndicatorRequestApplicationService(
            ignored -> new IndicatorResult.InsufficientData(),
            ignored -> new IndicatorExportResult.InsufficientData(),
            ignored -> {
              throw new IndicatorRateLimitExceededException();
            },
            records::add);

    assertThatThrownBy(
            () -> service.export(authorizedContext(UUID.randomUUID(), "request-3"), query()))
        .isInstanceOf(IndicatorRateLimitExceededException.class);

    assertThat(records)
        .singleElement()
        .extracting(IndicatorAuditRecord::operation, IndicatorAuditRecord::outcome)
        .containsExactly(
            IndicatorAuditRecord.Operation.EXPORT, IndicatorAuditRecord.Outcome.RATE_LIMITED);
  }

  @Test
  void deniesAnIndividualIndicatorPermissionWithoutAnEligibleEffectiveRole() {
    List<IndicatorAuditRecord> records = new ArrayList<>();
    IndicatorRequestApplicationService service =
        new IndicatorRequestApplicationService(
            ignored -> new IndicatorResult.InsufficientData(),
            ignored -> new IndicatorExportResult.InsufficientData(),
            ignored -> {},
            records::add);

    assertThatThrownBy(
            () ->
                service.get(
                    new IndicatorExecutionContext(
                        UUID.randomUUID(),
                        java.util.Set.of("INDICADORES.VISUALIZAR"),
                        java.util.Set.of("GESTOR"),
                        "request-role-denied"),
                    query()))
        .isInstanceOf(IndicatorAccessDeniedException.class);

    assertThat(records)
        .singleElement()
        .extracting(IndicatorAuditRecord::operation, IndicatorAuditRecord::outcome)
        .containsExactly(
            IndicatorAuditRecord.Operation.QUERY, IndicatorAuditRecord.Outcome.ACCESS_DENIED);
  }

  private static IndicatorExecutionContext authorizedContext(UUID actor, String requestId) {
    return new IndicatorExecutionContext(
        actor,
        java.util.Set.of("INDICADORES.VISUALIZAR", "DADOS.EXPORTAR"),
        java.util.Set.of("GERENCIA_RH"),
        requestId);
  }

  private static IndicatorQuery query() {
    return new IndicatorQuery(
        UUID.randomUUID(), IndicatorMetric.FINAL_SCORE_AVERAGE, null, null, null, null, null);
  }
}
