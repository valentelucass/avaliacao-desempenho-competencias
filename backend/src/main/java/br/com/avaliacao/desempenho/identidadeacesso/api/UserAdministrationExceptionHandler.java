package br.com.avaliacao.desempenho.identidadeacesso.api;

import br.com.avaliacao.desempenho.identidadeacesso.application.IdentityAccessRepository;
import br.com.avaliacao.desempenho.identidadeacesso.application.UserAdministrationException;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuditEvent;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticatedPrincipal;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.RequestCorrelationFilter;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Erros administrativos sem detalhes de banco, concessão anterior ou credencial. */
@RestControllerAdvice(basePackageClasses = UserAdministrationController.class)
public class UserAdministrationExceptionHandler {

  private static final String PROBLEM_BASE = "https://api-formulario.rodogarcia.com.br/problems/";

  private final ObjectProvider<IdentityAccessRepository> auditRepository;

  public UserAdministrationExceptionHandler(
      ObjectProvider<IdentityAccessRepository> auditRepository) {
    this.auditRepository = auditRepository;
  }

  @ExceptionHandler(UserAdministrationException.class)
  ResponseEntity<ProblemDetail> handle(
      UserAdministrationException exception, HttpServletRequest request) {
    if (exception.reason() == UserAdministrationException.Reason.FORBIDDEN) {
      var authentication = SecurityContextHolder.getContext().getAuthentication();
      var repository = auditRepository.getIfAvailable();
      if (repository != null
          && authentication != null
          && authentication.getPrincipal() instanceof AuthenticatedPrincipal principal) {
        try {
          repository.writeAudit(
              new AuditEvent(
                  principal.userId(),
                  "AUTORIZACAO.NEGAR",
                  "HTTP",
                  null,
                  AuditEvent.AuditResult.DENIED,
                  RequestCorrelationFilter.getRequestId(request),
                  null));
        } catch (RuntimeException ignored) {
          // Uma falha de auditoria não deve liberar a operação nem expor dados internos.
        }
      }
    }
    HttpStatus status =
        switch (exception.reason()) {
          case INVALID_INPUT -> HttpStatus.UNPROCESSABLE_CONTENT;
          case USER_NOT_FOUND -> HttpStatus.NOT_FOUND;
          case CONFLICT -> HttpStatus.CONFLICT;
          case FORBIDDEN -> HttpStatus.FORBIDDEN;
        };
    String code =
        switch (exception.reason()) {
          case INVALID_INPUT -> "VALIDATION_FAILED";
          case USER_NOT_FOUND -> "RESOURCE_NOT_FOUND";
          case CONFLICT -> "CONFLICT";
          case FORBIDDEN -> "ACCESS_DENIED";
        };
    ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, exception.getMessage());
    problem.setType(URI.create(PROBLEM_BASE + code.toLowerCase().replace('_', '-')));
    problem.setTitle(
        status == HttpStatus.NOT_FOUND
            ? "Recurso não encontrado"
            : status == HttpStatus.FORBIDDEN ? "Acesso negado" : "Solicitação inválida");
    problem.setProperty("code", code);
    problem.setProperty("requestId", RequestCorrelationFilter.getRequestId(request));
    return ResponseEntity.status(status)
        .contentType(MediaType.APPLICATION_PROBLEM_JSON)
        .body(problem);
  }
}
