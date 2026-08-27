package br.com.avaliacao.desempenho.ciclosavaliacao.api;

import br.com.avaliacao.desempenho.ciclosavaliacao.api.dto.AppliedQuestionnaireResponse;
import br.com.avaliacao.desempenho.ciclosavaliacao.api.dto.EvaluationCycleListResponse;
import br.com.avaliacao.desempenho.ciclosavaliacao.api.dto.EvaluationCycleResponseMapper;
import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleReadService;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleReadAccessContext;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticatedPrincipal;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.Objects;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Endpoints somente de leitura para ciclos visíveis e questionários efetivamente aplicados. */
@RestController
@Validated
@RequestMapping("/api/v1/evaluation-cycles")
@ConditionalOnSqlServerPersistence
@ConditionalOnProperty(
    prefix = "app.evaluation-cycles.read",
    name = "enabled",
    havingValue = "true")
public class EvaluationCycleController {

  private final EvaluationCycleReadService service;
  private final EvaluationCycleResponseMapper responseMapper = new EvaluationCycleResponseMapper();

  public EvaluationCycleController(EvaluationCycleReadService service) {
    this.service = Objects.requireNonNull(service, "serviço não pode ser nulo");
  }

  @GetMapping
  @PreAuthorize(
      "hasAnyAuthority("
          + "'PERMISSION:CICLOS.GERIR',"
          + "'PERMISSION:AVALIACOES.AVALIAR_VINCULADOS',"
          + "'PERMISSION:AUTOAVALIACOES.PREENCHER_PROPRIA',"
          + "'PERMISSION:INDICADORES.VISUALIZAR')")
  public EvaluationCycleListResponse list(
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      @RequestParam(defaultValue = "20") @Min(1) @Max(100) int limit,
      @RequestParam(required = false) UUID cursor) {
    return responseMapper.toListResponse(service.list(accessFor(principal), limit, cursor), limit);
  }

  @GetMapping("/{cycleId}/questionnaires/{cycleQuestionnaireId}")
  @PreAuthorize(
      "hasAnyAuthority("
          + "'PERMISSION:CICLOS.GERIR',"
          + "'PERMISSION:AVALIACOES.AVALIAR_VINCULADOS',"
          + "'PERMISSION:AUTOAVALIACOES.PREENCHER_PROPRIA',"
          + "'PERMISSION:INDICADORES.VISUALIZAR')")
  public AppliedQuestionnaireResponse getAppliedQuestionnaire(
      @PathVariable UUID cycleId,
      @PathVariable UUID cycleQuestionnaireId,
      @AuthenticationPrincipal AuthenticatedPrincipal principal) {
    return responseMapper.toAppliedQuestionnaireResponse(
        service.getAppliedQuestionnaire(cycleId, cycleQuestionnaireId, accessFor(principal)));
  }

  private static EvaluationCycleReadAccessContext accessFor(AuthenticatedPrincipal principal) {
    AuthenticatedPrincipal authenticated =
        Objects.requireNonNull(principal, "principal autenticado não foi resolvido");
    return new EvaluationCycleReadAccessContext(
        authenticated.userId(), authenticated.user().permissions());
  }
}
