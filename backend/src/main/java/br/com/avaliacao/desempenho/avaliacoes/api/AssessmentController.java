package br.com.avaliacao.desempenho.avaliacoes.api;

import br.com.avaliacao.desempenho.avaliacoes.api.dto.AssessmentCreationOptionsResponse;
import br.com.avaliacao.desempenho.avaliacoes.api.dto.AssessmentDetailResponse;
import br.com.avaliacao.desempenho.avaliacoes.api.dto.AssessmentPageResponse;
import br.com.avaliacao.desempenho.avaliacoes.api.dto.AssessmentResponseMapper;
import br.com.avaliacao.desempenho.avaliacoes.api.dto.AssessmentSummaryResponse;
import br.com.avaliacao.desempenho.avaliacoes.api.dto.CreateAssessmentRequest;
import br.com.avaliacao.desempenho.avaliacoes.api.dto.ReopenAssessmentRequest;
import br.com.avaliacao.desempenho.avaliacoes.api.dto.SaveAssessmentDraftRequest;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentApplicationService;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentRepository;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAccessContext;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentType;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticatedPrincipal;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.RequestCorrelationFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** API v1 de avaliações. O cliente nunca informa autoria, permissão, nota ou estado final. */
@RestController
@Validated
@RequestMapping("/api/v1/assessments")
@ConditionalOnSqlServerPersistence
@ConditionalOnProperty(prefix = "app.assessments", name = "enabled", havingValue = "true")
public class AssessmentController {

  private final AssessmentApplicationService service;
  private final AssessmentResponseMapper responseMapper = new AssessmentResponseMapper();

  public AssessmentController(AssessmentApplicationService service) {
    this.service = Objects.requireNonNull(service, "serviço não pode ser nulo");
  }

  @GetMapping
  @PreAuthorize(
      "hasAnyAuthority("
          + "'PERMISSION:AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS',"
          + "'PERMISSION:AVALIACOES.VISUALIZAR_TODAS',"
          + "'PERMISSION:AUTOAVALIACOES.VISUALIZAR_PROPRIA')")
  public AssessmentPageResponse list(
      @RequestParam(defaultValue = "12")
          @jakarta.validation.constraints.Min(1)
          @jakarta.validation.constraints.Max(100)
          int limit,
      @RequestParam(required = false) String cursor,
      @RequestParam(required = false) UUID cycleId,
      @RequestParam(required = false) UUID collaboratorId,
      @AuthenticationPrincipal AuthenticatedPrincipal principal) {
    AssessmentRepository.AssessmentPageView page =
        service.list(
            accessFor(principal),
            new AssessmentRepository.AssessmentListFilter(cycleId, collaboratorId),
            limit,
            decodeCursor(cursor));
    List<AssessmentSummaryResponse> items =
        page.items().stream().map(responseMapper::toSummary).toList();
    return new AssessmentPageResponse(
        items,
        new AssessmentPageResponse.PageMetadata(
            limit, page.nextCursor() == null ? null : encodeCursor(page.nextCursor())));
  }

  @GetMapping("/creation-options")
  @PreAuthorize("hasAuthority('PERMISSION:AVALIACOES.AVALIAR_VINCULADOS')")
  public AssessmentCreationOptionsResponse managerCreationOptions(
      @RequestParam UUID cycleId, @AuthenticationPrincipal AuthenticatedPrincipal principal) {
    return new AssessmentCreationOptionsResponse(
        service.listManagerCreationOptions(cycleId, accessFor(principal)).stream()
            .map(
                item ->
                    new AssessmentCreationOptionsResponse.CollaboratorResponse(
                        item.id(), item.displayName()))
            .toList());
  }

  @GetMapping("/{assessmentId}")
  @PreAuthorize(
      "hasAnyAuthority("
          + "'PERMISSION:AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS',"
          + "'PERMISSION:AVALIACOES.VISUALIZAR_TODAS',"
          + "'PERMISSION:AUTOAVALIACOES.VISUALIZAR_PROPRIA')")
  public ResponseEntity<AssessmentDetailResponse> get(
      @PathVariable UUID assessmentId, @AuthenticationPrincipal AuthenticatedPrincipal principal) {
    return response(service.get(assessmentId, accessFor(principal)));
  }

  @PostMapping("/{assessmentId}/print-events")
  @PreAuthorize(
      "hasAnyAuthority("
          + "'PERMISSION:AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS',"
          + "'PERMISSION:AVALIACOES.VISUALIZAR_TODAS',"
          + "'PERMISSION:AUTOAVALIACOES.VISUALIZAR_PROPRIA')")
  public ResponseEntity<Void> recordPrint(
      @PathVariable UUID assessmentId,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    service.recordPrint(
        assessmentId, accessFor(principal), RequestCorrelationFilter.getRequestId(servletRequest));
    return ResponseEntity.noContent().build();
  }

