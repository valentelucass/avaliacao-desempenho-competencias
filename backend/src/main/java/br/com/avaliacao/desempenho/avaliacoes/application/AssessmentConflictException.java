package br.com.avaliacao.desempenho.avaliacoes.application;

/** Conflito de revisão, idempotência, duplicidade ou transição de avaliação. */
public final class AssessmentConflictException extends RuntimeException {

  private final Reason reason;

  public AssessmentConflictException(String message) {
    this(Reason.CONFLICT, message);
  }

  public AssessmentConflictException(Reason reason, String message) {
    super(message);
    this.reason = reason;
  }

  public Reason reason() {
    return reason;
  }

  public enum Reason {
    CONFLICT,
    DUPLICATE_EVALUATION,
    IDEMPOTENCY_KEY_REUSED,
    INVALID_STATE_TRANSITION,
    REVISION_MISMATCH
  }
}
