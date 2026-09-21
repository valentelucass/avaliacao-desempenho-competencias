package br.com.avaliacao.desempenho.identidadeacesso.api;

import br.com.avaliacao.desempenho.identidadeacesso.application.PasswordRecoveryService;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticatedPrincipal;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.RequestCorrelationFilter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
@ConditionalOnSqlServerPersistence
public class PasswordRecoveryController {
  private final PasswordRecoveryService service;

  public PasswordRecoveryController(PasswordRecoveryService service) {
    this.service = service;
  }

  @PostMapping("/auth/password-reset-requests")
  public ResponseEntity<Void> request(
      @Valid @RequestBody Request input, HttpServletRequest request) {
    service.request(
        input.login(), request.getRemoteAddr(), RequestCorrelationFilter.getRequestId(request));
    return ResponseEntity.accepted().header("Cache-Control", "no-store").build();
  }

  @GetMapping("/administration/password-reset-requests")
  @PreAuthorize(
      "hasAuthority('PERMISSION:USUARIOS.LER') and hasAuthority('PERMISSION:USUARIOS.ALTERAR')")
  public RequestPage list(
      @RequestParam(defaultValue = "0") long after,
      @RequestParam(defaultValue = "100") int limit,
      @AuthenticationPrincipal AuthenticatedPrincipal actor) {
    var found = service.list(actor.userId(), actor.user().permissions(), after, limit);
    var items = found.stream().limit(limit).toList();
    String next = found.size() > limit ? Long.toString(items.getLast().sequence()) : null;
    return new RequestPage(
        items.stream()
            .map(
                item ->
                    new PendingRequest(
                        item.userId(), item.displayName(), item.login(), item.requestedAt()))
            .toList(),
        new Page(limit, next));
  }

  @PostMapping("/administration/users/{userId}/temporary-password")
  @PreAuthorize(
      "hasAuthority('PERMISSION:USUARIOS.LER') and hasAuthority('PERMISSION:USUARIOS.ALTERAR')")
  public ResponseEntity<GeneratedPassword> generate(
      @PathVariable UUID userId,
      @AuthenticationPrincipal AuthenticatedPrincipal actor,
      HttpServletRequest request) {
    var generated =
        service.generate(
            userId,
            actor.userId(),
            actor.user().permissions(),
            RequestCorrelationFilter.getRequestId(request));
    return ResponseEntity.ok()
        .header("Cache-Control", "no-store")
        .body(
            new GeneratedPassword(
                UserAdministrationController.UserResponse.from(generated.user()),
                generated.temporaryPassword()));
  }

  public record Request(@NotBlank @Size(max = 128) String login) {
    @JsonAnySetter
    public void rejectUnknown(String field, Object value) {
      throw new IllegalArgumentException("Campo não permitido na solicitação.");
    }

    @Override
    public String toString() {
      return "PasswordRecoveryRequest[redacted]";
    }
  }

  public record PendingRequest(
      UUID userId, String displayName, String login, Instant requestedAt) {}

  public record RequestPage(List<PendingRequest> items, Page page) {}

  public record Page(int limit, String nextCursor) {}

  public record GeneratedPassword(
      UserAdministrationController.UserResponse user, String temporaryPassword) {
    @Override
    public String toString() {
      return "GeneratedPassword[redacted]";
    }
  }
}
