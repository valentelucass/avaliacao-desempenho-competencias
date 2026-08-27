package br.com.avaliacao.desempenho.avaliacoes.api.dto;

import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/** Conteúdo substituto do rascunho; nota e classificação não são aceitas da interface. */
public record SaveAssessmentDraftRequest(
    @NotNull @Size(max = 64) List<@Valid AnswerRequest> answers,
    @Size(max = 2000) String comment,
    @Size(max = 2000) String actionPlan) {

  public AssessmentRepository.DraftContent toDraftContent() {
    return new AssessmentRepository.DraftContent(
        answers.stream()
            .map(
                answer ->
                    new AssessmentRepository.AnswerView(answer.questionId(), answer.optionId()))
            .toList(),
        comment,
        actionPlan);
  }

  public record AnswerRequest(@NotNull UUID questionId, @NotNull UUID optionId) {}
}
