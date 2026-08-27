package br.com.avaliacao.desempenho.avaliacoes.domain.model;

import java.util.Collection;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/** Respostas de uma versão de avaliação, ainda sem calcular ou persistir pontuação. */
public final class AssessmentResponseSet {

  private final Set<AssessmentResponse> responses;

  private AssessmentResponseSet(Set<AssessmentResponse> responses) {
    this.responses = Set.copyOf(responses);
  }

  public static AssessmentResponseSet from(Collection<AssessmentResponse> responses) {
    Objects.requireNonNull(responses, "respostas não podem ser nulas");

    Set<AssessmentResponse> copiedResponses = new HashSet<>();
    Set<UUID> questionIds = new HashSet<>();
    for (AssessmentResponse response : responses) {
      AssessmentResponse nonNullResponse =
          Objects.requireNonNull(response, "uma resposta não pode ser nula");
      if (!questionIds.add(nonNullResponse.questionId())) {
        throw new AssessmentRuleViolation(
            "Uma versão não pode conter duas respostas para a mesma pergunta.");
      }
      copiedResponses.add(nonNullResponse);
    }

    return new AssessmentResponseSet(copiedResponses);
  }

  public void requireCompleteFor(Collection<UUID> requiredQuestionIds) {
    Objects.requireNonNull(requiredQuestionIds, "perguntas obrigatórias não podem ser nulas");

    Set<UUID> expectedQuestionIds = new HashSet<>();
    for (UUID questionId : requiredQuestionIds) {
      UUID nonNullQuestionId =
          Objects.requireNonNull(questionId, "uma pergunta obrigatória não pode ser nula");
      if (!expectedQuestionIds.add(nonNullQuestionId)) {
        throw new IllegalArgumentException("As perguntas obrigatórias não podem ser duplicadas.");
      }
    }

    if (expectedQuestionIds.isEmpty()) {
      throw new IllegalArgumentException(
          "A avaliação deve possuir ao menos uma pergunta obrigatória.");
    }

    Set<UUID> answeredQuestionIds =
        responses.stream()
            .map(AssessmentResponse::questionId)
            .collect(java.util.stream.Collectors.toSet());
    if (!answeredQuestionIds.equals(expectedQuestionIds)) {
      throw new AssessmentRuleViolation(
          "O envio exige exatamente todas as respostas obrigatórias do questionário.");
    }
  }

  public int size() {
    return responses.size();
  }

  public record AssessmentResponse(UUID questionId, UUID optionId) {

    public AssessmentResponse {
      Objects.requireNonNull(questionId, "questionId não pode ser nulo");
      Objects.requireNonNull(optionId, "optionId não pode ser nulo");
    }
  }
}
