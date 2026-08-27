package br.com.avaliacao.desempenho.avaliacoes.application;

/** A conta não tem a permissão de alto nível necessária para a operação. */
public final class AssessmentForbiddenException extends RuntimeException {

  public AssessmentForbiddenException() {
    super("Assessment operation is not permitted.");
  }
}
