package br.com.avaliacao.desempenho.cadastros.application;

/** Falha previsível de um cadastro administrativo, sem expor detalhes de persistência. */
public final class MasterDataException extends RuntimeException {

  private final Reason reason;

  public MasterDataException(Reason reason, String message) {
    super(message);
    this.reason = reason;
  }

  public Reason reason() {
    return reason;
  }

  public enum Reason {
    INVALID_INPUT,
    CONFLICT,
    UNAVAILABLE
  }
}
