package br.com.avaliacao.desempenho.identidadeacesso.application;

/** Falha segura de regra administrativa, convertida em Problem Details pela camada HTTP. */
public final class UserAdministrationException extends RuntimeException {

  public enum Reason {
    INVALID_INPUT,
    USER_NOT_FOUND,
    CONFLICT,
    FORBIDDEN
  }

  private final Reason reason;

  public UserAdministrationException(Reason reason, String message) {
    super(message);
    this.reason = reason;
  }

  public Reason reason() {
    return reason;
  }
}
