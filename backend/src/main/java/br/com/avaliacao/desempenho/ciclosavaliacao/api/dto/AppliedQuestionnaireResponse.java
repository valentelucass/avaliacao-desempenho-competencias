package br.com.avaliacao.desempenho.ciclosavaliacao.api.dto;

import java.util.List;
import java.util.UUID;

/**
 * Conteúdo da versão imutável de questionário efetivamente aplicada ao ciclo, sem pontos ou dados
 * de pessoas. A nota continua autoridade exclusiva do servidor.
 */
public record AppliedQuestionnaireResponse(
    UUID cycleQuestionnaireId,
    UUID questionnaireVersionId,
    String questionnaireCode,
    int questionnaireVersionNumber,
    String title,
    List<CompetencyResponse> competencies) {

  public AppliedQuestionnaireResponse {
    competencies = List.copyOf(competencies);
  }

  public record CompetencyResponse(UUID id, String name, List<QuestionResponse> questions) {

    public CompetencyResponse {
      questions = List.copyOf(questions);
    }
  }

  public record QuestionResponse(
      UUID id, String text, String description, boolean required, List<OptionResponse> options) {

    public QuestionResponse {
      options = List.copyOf(options);
    }
  }

  public record OptionResponse(UUID id, String label) {}
}
