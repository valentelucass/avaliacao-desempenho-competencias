package br.com.avaliacao.desempenho.indicadores.domain.model;

import java.util.Objects;
import java.util.UUID;

/** Uma opção mínima e segura para composição de filtros de indicadores. */
public record IndicatorFilterOption(UUID id, String label) {

  public IndicatorFilterOption {
    Objects.requireNonNull(id, "identificador da opção não pode ser nulo");
    label = Objects.requireNonNull(label, "rótulo da opção não pode ser nulo");
    if (label.isBlank()) {
      throw new IllegalArgumentException("rótulo da opção não pode ser vazio");
    }
  }
}
