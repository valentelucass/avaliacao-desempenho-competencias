package br.com.avaliacao.desempenho.identidadeacesso.application;

/** Erro intencionalmente genérico para não enumerar contas ou estados de credencial. */
public final class AuthenticationFailureException extends RuntimeException {

  public AuthenticationFailureException() {
    super("Authentication failed.");
  }
}
