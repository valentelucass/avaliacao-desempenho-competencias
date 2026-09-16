package br.com.avaliacao.desempenho.ciclosavaliacao.domain.model;

/** Violação da configuração administrativa do ciclo anual 2024.1. */
public final class CycleAdministrationRuleViolation extends RuntimeException {
  private final String reasonCode;

  public CycleAdministrationRuleViolation(String message) {
    this("CYCLE_CONFIGURATION_INVALID", message);
  }

  public CycleAdministrationRuleViolation(String reasonCode, String message) {
    super(message);
    this.reasonCode = reasonCode;
  }

  public String reasonCode() {
    return reasonCode;
  }
}
