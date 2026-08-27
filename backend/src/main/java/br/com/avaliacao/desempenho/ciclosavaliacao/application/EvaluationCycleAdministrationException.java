package br.com.avaliacao.desempenho.ciclosavaliacao.application;

/** Falha previsível de configuração de ciclo sem vazar o estado do banco. */
public final class EvaluationCycleAdministrationException extends RuntimeException {

  private final Reason reason;

  public EvaluationCycleAdministrationException(Reason reason, String message) {
    super(message);
    this.reason = reason;
  }

  public Reason reason() {
    return reason;
  }

  public enum Reason {
    CONFLICT,
    UNAVAILABLE
  }
}
