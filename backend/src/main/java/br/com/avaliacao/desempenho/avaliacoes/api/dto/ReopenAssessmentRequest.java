package br.com.avaliacao.desempenho.avaliacoes.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Motivo reduzido e obrigatório exigido pela transição administrativa de reabertura. */
public record ReopenAssessmentRequest(@NotBlank @Size(max = 80) String reason) {}
