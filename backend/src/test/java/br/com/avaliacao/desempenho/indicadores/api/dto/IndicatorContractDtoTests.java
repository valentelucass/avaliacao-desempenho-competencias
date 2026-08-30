package br.com.avaliacao.desempenho.indicadores.api.dto;

import static org.assertj.core.api.Assertions.assertThat;

import br.com.avaliacao.desempenho.indicadores.application.IndicatorExportResult;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorMetric;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorResult;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class IndicatorContractDtoTests {

  @Test
  void mapsTheGetContractToTheDomainWithoutTreatingIdentifiersAsResponseData() {
    UUID cycleId = UUID.randomUUID();
    UUID competencyId = UUID.randomUUID();

    GetIndicatorsRequest request =
        new GetIndicatorsRequest(
            cycleId,
            IndicatorMetricRequest.COMPETENCY_SCORE_AVERAGE,
            null,
            null,
            null,
            null,
            competencyId);

    assertThat(request.toDomainQuery().cycleId()).isEqualTo(cycleId);
    assertThat(request.toDomainQuery().metric())
        .isEqualTo(IndicatorMetric.COMPETENCY_SCORE_AVERAGE);
    assertThat(request.toDomainQuery().competencyId()).isEqualTo(competencyId);
  }

  @Test
  void mapsInsufficientDataWithoutAverageDistributionOrRawCount() {
    IndicatorResponse response =
        new IndicatorResponseMapper().toResponse(new IndicatorResult.InsufficientData());

    assertThat(response).isInstanceOf(IndicatorResponse.InsufficientData.class);
    assertThat(response.availability())
        .isEqualTo(IndicatorResponse.IndicatorAvailability.INSUFFICIENT_DATA);
  }

  @Test
  void mapsAnAvailableCsvAndKeepsTheInsufficientExportWithoutContent() {
    IndicatorExportResponseMapper mapper =
        new IndicatorExportResponseMapper(new IndicatorResponseMapper());

    IndicatorExportResponse available =
        mapper.toResponse(
            new IndicatorExportResult.AvailableCsv(
                "text/csv; charset=utf-8",
                "indicadores.csv",
                "metric,value\r\nFINAL_SCORE_AVERAGE,100\r\n"));
    IndicatorExportResponse insufficient =
        mapper.toResponse(new IndicatorExportResult.InsufficientData());

    assertThat(available).isInstanceOf(IndicatorExportResponse.AvailableCsv.class);
    assertThat(insufficient).isInstanceOf(IndicatorExportResponse.InsufficientData.class);
  }

  @Test
  void preservesOnlyAggregateFieldsInAnAvailableJsonResponse() {
    IndicatorResponse response =
        new IndicatorResponse.Available(
            IndicatorResponse.IndicatorAvailability.AVAILABLE,
            "2024.1",
            IndicatorMetricRequest.FINAL_SCORE_AVERAGE,
            new BigDecimal("100.0"),
            List.of());

    assertThat(response.availability())
        .isEqualTo(IndicatorResponse.IndicatorAvailability.AVAILABLE);
  }

  @Test
  void serializesAvailabilityForTheSpaWithoutRawPopulationData() throws Exception {
    IndicatorResponse response =
        new IndicatorResponse.Available(
            IndicatorResponse.IndicatorAvailability.AVAILABLE,
            "2024.1",
            IndicatorMetricRequest.FINAL_SCORE_AVERAGE,
            new BigDecimal("100.0"),
            List.of());

    String json = JsonMapper.builder().build().writeValueAsString(response);

    assertThat(json)
        .contains("\"availability\":\"AVAILABLE\"", "\"policyVersion\":\"2024.1\"")
        .doesNotContain("count", "collaborator", "cycleId");
  }
}
