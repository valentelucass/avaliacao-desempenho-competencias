package br.com.avaliacao.desempenho.identidadeacesso.api;

import br.com.avaliacao.desempenho.identidadeacesso.application.AuthenticationFailureException;
import br.com.avaliacao.desempenho.identidadeacesso.application.InvalidPasswordException;
import br.com.avaliacao.desempenho.identidadeacesso.application.RateLimitedException;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.RequestCorrelationFilter;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Traduz erros previsíveis de identidade para Problem Details sem dados de autenticação. */
@RestControllerAdvice(basePackageClasses = AuthenticationController.class)
public class IdentityAccessExceptionHandler {

  private static final String PROBLEM_BASE = "https://api-formulario.rodogarcia.com.br/problems/";

  @ExceptionHandler(AuthenticationFailureException.class)
  ResponseEntity<ProblemDetail> authenticationFailed(HttpServletRequest request) {
    return problem(
        request,
        HttpStatus.UNAUTHORIZED,
        "AUTHENTICATION_FAILED",
        "Autenticação não concluída",
        "Não foi possível concluir a autenticação.",
        null);
  }

  @ExceptionHandler(RateLimitedException.class)
  ResponseEntity<ProblemDetail> rateLimited(HttpServletRequest request) {
    return problem(
        request,
        HttpStatus.TOO_MANY_REQUESTS,
        "RATE_LIMITED",
        "Muitas tentativas",
        "Aguarde antes de tentar novamente.",
        null);
  }

  @ExceptionHandler(InvalidPasswordException.class)
  ResponseEntity<ProblemDetail> invalidPassword(HttpServletRequest request) {
    return problem(
        request,
        HttpStatus.UNPROCESSABLE_CONTENT,
        "VALIDATION_FAILED",
        "Solicitação inválida",
        "A nova senha não atende aos requisitos mínimos.",
        List.of(Map.of("field", "newPassword", "code", "INVALID")));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<ProblemDetail> invalidRequest(
      MethodArgumentNotValidException exception, HttpServletRequest request) {
    List<Map<String, String>> errors =
        exception.getBindingResult().getFieldErrors().stream()
            .map(IdentityAccessExceptionHandler::safeFieldError)
            .distinct()
            .toList();
    return problem(
        request,
        HttpStatus.UNPROCESSABLE_CONTENT,
        "VALIDATION_FAILED",
        "Solicitação inválida",
        "Revise os campos informados.",
        errors);
  }

  private static Map<String, String> safeFieldError(FieldError error) {
    String code = error.getCode() == null ? "INVALID" : error.getCode().toUpperCase();
    return Map.of("field", error.getField(), "code", code);
  }

  private static ResponseEntity<ProblemDetail> problem(
      HttpServletRequest request,
      HttpStatus status,
      String code,
      String title,
      String detail,
      List<Map<String, String>> errors) {
    ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
    problem.setType(URI.create(PROBLEM_BASE + code.toLowerCase().replace('_', '-')));
    problem.setTitle(title);
    problem.setProperty("code", code);
    problem.setProperty("requestId", RequestCorrelationFilter.getRequestId(request));
    if (errors != null && !errors.isEmpty()) {
      problem.setProperty("errors", errors);
    }
    return ResponseEntity.status(status)
        .contentType(MediaType.APPLICATION_PROBLEM_JSON)
        .body(problem);
  }
}
