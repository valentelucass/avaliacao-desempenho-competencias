package br.com.avaliacao.desempenho.indicadores.application;

import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorFilterOptions;
import br.com.avaliacao.desempenho.indicadores.domain.port.IndicatorFilterOptionsPort;
import java.util.Objects;
import java.util.UUID;

/**
 * Coordena a listagem de opções de filtro com a mesma defesa em profundidade, limite e auditoria
 * aplicada às consultas agregadas.
 */
public final class IndicatorFilterOptionsRequestApplicationService
    implements GetIndicatorFilterOptionsUseCase {

  private final IndicatorFilterOptionsPort optionsPort;
  private final IndicatorRequestLimiter requestLimiter;
  private final IndicatorAuditSink auditSink;
  private final IndicatorRequestAuthorizationPolicy authorizationPolicy;

  public IndicatorFilterOptionsRequestApplicationService(
      IndicatorFilterOptionsPort optionsPort,
      IndicatorRequestLimiter requestLimiter,
      IndicatorAuditSink auditSink) {
    this(optionsPort, requestLimiter, auditSink, new IndicatorRequestAuthorizationPolicy());
  }

  IndicatorFilterOptionsRequestApplicationService(
      IndicatorFilterOptionsPort optionsPort,
      IndicatorRequestLimiter requestLimiter,
      IndicatorAuditSink auditSink,
      IndicatorRequestAuthorizationPolicy authorizationPolicy) {
    this.optionsPort = Objects.requireNonNull(optionsPort, "porta de opções não pode ser nula");
    this.requestLimiter = Objects.requireNonNull(requestLimiter, "limitador não pode ser nulo");
    this.auditSink = Objects.requireNonNull(auditSink, "auditoria não pode ser nula");
    this.authorizationPolicy =
        Objects.requireNonNull(authorizationPolicy, "política de autorização não pode ser nula");
  }

  @Override
  public IndicatorFilterOptions get(IndicatorExecutionContext context, UUID cycleId) {
    IndicatorExecutionContext requestContext =
        Objects.requireNonNull(context, "contexto não pode ser nulo");
    UUID requestedCycleId = Objects.requireNonNull(cycleId, "ciclo não pode ser nulo");

    try {
      authorizationPolicy.require(IndicatorAuditRecord.Operation.OPTIONS, requestContext);
    } catch (IndicatorAccessDeniedException exception) {
      audit(IndicatorAuditRecord.Outcome.ACCESS_DENIED, requestContext, requestedCycleId);
      throw exception;
    }

    try {
      requestLimiter.checkAndRecord(requestContext.actorUserId());
    } catch (IndicatorRateLimitExceededException exception) {
      audit(IndicatorAuditRecord.Outcome.RATE_LIMITED, requestContext, requestedCycleId);
      throw exception;
    }

    try {
      IndicatorFilterOptions options =
          Objects.requireNonNull(
              optionsPort.findApplicableFor(requestedCycleId),
              "porta de opções retornou uma resposta nula");
      audit(IndicatorAuditRecord.Outcome.AVAILABLE, requestContext, requestedCycleId);
      return options;
    } catch (RuntimeException exception) {
      audit(IndicatorAuditRecord.Outcome.FAILURE, requestContext, requestedCycleId);
      throw exception;
    }
  }

  private void audit(
      IndicatorAuditRecord.Outcome outcome, IndicatorExecutionContext context, UUID cycleId) {
    auditSink.record(
        IndicatorAuditRecord.filterOptions(
            context.actorUserId(), outcome, cycleId, context.requestId()));
  }
}
