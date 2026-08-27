package br.com.avaliacao.desempenho.indicadores.application;

import java.util.Objects;

/** Resultado seguro de uma exportação agregada, antes da adaptação HTTP. */
public sealed interface IndicatorExportResult
    permits IndicatorExportResult.AvailableCsv, IndicatorExportResult.InsufficientData {

  record AvailableCsv(String contentType, String fileName, String content)
      implements IndicatorExportResult {

    public AvailableCsv {
      requireNotBlank(contentType, "tipo de conteúdo");
      requireNotBlank(fileName, "nome de arquivo");
      Objects.requireNonNull(content, "conteúdo não pode ser nulo");
    }
  }

  record InsufficientData() implements IndicatorExportResult {}

  private static void requireNotBlank(String value, String fieldName) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException(fieldName + " não pode ser vazio");
    }
  }
}
