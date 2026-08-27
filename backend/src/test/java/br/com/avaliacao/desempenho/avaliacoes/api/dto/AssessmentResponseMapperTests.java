package br.com.avaliacao.desempenho.avaliacoes.api.dto;

import static org.assertj.core.api.Assertions.assertThat;

import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentRepository;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentType;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AssessmentResponseMapperTests {

  @Test
  void mapsOnlyTheAuthorizedAssessmentViewToTheHttpContract() {
    UUID assessmentId = UUID.randomUUID();
    UUID cycleId = UUID.randomUUID();
    UUID competencyId = UUID.randomUUID();
    UUID questionId = UUID.randomUUID();
    UUID optionId = UUID.randomUUID();
    AssessmentRepository.AssessmentDetailView view =
        new AssessmentRepository.AssessmentDetailView(
            new AssessmentRepository.AssessmentSummaryView(
                assessmentId,
                cycleId,
                "Ciclo 2024",
                "Colaborador autorizado",
                AssessmentType.GESTOR,
                "ENVIADA",
                "AAAAAAAAAAE",
                Instant.parse("2026-08-25T00:00:00Z")),
            "LIDERANCA v1",
            List.of(
                new AssessmentRepository.CompetencyView(
                    competencyId,
                    "Liderança",
                    List.of(
                        new AssessmentRepository.QuestionView(
                            questionId,
                            "Pergunta",
                            null,
                            true,
                            List.of(
                                new AssessmentRepository.OptionView(optionId, "Dentro", 100)))))),
            List.of(new AssessmentRepository.AnswerView(questionId, optionId)),
            null,
            null,
            new AssessmentRepository.ResultView(
                "100.0", "WITHIN_EXPECTATIONS", "Acelerar e desenvolver"),
            List.of(
                new AssessmentRepository.CompetencyScoreView(
                    competencyId, "Liderança", new java.math.BigDecimal("100.0"))));

    AssessmentDetailResponse response = new AssessmentResponseMapper().toDetail(view);

    assertThat(response.id()).isEqualTo(assessmentId);
    assertThat(response.type()).isEqualTo("GESTOR");
    assertThat(
            response
                .questionnaire()
                .competencies()
                .getFirst()
                .questions()
                .getFirst()
                .options()
                .getFirst()
                .id())
        .isEqualTo(optionId);
    assertThat(
            response
                .questionnaire()
                .competencies()
                .getFirst()
                .questions()
                .getFirst()
                .options()
                .getFirst()
                .points())
        .isEqualTo(100);
    assertThat(response.result().finalScore()).isEqualByComparingTo("100.0");
    assertThat(response.result().classification().label()).isEqualTo("Dentro das expectativas");
    assertThat(response.competencyScores())
        .containsExactly(
            new AssessmentDetailResponse.CompetencyScoreResponse(
                competencyId, "Liderança", new java.math.BigDecimal("100.0")));
  }
}
