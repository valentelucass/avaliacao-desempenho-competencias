package br.com.avaliacao.desempenho.questionarios.api.dto;

import java.util.UUID;

/** Identificadores dos artefatos congelados criados na mesma transação. */
public record CreatedQuestionnaireVersionResponse(
    UUID questionnaireVersionId,
    UUID calculationConfigurationVersionId,
    UUID classificationMatrixVersionId) {}
