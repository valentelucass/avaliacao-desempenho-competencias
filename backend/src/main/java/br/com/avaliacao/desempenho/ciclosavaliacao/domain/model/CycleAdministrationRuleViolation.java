package br.com.avaliacao.desempenho.ciclosavaliacao.domain.model;

/** Violação da configuração administrativa do ciclo anual 2024.1. */
public final class CycleAdministrationRuleViolation extends RuntimeException {

  public CycleAdministrationRuleViolation(String message) {
    super(message);
  }
}
