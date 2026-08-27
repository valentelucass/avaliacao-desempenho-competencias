package br.com.avaliacao.desempenho.ciclosavaliacao.application;

/** Entrada de leitura inválida sem expor detalhes de persistência. */
public final class EvaluationCycleReadValidationException extends RuntimeException {

  public EvaluationCycleReadValidationException(String message) {
    super(message);
  }
}
