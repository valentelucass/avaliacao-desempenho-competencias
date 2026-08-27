package br.com.avaliacao.desempenho.ciclosavaliacao.adminapi;

import br.com.avaliacao.desempenho.ciclosavaliacao.adminapi.dto.CreatedEvaluationCycleResponse;
import br.com.avaliacao.desempenho.ciclosavaliacao.adminapi.dto.CreatedEvaluationCycleResponse.AppliedQuestionnaire;
import br.com.avaliacao.desempenho.ciclosavaliacao.adminapi.dto.EvaluationCycleAdministrationRequests.CreateCycle;
import br.com.avaliacao.desempenho.ciclosavaliacao.adminapi.dto.EvaluationCycleAdministrationRequests.UpdateCycle;
import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleAdministrationRepository.CreatedCycle;
import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleAdministrationService;
import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleCommandContext;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticatedPrincipal;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.RequestCorrelationFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Objects;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Administração de ciclos em rascunho, separada dos endpoints existentes somente de leitura. */
@RestController
@RequestMapping("/api/v1/evaluation-cycles")
@ConditionalOnSqlServerPersistence
public class EvaluationCycleAdministrationController {

  private static final String MANAGE_CYCLES = "hasAuthority('PERMISSION:CICLOS.GERIR')";

  private final EvaluationCycleAdministrationService service;

  public EvaluationCycleAdministrationController(EvaluationCycleAdministrationService service) {
    this.service = Objects.requireNonNull(service, "serviço não pode ser nulo");
  }

  @PostMapping
  @PreAuthorize(MANAGE_CYCLES)
  public ResponseEntity<CreatedEvaluationCycleResponse> createCycle(
      @Valid @RequestBody CreateCycle request,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    CreatedCycle created =
        service.createDraftCycle(request.toDraft(), context(principal, servletRequest));
    return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(created));
  }

  @PutMapping("/{cycleId}")
  @PreAuthorize(MANAGE_CYCLES)
  public ResponseEntity<Void> replaceDraftConfiguration(
      @PathVariable UUID cycleId,
      @Valid @RequestBody UpdateCycle request,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    service.replaceDraftConfiguration(
        cycleId, request.toDraft(), context(principal, servletRequest));
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/{cycleId}/open")
  @PreAuthorize(MANAGE_CYCLES)
  public ResponseEntity<Void> openCycle(
      @PathVariable UUID cycleId,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    service.openCycle(cycleId, context(principal, servletRequest));
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/{cycleId}/close")
  @PreAuthorize(MANAGE_CYCLES)
  public ResponseEntity<Void> closeCycle(
      @PathVariable UUID cycleId,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    service.closeCycle(cycleId, context(principal, servletRequest));
    return ResponseEntity.noContent().build();
  }

  private static CreatedEvaluationCycleResponse toResponse(CreatedCycle created) {
    return new CreatedEvaluationCycleResponse(
        created.cycleId(),
        created.questionnaires().stream()
            .map(
                value ->
                    new AppliedQuestionnaire(
                        value.cycleQuestionnaireId(), value.questionnaireVersionId()))
            .toList());
  }

  private static EvaluationCycleCommandContext context(
      AuthenticatedPrincipal principal, HttpServletRequest servletRequest) {
    AuthenticatedPrincipal authenticated =
        Objects.requireNonNull(principal, "principal autenticado não foi resolvido");
    return new EvaluationCycleCommandContext(
        authenticated.userId(), RequestCorrelationFilter.getRequestId(servletRequest));
  }
}
