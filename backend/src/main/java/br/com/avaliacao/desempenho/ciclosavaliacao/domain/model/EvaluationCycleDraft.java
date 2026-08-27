package br.com.avaliacao.desempenho.ciclosavaliacao.domain.model;

import java.util.Locale;
import java.util.Objects;

/** Novo ciclo anual criado inicialmente em rascunho. */
public record EvaluationCycleDraft(String code, EvaluationCycleConfigurationDraft configuration) {

  public EvaluationCycleDraft {
    code = requiredCode(code);
    configuration = Objects.requireNonNull(configuration, "configuração não pode ser nula");
  }

  private static String requiredCode(String value) {
    if (value == null) {
      throw new CycleAdministrationRuleViolation("Código do ciclo é obrigatório.");
    }
    String normalized = value.strip().toUpperCase(Locale.ROOT);
    if (normalized.isEmpty() || normalized.length() > 100 || !normalized.matches("[A-Z0-9_.-]+")) {
      throw new CycleAdministrationRuleViolation("Código do ciclo é inválido.");
    }
    return normalized;
  }
}
