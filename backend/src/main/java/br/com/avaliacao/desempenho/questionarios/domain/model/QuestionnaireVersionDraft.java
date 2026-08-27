package br.com.avaliacao.desempenho.questionarios.domain.model;

import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Conteúdo completo que será aprovado no mesmo ato e nunca editado depois. */
public record QuestionnaireVersionDraft(
    QuestionnaireDraft questionnaire,
    int versionNumber,
    String title,
    String description,
    CalculationDraft calculation,
    int classificationMatrixVersionNumber,
    List<CompetencyDraft> competencies) {

  public static final String GENERAL_CLASSIFICATION_MATRIX_CODE = "GERAL";

  private static final List<ResponseOption> RESPONSE_OPTIONS =
      List.of(
          new ResponseOption("ABAIXO_ESPERADO", "Abaixo do esperado", 1, 80),
          new ResponseOption("EM_DESENVOLVIMENTO", "Em desenvolvimento", 2, 90),
          new ResponseOption("DENTRO_EXPECTATIVAS", "Dentro das expectativas", 3, 100),
          new ResponseOption("SUPERA_EXPECTATIVAS", "Supera as expectativas", 4, 110),
          new ResponseOption("REFERENCIA", "É referência", 5, 120));

  public QuestionnaireVersionDraft {
    questionnaire = Objects.requireNonNull(questionnaire, "questionário não pode ser nulo");
    versionNumber = positiveVersion(versionNumber, "versão do questionário");
    title = requiredText(title, "título", 200);
    description = optionalText(description, "descrição", 1000);
    calculation = Objects.requireNonNull(calculation, "configuração de cálculo não pode ser nula");
    classificationMatrixVersionNumber =
        positiveVersion(classificationMatrixVersionNumber, "versão da matriz de classificação");
    competencies = copyCompetencies(competencies);
    requireDistinct(competencies, CompetencyDraft::code, "código de competência repetido");
    requireDistinct(competencies, CompetencyDraft::order, "ordem de competência repetida");
  }

  public List<ResponseOption> responseOptions() {
    return RESPONSE_OPTIONS;
  }

  public record QuestionnaireDraft(String code, String name) {

    public QuestionnaireDraft {
      code = requiredCode(code, "código do questionário");
      name = requiredText(name, "nome do questionário", 200);
    }
  }

  public record CalculationDraft(String code, int versionNumber) {

    public CalculationDraft {
      code = requiredCode(code, "código da configuração de cálculo");
      versionNumber = positiveVersion(versionNumber, "versão da configuração de cálculo");
    }
  }

  public record CompetencyDraft(
      String code,
      String name,
      int versionNumber,
      String description,
      int order,
      List<QuestionDraft> questions) {

    public CompetencyDraft {
      code = requiredCode(code, "código da competência");
      name = requiredText(name, "nome da competência", 200);
      versionNumber = positiveVersion(versionNumber, "versão da competência");
      description = optionalText(description, "descrição da competência", 2000);
      order = positiveOrder(order, "ordem da competência");
      questions = copyQuestions(questions);
      requireDistinct(questions, QuestionDraft::code, "código de pergunta repetido");
      requireDistinct(questions, QuestionDraft::order, "ordem de pergunta repetida");
    }
  }

  public record QuestionDraft(String code, String text, String description, int order) {

    public QuestionDraft {
      code = requiredCode(code, "código da pergunta");
      text = requiredText(text, "texto da pergunta", 1000);
      description = optionalText(description, "descrição da pergunta", 4000);
      order = positiveOrder(order, "ordem da pergunta");
    }
  }

  public record ResponseOption(String code, String label, int order, int points) {}

  private static List<CompetencyDraft> copyCompetencies(List<CompetencyDraft> values) {
    if (values == null || values.isEmpty() || values.size() > 100) {
      throw violation("A versão deve conter entre uma e cem competências.");
    }
    if (values.stream().anyMatch(Objects::isNull)) {
      throw violation("A versão não pode conter uma competência nula.");
    }
    List<CompetencyDraft> copy = List.copyOf(values);
    if (copy.stream().mapToInt(value -> value.questions().size()).sum() > 1000) {
      throw violation("A versão excede o limite de perguntas permitido.");
    }
    return copy;
  }

  private static List<QuestionDraft> copyQuestions(List<QuestionDraft> values) {
    if (values == null || values.isEmpty() || values.size() > 1000) {
      throw violation("Cada competência deve conter entre uma e mil perguntas.");
    }
    if (values.stream().anyMatch(Objects::isNull)) {
      throw violation("A competência não pode conter uma pergunta nula.");
    }
    return List.copyOf(values);
  }

  private static <T, R> void requireDistinct(List<T> values, Function<T, R> key, String message) {
    Set<R> distinct = values.stream().map(key).collect(Collectors.toUnmodifiableSet());
    if (distinct.size() != values.size()) {
      throw violation(message + '.');
    }
  }

  private static String requiredCode(String value, String field) {
    String normalized = requiredText(value, field, 100).toUpperCase(Locale.ROOT);
    if (!normalized.matches("[A-Z0-9_.-]+")) {
      throw violation("Código inválido: " + field + '.');
    }
    return normalized;
  }

  private static String requiredText(String value, String field, int maximumLength) {
    if (value == null) {
      throw violation("Campo obrigatório ausente: " + field + '.');
    }
    String normalized = value.strip();
    if (normalized.isEmpty() || normalized.length() > maximumLength) {
      throw violation("Campo inválido: " + field + '.');
    }
    return normalized;
  }

  private static String optionalText(String value, String field, int maximumLength) {
    return value == null ? null : requiredText(value, field, maximumLength);
  }

  private static int positiveVersion(int value, String field) {
    if (value < 1) {
      throw violation("Valor positivo obrigatório: " + field + '.');
    }
    return value;
  }

  private static int positiveOrder(int value, String field) {
    if (value < 1 || value > Short.MAX_VALUE) {
      throw violation("Ordem inválida: " + field + '.');
    }
    return value;
  }

  private static QuestionnaireRuleViolation violation(String message) {
    return new QuestionnaireRuleViolation(message);
  }
}
