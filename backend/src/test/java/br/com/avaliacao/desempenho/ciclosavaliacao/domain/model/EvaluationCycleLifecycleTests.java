package br.com.avaliacao.desempenho.ciclosavaliacao.domain.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class EvaluationCycleLifecycleTests {

  private final EvaluationCycleLifecycle lifecycle = new EvaluationCycleLifecycle();

  @Test
  void opensAndClosesTheCycleInTheConfirmedOrder() {
    EvaluationCycleStatus openCycle = lifecycle.open(EvaluationCycleStatus.RASCUNHO);

    assertThat(openCycle).isEqualTo(EvaluationCycleStatus.ABERTO);
    assertThat(lifecycle.close(openCycle)).isEqualTo(EvaluationCycleStatus.ENCERRADO);
  }

  @Test
  void rejectsAStateJumpOrASecondClosure() {
    assertThatThrownBy(() -> lifecycle.close(EvaluationCycleStatus.RASCUNHO))
        .isInstanceOf(CycleRuleViolation.class)
        .hasMessageContaining("encerrar");

    assertThatThrownBy(() -> lifecycle.open(EvaluationCycleStatus.ENCERRADO))
        .isInstanceOf(CycleRuleViolation.class)
        .hasMessageContaining("abrir");
  }
}
