package br.com.avaliacao.desempenho.questionarios.domain.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;

class QuestionnaireVersionDraftTests {

  @Test
  void fixesTheConfirmedFivePointScaleForEveryFrozenVersion() {
    QuestionnaireVersionDraft draft = validDraft();

    assertThat(draft.questionnaire().code()).isEqualTo("LIDERANCA");
    assertThat(draft.calculation().code()).isEqualTo("MEDIA_SIMPLES_2024_1");
    assertThat(draft.responseOptions())
        .extracting(QuestionnaireVersionDraft.ResponseOption::points)
        .containsExactly(80, 90, 100, 110, 120);
    assertThat(draft.responseOptions())
        .extracting(QuestionnaireVersionDraft.ResponseOption::code)
        .containsExactly(
            "ABAIXO_ESPERADO",
            "EM_DESENVOLVIMENTO",
            "DENTRO_EXPECTATIVAS",
            "SUPERA_EXPECTATIVAS",
            "REFERENCIA");
  }

  @Test
  void rejectsRepeatedCompetencyOrderBeforePersistence() {
    QuestionnaireVersionDraft.CompetencyDraft first = competency("COMUNICACAO", 1);
    QuestionnaireVersionDraft.CompetencyDraft repeatedOrder = competency("LIDERANCA", 1);

    assertThatThrownBy(
            () ->
                new QuestionnaireVersionDraft(
                    new QuestionnaireVersionDraft.QuestionnaireDraft("GESTAO", "Gestão"),
                    1,
                    "Avaliação de gestão",
                    null,
                    new QuestionnaireVersionDraft.CalculationDraft("MEDIA_SIMPLES_2024_1", 1),
                    1,
                    List.of(first, repeatedOrder)))
        .isInstanceOf(QuestionnaireRuleViolation.class)
        .hasMessageContaining("ordem de competência repetida");
  }

  private static QuestionnaireVersionDraft validDraft() {
    return new QuestionnaireVersionDraft(
        new QuestionnaireVersionDraft.QuestionnaireDraft(" lideranca ", "Liderança"),
        1,
        "Avaliação de liderança",
        null,
        new QuestionnaireVersionDraft.CalculationDraft("media_simples_2024_1", 1),
        1,
        List.of(competency("LIDERANCA", 1)));
  }

  private static QuestionnaireVersionDraft.CompetencyDraft competency(String code, int order) {
    return new QuestionnaireVersionDraft.CompetencyDraft(
        code,
        "Competência " + code,
        1,
        null,
        order,
        List.of(
            new QuestionnaireVersionDraft.QuestionDraft(
                "PERGUNTA_" + code, "Como você avalia " + code + '?', null, 1)));
  }
}
