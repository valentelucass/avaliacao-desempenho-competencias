package br.com.avaliacao.desempenho.ciclosavaliacao.domain.model;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.Month;
import java.time.ZoneId;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/** Configuração editável somente enquanto o ciclo permanece em rascunho. */
public record EvaluationCycleConfigurationDraft(
    String name,
    LocalDateTime openingAtLocal,
    LocalDateTime closingAtLocal,
    String timeZone,
    boolean selfAssessmentEnabled,
    List<AppliedQuestionnaireDraft> questionnaires) {

  public static final String TIME_ZONE = "America/Sao_Paulo";

  private static final ZoneId BRAZIL_TIME_ZONE = ZoneId.of(TIME_ZONE);

  public EvaluationCycleConfigurationDraft {
    name = requiredText(name, "nome", 200);
    openingAtLocal = Objects.requireNonNull(openingAtLocal, "abertura não pode ser nula");
    closingAtLocal = Objects.requireNonNull(closingAtLocal, "encerramento não pode ser nulo");
    if (!TIME_ZONE.equals(timeZone)) {
      throw violation("O ciclo 2024.1 exige o fuso America/Sao_Paulo.");
    }
    questionnaires = copyQuestionnaires(questionnaires);
    requireAnnualWindow(openingAtLocal, closingAtLocal);
  }

  public Instant openingAtUtc() {
    return openingAtLocal.atZone(BRAZIL_TIME_ZONE).toInstant();
  }

  public Instant closingAtUtc() {
    return closingAtLocal.atZone(BRAZIL_TIME_ZONE).toInstant();
  }

  public record AppliedQuestionnaireDraft(
      UUID questionnaireVersionId,
      UUID calculationConfigurationVersionId,
      UUID classificationMatrixVersionId) {

    public AppliedQuestionnaireDraft {
      Objects.requireNonNull(questionnaireVersionId, "versão de questionário não pode ser nula");
      Objects.requireNonNull(
          calculationConfigurationVersionId, "configuração de cálculo não pode ser nula");
      Objects.requireNonNull(
          classificationMatrixVersionId, "matriz de classificação não pode ser nula");
    }
  }

  private static List<AppliedQuestionnaireDraft> copyQuestionnaires(
      List<AppliedQuestionnaireDraft> values) {
    if (values == null || values.isEmpty() || values.size() > 20) {
      throw violation("O ciclo deve ter entre um e vinte questionários aplicados.");
    }
    if (values.stream().anyMatch(Objects::isNull)) {
      throw violation("O ciclo não pode conter um questionário aplicado nulo.");
    }
    List<AppliedQuestionnaireDraft> copy = List.copyOf(values);
    Set<UUID> versions =
        copy.stream()
            .map(AppliedQuestionnaireDraft::questionnaireVersionId)
            .collect(Collectors.toUnmodifiableSet());
    if (versions.size() != copy.size()) {
      throw violation("Uma versão de questionário só pode ser aplicada uma vez no ciclo.");
    }
    return copy;
  }

  private static void requireAnnualWindow(
      LocalDateTime openingAtLocal, LocalDateTime closingAtLocal) {
    if (!openingAtLocal.isBefore(closingAtLocal)
        || openingAtLocal.getYear() != closingAtLocal.getYear()
        || openingAtLocal.getMonth() != Month.SEPTEMBER
        || openingAtLocal.getDayOfMonth() != 1
        || !openingAtLocal.toLocalTime().equals(LocalTime.MIDNIGHT)
        || closingAtLocal.getMonth() != Month.SEPTEMBER
        || closingAtLocal.getDayOfMonth() != 16
        || !closingAtLocal.toLocalTime().equals(LocalTime.MIDNIGHT)) {
      throw violation(
          "O ciclo anual deve abrir em 1º de setembro às 00:00 e encerrar em 16 de setembro às 00:00.");
    }
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

  private static CycleAdministrationRuleViolation violation(String message) {
    return new CycleAdministrationRuleViolation(message);
  }
}
