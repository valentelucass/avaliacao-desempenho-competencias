package br.com.avaliacao.desempenho.indicadores.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

import br.com.avaliacao.desempenho.identidadeacesso.application.IdentityAccessRepository;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuditEvent;
import br.com.avaliacao.desempenho.indicadores.application.IndicatorAuditRecord;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorMetric;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorQuery;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class IdentityAccessIndicatorAuditSinkTests {

  @Test
  void persistsOnlyAHashedFilterFingerprintAndNeverTheRequestedIdentifiers() {
    IdentityAccessRepository repository = Mockito.mock(IdentityAccessRepository.class);
    AtomicReference<AuditEvent> captured = new AtomicReference<>();
    doAnswer(
            invocation -> {
              captured.set(invocation.getArgument(0));
              return null;
            })
        .when(repository)
        .writeAudit(any(AuditEvent.class));

    UUID actorId = UUID.randomUUID();
    UUID cycleId = UUID.randomUUID();
    UUID branchId = UUID.randomUUID();
    IndicatorQuery query =
        new IndicatorQuery(
            cycleId, IndicatorMetric.FINAL_SCORE_AVERAGE, branchId, null, null, null, null);

    new IdentityAccessIndicatorAuditSink(repository)
        .record(
            new IndicatorAuditRecord(
                actorId,
                IndicatorAuditRecord.Operation.QUERY,
                IndicatorAuditRecord.Outcome.AVAILABLE,
                query,
                "request-123"));

    AuditEvent event = captured.get();
    assertThat(event.actorUserId()).isEqualTo(actorId);
    assertThat(event.action()).isEqualTo("INDICADORES.CONSULTAR");
    assertThat(event.resourceType()).isEqualTo("INDICADOR");
    assertThat(event.resourceId()).isEqualTo(cycleId);
    assertThat(event.result()).isEqualTo(AuditEvent.AuditResult.SUCCESS);
    assertThat(event.reducedDetail())
        .contains(
            "policy=2024.1", "metric=FINAL_SCORE_AVERAGE", "population=BRANCH", "filters_sha256=")
        .doesNotContain(cycleId.toString(), branchId.toString());
  }

  @Test
  void recordsAnOptionsLookupWithoutStoringTheCycleIdentifierInTheDetail() {
    IdentityAccessRepository repository = Mockito.mock(IdentityAccessRepository.class);
    AtomicReference<AuditEvent> captured = new AtomicReference<>();
    doAnswer(
            invocation -> {
              captured.set(invocation.getArgument(0));
              return null;
            })
        .when(repository)
        .writeAudit(any(AuditEvent.class));

    UUID actorId = UUID.randomUUID();
    UUID cycleId = UUID.randomUUID();
    new IdentityAccessIndicatorAuditSink(repository)
        .record(
            IndicatorAuditRecord.filterOptions(
                actorId, IndicatorAuditRecord.Outcome.AVAILABLE, cycleId, "request-options"));

    AuditEvent event = captured.get();
    assertThat(event.actorUserId()).isEqualTo(actorId);
    assertThat(event.action()).isEqualTo("INDICADORES.OPCOES");
    assertThat(event.resourceType()).isEqualTo("INDICADOR");
    assertThat(event.resourceId()).isEqualTo(cycleId);
    assertThat(event.reducedDetail())
        .isEqualTo("policy=2024.1;operation=OPTIONS")
        .doesNotContain(cycleId.toString());
  }
}
