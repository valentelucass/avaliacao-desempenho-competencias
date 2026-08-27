package br.com.avaliacao.desempenho.indicadores.domain.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class GroupedIndicatorPrivacyPolicyTests {

  private final GroupedIndicatorPrivacyPolicy policy = new GroupedIndicatorPrivacyPolicy();

  @Test
  void withholdsEveryAggregateForFewerThanFiveDistinctCollaborators() {
    assertThat(policy.availabilityFor(4)).isEqualTo(GroupedIndicatorAvailability.INSUFFICIENT_DATA);
    assertThat(policy.availabilityFor(0)).isEqualTo(GroupedIndicatorAvailability.INSUFFICIENT_DATA);
  }

  @Test
  void allowsAggregationOnlyAtTheConfirmedMinimum() {
    assertThat(policy.availabilityFor(5)).isEqualTo(GroupedIndicatorAvailability.AVAILABLE);
  }

  @Test
  void rejectsAnImpossibleDistinctCollaboratorCount() {
    assertThatThrownBy(() -> policy.availabilityFor(-1))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("não pode ser negativa");
  }
}