  @PostMapping
  @PreAuthorize(
      "hasAnyAuthority("
          + "'PERMISSION:AVALIACOES.AVALIAR_VINCULADOS',"
          + "'PERMISSION:AUTOAVALIACOES.PREENCHER_PROPRIA')")
  public ResponseEntity<AssessmentDetailResponse> create(
      @Valid @RequestBody CreateAssessmentRequest request,
      @RequestHeader("Idempotency-Key") @NotBlank @Size(max = 256) String idempotencyKey,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    AssessmentAccessContext access = accessFor(principal);
    String requestId = RequestCorrelationFilter.getRequestId(servletRequest);
    AssessmentRepository.AssessmentDetailView created;
    if (request.type() == AssessmentType.GESTOR) {
      created =
          service.createManagerDraft(
              request.cycleId(),
              request.managerCollaboratorId(),
              access,
              idempotencyKey,
              requestId);
    } else {
      request.requireSelfAssessment();
      created =
          service.createSelfAssessmentDraft(request.cycleId(), access, idempotencyKey, requestId);
    }
    AssessmentDetailResponse response = responseMapper.toDetail(created);
    return ResponseEntity.status(HttpStatus.CREATED)
        .header(HttpHeaders.LOCATION, "/api/v1/assessments/" + created.summary().id())
        .header(HttpHeaders.ETAG, quotedEtag(created.summary().revision()))
        .body(response);
  }

  @PatchMapping("/{assessmentId}")
  @PreAuthorize(
      "hasAnyAuthority("
          + "'PERMISSION:AVALIACOES.AVALIAR_VINCULADOS',"
          + "'PERMISSION:AUTOAVALIACOES.PREENCHER_PROPRIA')")
  public ResponseEntity<AssessmentDetailResponse> saveDraft(
      @PathVariable UUID assessmentId,
      @Valid @RequestBody SaveAssessmentDraftRequest request,
      @RequestHeader("If-Match") @NotBlank String ifMatch,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    return response(
        service.saveDraft(
            assessmentId,
            request.toDraftContent(),
            ifMatch,
            accessFor(principal),
            RequestCorrelationFilter.getRequestId(servletRequest)));
  }

  @PostMapping("/{assessmentId}/submit")
  @PreAuthorize(
      "hasAnyAuthority("
          + "'PERMISSION:AVALIACOES.AVALIAR_VINCULADOS',"
          + "'PERMISSION:AUTOAVALIACOES.ENVIAR_PROPRIA')")
  public ResponseEntity<AssessmentDetailResponse> submit(
      @PathVariable UUID assessmentId,
      @RequestHeader("If-Match") @NotBlank String ifMatch,
      @RequestHeader("Idempotency-Key") @NotBlank @Size(max = 256) String idempotencyKey,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    return response(
        service.submit(
            assessmentId,
            ifMatch,
            accessFor(principal),
            idempotencyKey,
            RequestCorrelationFilter.getRequestId(servletRequest)));
  }

  @PostMapping("/{assessmentId}/publish")
  @PreAuthorize("hasAuthority('PERMISSION:AVALIACOES.PUBLICAR')")
  public ResponseEntity<AssessmentDetailResponse> publish(
      @PathVariable UUID assessmentId,
      @RequestHeader("Idempotency-Key") @NotBlank @Size(max = 256) String idempotencyKey,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    return response(
        service.publish(
            assessmentId,
            accessFor(principal),
            idempotencyKey,
            RequestCorrelationFilter.getRequestId(servletRequest)));
  }

  @PostMapping("/{assessmentId}/reopen")
  @PreAuthorize("hasAuthority('PERMISSION:AVALIACOES.REABRIR')")
  public ResponseEntity<AssessmentDetailResponse> reopen(
      @PathVariable UUID assessmentId,
      @Valid @RequestBody ReopenAssessmentRequest request,
      @RequestHeader("Idempotency-Key") @NotBlank @Size(max = 256) String idempotencyKey,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    return response(
        service.reopen(
            assessmentId,
            request.reason(),
            accessFor(principal),
            idempotencyKey,
            RequestCorrelationFilter.getRequestId(servletRequest)));
  }

  private ResponseEntity<AssessmentDetailResponse> response(
      AssessmentRepository.AssessmentDetailView view) {
    return ResponseEntity.ok()
        .header(HttpHeaders.ETAG, quotedEtag(view.summary().revision()))
        .body(responseMapper.toDetail(view));
  }

  private static AssessmentAccessContext accessFor(AuthenticatedPrincipal principal) {
    AuthenticatedPrincipal authenticated =
        Objects.requireNonNull(principal, "principal autenticado não foi resolvido");
    return new AssessmentAccessContext(authenticated.userId(), authenticated.user().permissions());
  }

  private static String quotedEtag(String revision) {
    return "\"" + revision + "\"";
  }

  private static String encodeCursor(AssessmentRepository.AssessmentCursor cursor) {
    String value = cursor.updatedAt().toEpochMilli() + ":" + cursor.id();
    return Base64.getUrlEncoder()
        .withoutPadding()
        .encodeToString(value.getBytes(StandardCharsets.UTF_8));
  }

  private static AssessmentRepository.AssessmentCursor decodeCursor(String encoded) {
    if (encoded == null || encoded.isBlank()) {
      return null;
    }
    try {
      String value = new String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8);
      String[] parts = value.split(":", -1);
      if (parts.length != 2) {
        throw new IllegalArgumentException();
      }
      return new AssessmentRepository.AssessmentCursor(
          Instant.ofEpochMilli(Long.parseLong(parts[0])), UUID.fromString(parts[1]));
    } catch (IllegalArgumentException exception) {
      throw new org.springframework.web.server.ResponseStatusException(
          HttpStatus.BAD_REQUEST, "Cursor de paginação inválido.");
    }
  }
}
