package br.com.avaliacao.desempenho.avaliacoes.application;

/** Dados de avaliação semanticamente inválidos, sem incluir conteúdo sensível no erro HTTP. */
public final class AssessmentValidationException extends RuntimeException {

  public AssessmentValidationException(String message) {
    super(message);
  }
}
