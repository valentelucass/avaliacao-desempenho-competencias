package br.com.avaliacao.desempenho.indicadores.api;

import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticatedPrincipal;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.RequestCorrelationFilter;
import br.com.avaliacao.desempenho.indicadores.api.dto.GetIndicatorsRequest;
import br.com.avaliacao.desempenho.indicadores.api.dto.IndicatorExportResponse;
import br.com.avaliacao.desempenho.indicadores.api.dto.IndicatorExportResponseMapper;
import br.com.avaliacao.desempenho.indicadores.api.dto.IndicatorFilterOptionsResponse;
import br.com.avaliacao.desempenho.indicadores.api.dto.IndicatorFilterOptionsResponseMapper;
import br.com.avaliacao.desempenho.indicadores.api.dto.IndicatorResponse;
import br.com.avaliacao.desempenho.indicadores.api.dto.IndicatorResponseMapper;
import br.com.avaliacao.desempenho.indicadores.api.dto.PostIndicatorExportRequest;
import br.com.avaliacao.desempenho.indicadores.application.GetIndicatorFilterOptionsUseCase;
import br.com.avaliacao.desempenho.indicadores.application.IndicatorExecutionContext;
import br.com.avaliacao.desempenho.indicadores.application.IndicatorRequestApplicationService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.util.Objects;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Endpoints de indicadores agregados: nunca retornam contagens ou identificadores individuais. */
@RestController
@RequestMapping("/api/v1/indicators")
@ConditionalOnSqlServerPersistence
@ConditionalOnProperty(prefix = "app.indicators", name = "enabled", havingValue = "true")
public class IndicatorController {

  private final IndicatorRequestApplicationService indicatorService;
  private final GetIndicatorFilterOptionsUseCase filterOptionsService;
  private final IndicatorResponseMapper responseMapper;
  private final IndicatorExportResponseMapper exportResponseMapper;
  private final IndicatorFilterOptionsResponseMapper filterOptionsResponseMapper;

  public IndicatorController(
      IndicatorRequestApplicationService indicatorService,
      GetIndicatorFilterOptionsUseCase filterOptionsService,
      IndicatorResponseMapper responseMapper,
      IndicatorExportResponseMapper exportResponseMapper,
      IndicatorFilterOptionsResponseMapper filterOptionsResponseMapper) {
    this.indicatorService = Objects.requireNonNull(indicatorService, "serviço não pode ser nulo");
    this.filterOptionsService =
        Objects.requireNonNull(filterOptionsService, "serviço de opções não pode ser nulo");
    this.responseMapper = Objects.requireNonNull(responseMapper, "conversor não pode ser nulo");
    this.exportResponseMapper =
        Objects.requireNonNull(exportResponseMapper, "conversor de exportação não pode ser nulo");
    this.filterOptionsResponseMapper =
        Objects.requireNonNull(
            filterOptionsResponseMapper, "conversor de opções não pode ser nulo");
  }

  @GetMapping
  @PreAuthorize("hasAuthority('PERMISSION:INDICADORES.VISUALIZAR')")
  public IndicatorResponse get(
      @Valid @ModelAttribute GetIndicatorsRequest request,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    return responseMapper.toResponse(
        indicatorService.get(executionContext(principal, servletRequest), request.toDomainQuery()));
  }

  @GetMapping("/options")
  @PreAuthorize("hasAuthority('PERMISSION:INDICADORES.VISUALIZAR')")
  public IndicatorFilterOptionsResponse options(
      @RequestParam UUID cycleId,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    return filterOptionsResponseMapper.toResponse(
        filterOptionsService.get(executionContext(principal, servletRequest), cycleId));
  }

  @PostMapping(path = "/exports", consumes = MediaType.APPLICATION_JSON_VALUE)
  @PreAuthorize(
      "hasAuthority('PERMISSION:INDICADORES.VISUALIZAR')"
          + " and hasAuthority('PERMISSION:DADOS.EXPORTAR')")
  public ResponseEntity<?> export(
      @Valid @RequestBody PostIndicatorExportRequest request,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    IndicatorExportResponse response =
        exportResponseMapper.toResponse(
            indicatorService.export(
                executionContext(principal, servletRequest), request.toDomainQuery()));

    if (response instanceof IndicatorExportResponse.AvailableCsv available) {
      return ResponseEntity.ok()
          .contentType(MediaType.parseMediaType(available.contentType()))
          .header(
              HttpHeaders.CONTENT_DISPOSITION,
              ContentDisposition.attachment()
                  .filename(available.fileName(), StandardCharsets.UTF_8)
                  .build()
                  .toString())
          .body(available.content());
    }

    IndicatorResponse.InsufficientData insufficient =
        ((IndicatorExportResponse.InsufficientData) response).response();
    return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(insufficient);
  }

  private static IndicatorExecutionContext executionContext(
      AuthenticatedPrincipal principal, HttpServletRequest request) {
    AuthenticatedPrincipal authenticatedPrincipal =
        Objects.requireNonNull(principal, "principal autenticado não foi resolvido");
    return new IndicatorExecutionContext(
        authenticatedPrincipal.userId(),
        authenticatedPrincipal.user().permissions(),
        authenticatedPrincipal.user().roleCodes(),
        RequestCorrelationFilter.getRequestId(request));
  }
}
