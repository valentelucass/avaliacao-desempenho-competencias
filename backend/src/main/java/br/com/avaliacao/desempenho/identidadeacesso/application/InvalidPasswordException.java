package br.com.avaliacao.desempenho.identidadeacesso.application;

/** A nova senha não atende ao mínimo de segurança local. */
public final class InvalidPasswordException extends RuntimeException {

  public InvalidPasswordException() {
    super("Password does not meet the local policy.");
  }
}
