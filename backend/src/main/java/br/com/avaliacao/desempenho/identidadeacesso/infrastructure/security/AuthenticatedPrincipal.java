package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security;

import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthorizedUser;
import java.util.Objects;
import java.util.UUID;

/** Principal autenticado que mantém somente o necessário para autorização e auditoria. */
public record AuthenticatedPrincipal(AuthorizedUser user, UUID sessionId) {

  public AuthenticatedPrincipal {
    Objects.requireNonNull(user, "user");
    Objects.requireNonNull(sessionId, "sessionId");
  }

  public UUID userId() {
    return user.userId();
  }
}
