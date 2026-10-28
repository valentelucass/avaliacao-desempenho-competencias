package br.com.avaliacao.desempenho.identidadeacesso.application;

/** Falha segura de regra administrativa, convertida em Problem Details pela camada HTTP. */
public final class UserAdministrationException extends RuntimeException {

  public enum Reason {
    INVALID_INPUT,
    USER_NOT_FOUND,
    CONFLICT,
    FORBIDDEN,
    TEMPORARILY_BLOCKED
  }

  private final Reason reason;
  private final java.time.Instant retryAt;

  public UserAdministrationException(Reason reason, String message) {
    this(reason, message, null);
  }

  public UserAdministrationException(Reason reason, String message, java.time.Instant retryAt) {
    super(message);
    this.reason = reason;
    this.retryAt = retryAt;
  }

  public Reason reason() {
    return reason;
  }

  public java.time.Instant retryAt() {
    return retryAt;
  }
}
