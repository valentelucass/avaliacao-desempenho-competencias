package br.com.avaliacao.desempenho.questionarios.application;

/** Falha administrativa previsível sem detalhes de SQL ou do conteúdo anterior. */
public final class QuestionnaireAdministrationException extends RuntimeException {

  private final Reason reason;
  private final String reasonCode;

  public QuestionnaireAdministrationException(Reason reason, String message) {
    this(
        reason,
        reason == Reason.CONFLICT
            ? "QUESTIONNAIRE_INTEGRITY_CONFLICT"
            : "QUESTIONNAIRE_UNAVAILABLE",
        message);
  }

  public QuestionnaireAdministrationException(Reason reason, String reasonCode, String message) {
    super(message);
    this.reason = reason;
    this.reasonCode = reasonCode;
  }

  public String reasonCode() {
    return reasonCode;
  }

  public Reason reason() {
    return reason;
  }

  public enum Reason {
    CONFLICT,
    UNAVAILABLE
  }
}
