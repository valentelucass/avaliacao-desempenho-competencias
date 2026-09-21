package br.com.avaliacao.desempenho.identidadeacesso.domain.model;

import java.nio.charset.StandardCharsets;

/** Limite explícito do BCrypt, sem truncamento silencioso de senhas Unicode. */
public final class LocalPasswordPolicy {
  private LocalPasswordPolicy() {}

  public static boolean accepts(String password) {
    return password != null
        && password.length() >= 12
        && password.getBytes(StandardCharsets.UTF_8).length <= 72;
  }
}
