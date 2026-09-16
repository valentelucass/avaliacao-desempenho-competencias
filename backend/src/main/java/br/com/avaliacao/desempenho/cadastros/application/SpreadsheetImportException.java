package br.com.avaliacao.desempenho.cadastros.application;

public final class SpreadsheetImportException extends RuntimeException {
  public enum Reason {
    INVALID_FILE,
    LIMIT_EXCEEDED,
    EXPIRED,
    STALE,
    RATE_LIMITED
  }

  private final Reason reason;

  public SpreadsheetImportException(Reason reason) {
    super(reason.name());
    this.reason = reason;
  }

  public Reason reason() {
    return reason;
  }
}
