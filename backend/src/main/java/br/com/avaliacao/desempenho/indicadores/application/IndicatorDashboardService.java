package br.com.avaliacao.desempenho.indicadores.application;

import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.indicadores.application.IndicatorAuditRecord.Operation;
import br.com.avaliacao.desempenho.indicadores.application.IndicatorAuditRecord.Outcome;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboard;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorDashboardPolicy;
import br.com.avaliacao.desempenho.indicadores.domain.port.IndicatorDashboardPort;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

@Service
@ConditionalOnSqlServerPersistence
@ConditionalOnProperty(prefix = "app.indicators", name = "enabled", havingValue = "true")
public class IndicatorDashboardService {

  private final IndicatorDashboardPort port;
  private final IndicatorRequestLimiter limiter;
  private final IndicatorAuditSink auditSink;
  private final IndicatorRequestAuthorizationPolicy authorization =
      new IndicatorRequestAuthorizationPolicy();
  private final IndicatorDashboardPolicy policy = new IndicatorDashboardPolicy();

  public IndicatorDashboard get(IndicatorExecutionContext context, UUID cycleId) {
    try {
      authorization.require(Operation.DASHBOARD, context);
      limiter.checkAndRecord(context.actorUserId());
    } catch (IndicatorAccessDeniedException exception) {
      audit(context, cycleId, Outcome.ACCESS_DENIED);
      throw exception;
    } catch (IndicatorRateLimitExceededException exception) {
      audit(context, cycleId, Outcome.RATE_LIMITED);
      throw exception;
    }

    IndicatorDashboard result;
    try {
      result = policy.publish(port.aggregate(cycleId));
    } catch (RuntimeException exception) {
      audit(context, cycleId, Outcome.FAILURE);
      throw exception;
    }
    audit(context, cycleId, result.hasData() ? Outcome.AVAILABLE : Outcome.INSUFFICIENT_DATA);
    return result;
  }

  public IndicatorDashboardService(
      IndicatorDashboardPort port, IndicatorRequestLimiter limiter, IndicatorAuditSink auditSink) {
    this.port = port;
    this.limiter = limiter;
    this.auditSink = auditSink;
  }

  private void audit(IndicatorExecutionContext context, UUID cycleId, Outcome outcome) {
    auditSink.record(
        new IndicatorAuditRecord(
            context.actorUserId(),
            Operation.DASHBOARD,
            outcome,
            cycleId,
            null,
            context.requestId()));
  }
}
