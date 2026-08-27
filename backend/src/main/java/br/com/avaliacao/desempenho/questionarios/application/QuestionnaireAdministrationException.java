package br.com.avaliacao.desempenho.questionarios.application;

/** Falha administrativa previsível sem detalhes de SQL ou do conteúdo anterior. */
public final class QuestionnaireAdministrationException extends RuntimeException {

  private final Reason reason;

  public QuestionnaireAdministrationException(Reason reason, String message) {
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
