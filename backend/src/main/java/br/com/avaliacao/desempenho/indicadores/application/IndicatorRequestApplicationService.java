package br.com.avaliacao.desempenho.indicadores.application;

import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorFilterViolation;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorQuery;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorResult;
import java.util.Objects;
import java.util.function.Function;
import java.util.function.Supplier;

/**
 * Orquestra a execução autenticada de indicadores, o limite local e a auditoria durável sem deixar
 * o controller decidir regra de negócio ou resultado de privacidade.
 */
public final class IndicatorRequestApplicationService {

  private final GetIndicatorsUseCase getIndicatorsUseCase;
  private final ExportIndicatorsUseCase exportIndicatorsUseCase;
  private final IndicatorRequestLimiter requestLimiter;
  private final IndicatorAuditSink auditSink;
  private final IndicatorRequestAuthorizationPolicy authorizationPolicy;

  public IndicatorRequestApplicationService(
      GetIndicatorsUseCase getIndicatorsUseCase,
      ExportIndicatorsUseCase exportIndicatorsUseCase,
      IndicatorRequestLimiter requestLimiter,
      IndicatorAuditSink auditSink) {
    this(
        getIndicatorsUseCase,
        exportIndicatorsUseCase,
        requestLimiter,
        auditSink,
        new IndicatorRequestAuthorizationPolicy());
  }

  IndicatorRequestApplicationService(
      GetIndicatorsUseCase getIndicatorsUseCase,
      ExportIndicatorsUseCase exportIndicatorsUseCase,
      IndicatorRequestLimiter requestLimiter,
      IndicatorAuditSink auditSink,
      IndicatorRequestAuthorizationPolicy authorizationPolicy) {
    this.getIndicatorsUseCase =
        Objects.requireNonNull(getIndicatorsUseCase, "caso de uso de consulta não pode ser nulo");
    this.exportIndicatorsUseCase =
        Objects.requireNonNull(
            exportIndicatorsUseCase, "caso de uso de exportação não pode ser nulo");
    this.requestLimiter = Objects.requireNonNull(requestLimiter, "limitador não pode ser nulo");
    this.auditSink = Objects.requireNonNull(auditSink, "auditoria não pode ser nula");
    this.authorizationPolicy =
        Objects.requireNonNull(authorizationPolicy, "política de autorização não pode ser nula");
  }

  public IndicatorResult get(IndicatorExecutionContext context, IndicatorQuery query) {
    return execute(
        IndicatorAuditRecord.Operation.QUERY,
        context,
        query,
        () -> getIndicatorsUseCase.get(query),
        this::outcomeForIndicator);
  }

  public IndicatorExportResult export(IndicatorExecutionContext context, IndicatorQuery query) {
    return execute(
        IndicatorAuditRecord.Operation.EXPORT,
        context,
        query,
        () -> exportIndicatorsUseCase.export(query),
        this::outcomeForExport);
  }

  private <T> T execute(
      IndicatorAuditRecord.Operation operation,
      IndicatorExecutionContext context,
      IndicatorQuery query,
      Supplier<T> execution,
      Function<T, IndicatorAuditRecord.Outcome> outcomeResolver) {
    IndicatorExecutionContext requestContext =
        Objects.requireNonNull(context, "contexto não pode ser nulo");
    IndicatorQuery requestedQuery = Objects.requireNonNull(query, "consulta não pode ser nula");

    try {
      authorizationPolicy.require(operation, requestContext);
    } catch (IndicatorAccessDeniedException exception) {
      audit(operation, IndicatorAuditRecord.Outcome.ACCESS_DENIED, requestContext, requestedQuery);
      throw exception;
    }

    try {
      requestLimiter.checkAndRecord(requestContext.actorUserId());
    } catch (IndicatorRateLimitExceededException exception) {
      audit(operation, IndicatorAuditRecord.Outcome.RATE_LIMITED, requestContext, requestedQuery);
      throw exception;
    }

    T result;
    try {
      result = execution.get();
    } catch (IndicatorFilterViolation exception) {
      audit(
          operation,
          IndicatorAuditRecord.Outcome.VALIDATION_DENIED,
          requestContext,
          requestedQuery);
      throw exception;
    } catch (RuntimeException exception) {
      audit(operation, IndicatorAuditRecord.Outcome.FAILURE, requestContext, requestedQuery);
      throw exception;
    }

    audit(operation, outcomeResolver.apply(result), requestContext, requestedQuery);
    return result;
  }

  private IndicatorAuditRecord.Outcome outcomeForIndicator(IndicatorResult result) {
    return result instanceof IndicatorResult.InsufficientData
        ? IndicatorAuditRecord.Outcome.INSUFFICIENT_DATA
        : IndicatorAuditRecord.Outcome.AVAILABLE;
  }

  private IndicatorAuditRecord.Outcome outcomeForExport(IndicatorExportResult result) {
    return result instanceof IndicatorExportResult.InsufficientData
        ? IndicatorAuditRecord.Outcome.INSUFFICIENT_DATA
        : IndicatorAuditRecord.Outcome.AVAILABLE;
  }

  private void audit(
      IndicatorAuditRecord.Operation operation,
      IndicatorAuditRecord.Outcome outcome,
      IndicatorExecutionContext context,
      IndicatorQuery query) {
    auditSink.record(
        new IndicatorAuditRecord(
            context.actorUserId(), operation, outcome, query, context.requestId()));
  }
}
