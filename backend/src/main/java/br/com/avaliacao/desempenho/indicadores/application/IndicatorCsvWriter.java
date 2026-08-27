package br.com.avaliacao.desempenho.indicadores.application;

import br.com.avaliacao.desempenho.indicadores.domain.model.ClassificationPercentage;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorMetric;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorResult;
import java.math.BigDecimal;

/** Serializa apenas dados já liberados pela política de privacidade em CSV UTF-8. */
final class IndicatorCsvWriter {

  String write(IndicatorResult.Available result) {
    StringBuilder csv = new StringBuilder();
    if (result.metric() == IndicatorMetric.CLASSIFICATION_DISTRIBUTION) {
      csv.append("classification,percentage\r\n");
      for (ClassificationPercentage percentage : result.classificationDistribution()) {
        csv.append(percentage.classification().name())
            .append(',')
            .append(decimal(percentage.percentage()))
            .append("\r\n");
      }
      return csv.toString();
    }

    csv.append("metric,value\r\n")
        .append(result.metric().name())
        .append(',')
        .append(decimal(result.averageScore()))
        .append("\r\n");
    return csv.toString();
  }

  private String decimal(BigDecimal value) {
    return value.stripTrailingZeros().toPlainString();
  }
}
