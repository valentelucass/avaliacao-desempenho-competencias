package br.com.avaliacao.desempenho.administracao.application;

/** Falha estável de leitura administrativa, sem detalhes de infraestrutura ou dados pessoais. */
public final class AdministrativeReadException extends RuntimeException {

  private final Reason reason;

  public AdministrativeReadException(Reason reason, String message) {
    super(message);
    this.reason = reason;
  }

  public Reason reason() {
    return reason;
  }

  public enum Reason {
    FORBIDDEN,
    NOT_FOUND,
    UNAVAILABLE
  }
}
