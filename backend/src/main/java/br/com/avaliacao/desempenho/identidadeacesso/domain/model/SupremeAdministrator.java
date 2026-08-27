package br.com.avaliacao.desempenho.identidadeacesso.domain.model;

import java.util.Objects;

/**
 * Estado mínimo de um administrador supremo usado pelas regras puras de identidade.
 *
 * <p>Este tipo não representa uma entidade de banco nem uma conta real.
 */
public record SupremeAdministrator(
    String userId, boolean active, boolean protectedFromRegularRemoval) {

  public SupremeAdministrator {
    Objects.requireNonNull(userId, "userId não pode ser nulo");
    if (userId.isBlank()) {
      throw new IllegalArgumentException("userId não pode ser vazio");
    }
  }
}
