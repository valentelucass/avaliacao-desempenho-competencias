package br.com.avaliacao.desempenho.ciclosavaliacao.application;

import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleReadScope;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleStatus;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/** Porta de leitura de ciclos e da versão imutável de questionário aplicada ao ciclo. */
public interface EvaluationCycleReadRepository {

  EvaluationCyclePage listAccessible(
      UUID actorUserId, EvaluationCycleReadScope scope, int fetchLimit, UUID cursor);

  Optional<AppliedQuestionnaireView> findAppliedQuestionnaireAccessible(
      UUID cycleId, UUID cycleQuestionnaireId, UUID actorUserId, EvaluationCycleReadScope scope);

  record EvaluationCyclePage(List<EvaluationCycleView> items, UUID nextCursor) {

    public EvaluationCyclePage {
      items = List.copyOf(Objects.requireNonNull(items, "itens não podem ser nulos"));
    }
  }

  record EvaluationCycleView(UUID id, String name, EvaluationCycleStatus status) {

    public EvaluationCycleView {
      Objects.requireNonNull(id, "identificador do ciclo não pode ser nulo");
      requireText(name, "nome do ciclo");
      Objects.requireNonNull(status, "situação do ciclo não pode ser nula");
    }
  }

  record AppliedQuestionnaireView(
      UUID cycleQuestionnaireId,
      UUID questionnaireVersionId,
      String questionnaireCode,
      int questionnaireVersionNumber,
      String title,
      List<CompetencyView> competencies) {

    public AppliedQuestionnaireView {
      Objects.requireNonNull(
          cycleQuestionnaireId, "identificador do questionário aplicado não pode ser nulo");
      Objects.requireNonNull(questionnaireVersionId, "versão do questionário não pode ser nula");
      requireText(questionnaireCode, "código do questionário");
      if (questionnaireVersionNumber < 1) {
        throw new IllegalArgumentException("O número da versão do questionário deve ser positivo.");
      }
      requireText(title, "título do questionário");
      competencies =
          List.copyOf(Objects.requireNonNull(competencies, "competências não podem ser nulas"));
    }
  }

  record CompetencyView(UUID id, String name, List<QuestionView> questions) {

    public CompetencyView {
      Objects.requireNonNull(id, "identificador da competência não pode ser nulo");
      requireText(name, "nome da competência");
      questions = List.copyOf(Objects.requireNonNull(questions, "perguntas não podem ser nulas"));
    }
  }

  record QuestionView(
      UUID id, String text, String description, boolean required, List<OptionView> options) {

    public QuestionView {
      Objects.requireNonNull(id, "identificador da pergunta não pode ser nulo");
      requireText(text, "texto da pergunta");
      options = List.copyOf(Objects.requireNonNull(options, "opções não podem ser nulas"));
    }
  }

  record OptionView(UUID id, String label) {

    public OptionView {
      Objects.requireNonNull(id, "identificador da opção não pode ser nulo");
      requireText(label, "rótulo da opção");
    }
  }

  private static void requireText(String value, String fieldName) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException(fieldName + " não pode ser vazio");
    }
  }
}
