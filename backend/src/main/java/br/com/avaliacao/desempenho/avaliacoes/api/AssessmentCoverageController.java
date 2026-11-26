package br.com.avaliacao.desempenho.avaliacoes.api;

import static br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthorizedUser.SUPREME_REVIEW_AUTHORITY;

import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentCoverageRepository.StartStatus;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentCoverageService;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAccessContext;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticatedPrincipal;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@ConditionalOnSqlServerPersistence
@ConditionalOnProperty(prefix = "app.assessments", name = "enabled", havingValue = "true")
public class AssessmentCoverageController {

  private final AssessmentCoverageService service;

  public AssessmentCoverageController(AssessmentCoverageService service) {
    this.service = service;
  }

  @GetMapping("/api/v1/assessments/coverage")
  @PreAuthorize(
      "hasAnyAuthority('PERMISSION:AVALIACOES.VISUALIZAR_TODAS','"
          + SUPREME_REVIEW_AUTHORITY
          + "')")
  public Response list(
      @RequestParam UUID cycleId,
      @RequestParam StartStatus status,
      @RequestParam(required = false) @Size(max = 160) String evaluatedName,
      @RequestParam(defaultValue = "1") @Min(1) int page,
      @RequestParam(defaultValue = "12") @Min(1) @Max(100) int limit,
      @AuthenticationPrincipal AuthenticatedPrincipal principal) {
    var access =
        new AssessmentAccessContext(
            principal.userId(), principal.user().permissions(), principal.user().roleCodes());
    var result = service.list(access, cycleId, status, evaluatedName, page, limit);
    return new Response(
        result.items().stream()
            .map(item -> new Row(item.collaboratorId(), item.displayName(), item.assessmentId()))
            .toList(),
        result.hasNextPage());
  }

  public record Row(UUID collaboratorId, String displayName, UUID assessmentId) {}

  public record Response(List<Row> items, boolean hasNextPage) {}
}
