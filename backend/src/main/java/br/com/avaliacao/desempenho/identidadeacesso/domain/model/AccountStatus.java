package br.com.avaliacao.desempenho.identidadeacesso.domain.model;

/** Situação persistida de uma conta local. */
public enum AccountStatus {
  ACTIVE,
  BLOCKED,
  DISABLED;

  public boolean canAuthenticate() {
    return this == ACTIVE;
  }
}
