package br.com.avaliacao.desempenho.avaliacoes.domain.model;

/** Exceção de regra de avaliação que não depende de HTTP, Spring ou persistência. */
public final class AssessmentRuleViolation extends RuntimeException {

  public AssessmentRuleViolation(String message) {
    super(message);
  }
}
