package br.com.avaliacao.desempenho.avaliacoes.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/** O navegador fornece apenas a data de negócio e o registro do feedback. */
public record CompleteFeedbackRequest(
    @NotNull LocalDate feedbackDate, @NotBlank @Size(max = 2000) String comment) {}
