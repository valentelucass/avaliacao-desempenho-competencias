package br.com.avaliacao.desempenho.identidadeacesso.domain.model;

/** Exceção de regra de domínio que não depende de HTTP, Spring ou persistência. */
public final class DomainRuleViolation extends RuntimeException {

  public DomainRuleViolation(String message) {
    super(message);
  }
}
