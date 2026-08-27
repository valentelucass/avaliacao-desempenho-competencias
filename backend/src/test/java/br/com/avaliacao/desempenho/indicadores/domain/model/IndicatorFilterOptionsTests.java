package br.com.avaliacao.desempenho.indicadores.domain.model;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class IndicatorFilterOptionsTests {

  @Test
  void rejectsAnEmptyOptionLabel() {
    assertThatThrownBy(() -> new IndicatorFilterOption(UUID.randomUUID(), " "))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void rejectsANullListInsteadOfProducingAnAmbiguousApiResponse() {
    assertThatThrownBy(() -> new IndicatorFilterOptions(null, List.of(), List.of(), List.of()))
        .isInstanceOf(NullPointerException.class);
  }
}
