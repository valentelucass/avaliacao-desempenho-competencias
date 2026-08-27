package br.com.avaliacao.desempenho.identidadeacesso.application;

/** A tentativa excedeu o limite local de segurança. */
public final class RateLimitedException extends RuntimeException {

  public RateLimitedException() {
    super("Rate limit exceeded.");
  }
}
