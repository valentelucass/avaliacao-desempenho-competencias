package br.com.avaliacao.desempenho.indicadores.api;

import static org.assertj.core.api.Assertions.assertThat;

import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthorizedUser;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticatedPrincipal;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.RequestCorrelationFilter;
import br.com.avaliacao.desempenho.indicadores.api.dto.GetIndicatorsRequest;
import br.com.avaliacao.desempenho.indicadores.api.dto.IndicatorExportResponseMapper;
import br.com.avaliacao.desempenho.indicadores.api.dto.IndicatorFilterOptionsResponse;
import br.com.avaliacao.desempenho.indicadores.api.dto.IndicatorFilterOptionsResponseMapper;
import br.com.avaliacao.desempenho.indicadores.api.dto.IndicatorMetricRequest;
import br.com.avaliacao.desempenho.indicadores.api.dto.IndicatorResponse;
import br.com.avaliacao.desempenho.indicadores.api.dto.IndicatorResponseMapper;
import br.com.avaliacao.desempenho.indicadores.api.dto.PostIndicatorExportRequest;
import br.com.avaliacao.desempenho.indicadores.application.IndicatorAuditSink;
import br.com.avaliacao.desempenho.indicadores.application.IndicatorExportResult;
import br.com.avaliacao.desempenho.indicadores.application.IndicatorFilterOptionsRequestApplicationService;
import br.com.avaliacao.desempenho.indicadores.application.IndicatorRequestApplicationService;
import br.com.avaliacao.desempenho.indicadores.application.IndicatorRequestLimiter;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorFilterOption;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorFilterOptions;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorMetric;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorResult;
import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;

class IndicatorControllerTests {

  @Test
  void returnsCsvOnlyForAnAvailableExport() {
    IndicatorController controller =
        controllerWith(
            new IndicatorExportResult.AvailableCsv(
                "text/csv; charset=utf-8",
                "indicadores-2024.1.csv",
                "metric,value\r\nFINAL_SCORE_AVERAGE,100\r\n"));

    org.springframework.http.ResponseEntity<?> response =
        controller.export(exportRequest(), principal(), request("request-export"));

    assertThat(response.getStatusCode().value()).isEqualTo(200);
    assertThat(response.getHeaders().getContentType())
        .isEqualTo(MediaType.parseMediaType("text/csv; charset=utf-8"));
    assertThat(response.getHeaders().getFirst("Content-Disposition"))
        .contains("attachment", "indicadores-2024.1.csv");
    assertThat((String) response.getBody())
        .isEqualTo("metric,value\r\nFINAL_SCORE_AVERAGE,100\r\n")
        .doesNotContain("count", "collaborator", "cycle");
  }

  @Test
  void returnsOnlyTheSafeJsonStatusForAnInsufficientExport() {
    IndicatorController controller = controllerWith(new IndicatorExportResult.InsufficientData());

    org.springframework.http.ResponseEntity<?> response =
        controller.export(exportRequest(), principal(), request("request-insufficient"));

    assertThat(response.getStatusCode().value()).isEqualTo(200);
    assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_JSON);
    assertThat(response.getBody()).isInstanceOf(IndicatorResponse.InsufficientData.class);
    assertThat(((IndicatorResponse.InsufficientData) response.getBody()).policyVersion())
        .isEqualTo("2024.1");
  }

  @Test
  void mapsTheGetResultWithoutAnyRawCount() {
    IndicatorController controller = controllerWith(new IndicatorExportResult.InsufficientData());

    IndicatorResponse response =
        controller.get(
            new GetIndicatorsRequest(
                UUID.randomUUID(),
                IndicatorMetricRequest.FINAL_SCORE_AVERAGE,
                null,
                null,
                null,
                null,
                null),
            principal(),
            request("request-get"));

    assertThat(response).isInstanceOf(IndicatorResponse.Available.class);
    assertThat(((IndicatorResponse.Available) response).averageScore())
        .isEqualByComparingTo("100.0");
    assertThat(((IndicatorResponse.Available) response).classificationDistribution()).isEmpty();
    assertThat(response.toString()).doesNotContain("count", "collaborator", "cycle");
  }

  @Test
  void returnsOnlyMinimalFilterOptionsForTheRequestedCycle() {
    IndicatorController controller = controllerWith(new IndicatorExportResult.InsufficientData());

    IndicatorFilterOptionsResponse response =
        controller.options(UUID.randomUUID(), principal(), request("request-options"));

    assertThat(response.branches())
        .singleElement()
        .extracting(IndicatorFilterOptionsResponse.Option::label)
        .isEqualTo("Filial Centro");
    assertThat(response.areas())
        .singleElement()
        .extracting(IndicatorFilterOptionsResponse.Option::label)
        .isEqualTo("Operações");
    assertThat(response.managers())
        .singleElement()
        .extracting(IndicatorFilterOptionsResponse.Option::label)
        .isEqualTo("Gestor de teste");
    assertThat(response.competencies())
        .singleElement()
        .extracting(IndicatorFilterOptionsResponse.Option::label)
        .isEqualTo("Comunicação");
    assertThat(response.toString())
        .doesNotContain("count", "score", "average", "classification", "collaborator");
  }

  private static IndicatorController controllerWith(IndicatorExportResult exportResult) {
    IndicatorRequestLimiter limiter = ignored -> {};
    IndicatorAuditSink auditSink = ignored -> {};
    IndicatorRequestApplicationService service =
        new IndicatorRequestApplicationService(
            ignored ->
                new IndicatorResult.Available(
                    IndicatorMetric.FINAL_SCORE_AVERAGE, new BigDecimal("100.0"), List.of()),
            ignored -> exportResult,
            limiter,
            auditSink);
    IndicatorResponseMapper responseMapper = new IndicatorResponseMapper();
    IndicatorFilterOptionsRequestApplicationService filterOptionsService =
        new IndicatorFilterOptionsRequestApplicationService(
            ignored ->
                new IndicatorFilterOptions(
                    List.of(new IndicatorFilterOption(UUID.randomUUID(), "Filial Centro")),
                    List.of(new IndicatorFilterOption(UUID.randomUUID(), "Operações")),
                    List.of(new IndicatorFilterOption(UUID.randomUUID(), "Gestor de teste")),
                    List.of(new IndicatorFilterOption(UUID.randomUUID(), "Comunicação"))),
            limiter,
            auditSink);
    return new IndicatorController(
        service,
        filterOptionsService,
        responseMapper,
        new IndicatorExportResponseMapper(responseMapper),
        new IndicatorFilterOptionsResponseMapper());
  }

  private static PostIndicatorExportRequest exportRequest() {
    return new PostIndicatorExportRequest(
        UUID.randomUUID(),
        IndicatorMetricRequest.FINAL_SCORE_AVERAGE,
        null,
        null,
        null,
        null,
        null);
  }

  private static AuthenticatedPrincipal principal() {
    return new AuthenticatedPrincipal(
        new AuthorizedUser(
            UUID.randomUUID(),
            "RH",
            false,
            Set.of("INDICADORES.VISUALIZAR", "DADOS.EXPORTAR"),
            Set.of("GERENCIA_RH")),
        UUID.randomUUID());
  }

  private static MockHttpServletRequest request(String requestId) {
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setAttribute(RequestCorrelationFilter.REQUEST_ID_ATTRIBUTE, requestId);
    return request;
  }
}
