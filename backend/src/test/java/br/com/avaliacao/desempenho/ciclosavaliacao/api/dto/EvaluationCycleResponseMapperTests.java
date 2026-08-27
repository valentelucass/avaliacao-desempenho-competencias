package br.com.avaliacao.desempenho.ciclosavaliacao.api.dto;

import static org.assertj.core.api.Assertions.assertThat;

import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleReadRepository;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleStatus;
import java.lang.reflect.RecordComponent;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class EvaluationCycleResponseMapperTests {

  @Test
  void returnsOnlyTheMinimalCycleSummaryAndOpaqueCursor() {
    UUID cycleId = UUID.randomUUID();
    UUID cursor = UUID.randomUUID();
    EvaluationCycleListResponse response =
        new EvaluationCycleResponseMapper()
            .toListResponse(
                new EvaluationCycleReadRepository.EvaluationCyclePage(
                    List.of(
                        new EvaluationCycleReadRepository.EvaluationCycleView(
                            cycleId, "Ciclo 2024", EvaluationCycleStatus.ENCERRADO)),
                    cursor),
                20);

    assertThat(response.items())
        .containsExactly(new EvaluationCycleResponse(cycleId, "Ciclo 2024", "ENCERRADO"));
    assertThat(response.page().limit()).isEqualTo(20);
    assertThat(response.page().nextCursor()).isEqualTo(cursor.toString());
    assertThat(response.toString()).doesNotContain("codigo", "aberto_por", "encerrado_por");
  }

  @Test
  void doesNotExposeAnswerPointsInTheAppliedQuestionnaireContract() {
    EvaluationCycleReadRepository.AppliedQuestionnaireView view =
        new EvaluationCycleReadRepository.AppliedQuestionnaireView(
            UUID.randomUUID(),
            UUID.randomUUID(),
            "OPERACIONAL",
            1,
            "Operacional 2024.1",
            List.of(
                new EvaluationCycleReadRepository.CompetencyView(
                    UUID.randomUUID(),
                    "Conduta",
                    List.of(
                        new EvaluationCycleReadRepository.QuestionView(
                            UUID.randomUUID(),
                            "Pergunta",
                            null,
                            true,
                            List.of(
                                new EvaluationCycleReadRepository.OptionView(
                                    UUID.randomUUID(), "Dentro das expectativas")))))));

    AppliedQuestionnaireResponse response =
        new EvaluationCycleResponseMapper().toAppliedQuestionnaireResponse(view);

    assertThat(response.competencies()).hasSize(1);
    assertThat(AppliedQuestionnaireResponse.OptionResponse.class.getRecordComponents())
        .extracting(RecordComponent::getName)
        .containsExactly("id", "label");
  }
}
