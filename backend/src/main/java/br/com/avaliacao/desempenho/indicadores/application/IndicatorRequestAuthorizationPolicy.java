package br.com.avaliacao.desempenho.indicadores.application;

import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthorizedUser;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.IndicatorRolePolicy;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.PlatformPermission;
import java.util.Objects;

/** Defesa em profundidade para impedir que uma permissão individual substitua o papel exigido. */
public final class IndicatorRequestAuthorizationPolicy {

  private final IndicatorRolePolicy rolePolicy;

  public IndicatorRequestAuthorizationPolicy() {
    this(new IndicatorRolePolicy());
  }

  IndicatorRequestAuthorizationPolicy(IndicatorRolePolicy rolePolicy) {
    this.rolePolicy = Objects.requireNonNull(rolePolicy, "política de papéis não pode ser nula");
  }

  public void require(IndicatorAuditRecord.Operation operation, IndicatorExecutionContext context) {
    IndicatorExecutionContext safeContext =
        Objects.requireNonNull(context, "contexto não pode ser nulo");
    if ((operation == IndicatorAuditRecord.Operation.QUERY
            || operation == IndicatorAuditRecord.Operation.OPTIONS
            || operation == IndicatorAuditRecord.Operation.DASHBOARD)
        && safeContext.hasPermission(AuthorizedUser.SUPREME_REVIEW)) {
      return;
    }
    if (!rolePolicy.hasEligibleRole(safeContext.roleCodes())
        || !safeContext.hasPermission(PlatformPermission.INDICATORS_VIEW.code())
        || (operation == IndicatorAuditRecord.Operation.EXPORT
            && !safeContext.hasPermission(PlatformPermission.DATA_EXPORT.code()))) {
      throw new IndicatorAccessDeniedException();
    }
  }
}
