package br.com.avaliacao.desempenho.indicadores.api.dto;

import java.util.Objects;

/**
 * Contrato de saída de {@code POST /api/v1/indicators/exports}: CSV quando permitido e somente
 * status de insuficiência quando a privacidade bloquear a extração.
 */
public sealed interface IndicatorExportResponse
    permits IndicatorExportResponse.AvailableCsv, IndicatorExportResponse.InsufficientData {

  record AvailableCsv(String contentType, String fileName, String content)
      implements IndicatorExportResponse {

    public AvailableCsv {
      requireNotBlank(contentType, "tipo de conteúdo");
      requireNotBlank(fileName, "nome de arquivo");
      Objects.requireNonNull(content, "conteúdo não pode ser nulo");
    }
  }

  record InsufficientData(IndicatorResponse.InsufficientData response)
      implements IndicatorExportResponse {

    public InsufficientData {
      Objects.requireNonNull(response, "resposta não pode ser nula");
    }
  }

  private static void requireNotBlank(String value, String fieldName) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException(fieldName + " não pode ser vazio");
    }
  }
}
