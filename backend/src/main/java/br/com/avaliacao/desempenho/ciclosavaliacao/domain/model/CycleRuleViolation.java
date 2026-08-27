package br.com.avaliacao.desempenho.ciclosavaliacao.domain.model;

/** Violação de regra de ciclo sem acoplamento a HTTP, Spring ou persistência. */
public final class CycleRuleViolation extends RuntimeException {

  public CycleRuleViolation(String message) {
    super(message);
  }
}
