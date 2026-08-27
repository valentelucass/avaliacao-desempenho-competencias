package br.com.avaliacao.desempenho.indicadores.api;

import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.RequestCorrelationFilter;
import br.com.avaliacao.desempenho.indicadores.application.IndicatorAccessDeniedException;
import br.com.avaliacao.desempenho.indicadores.application.IndicatorRateLimitExceededException;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorFilterViolation;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.BindException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/**
 * Converte falhas previsíveis de filtros de indicadores em problemas HTTP sem revelar a população.
 */
@RestControllerAdvice(basePackageClasses = IndicatorController.class)
public class IndicatorExceptionHandler {

  private static final String PROBLEM_BASE = "https://api-formulario.rodogarcia.com.br/problems/";

  @ExceptionHandler(IndicatorFilterViolation.class)
  ResponseEntity<ProblemDetail> invalidIndicatorFilter(HttpServletRequest request) {
    return problem(
        request,
        HttpStatus.UNPROCESSABLE_CONTENT,
        "VALIDATION_FAILED",
        "Solicitação inválida",
        "Revise os filtros de indicadores.");
  }

  @ExceptionHandler({
    BindException.class,
    MissingServletRequestParameterException.class,
    MethodArgumentTypeMismatchException.class
  })
  ResponseEntity<ProblemDetail> invalidIndicatorRequest(HttpServletRequest request) {
    return problem(
        request,
        HttpStatus.UNPROCESSABLE_CONTENT,
        "VALIDATION_FAILED",
        "Solicitação inválida",
        "Revise os campos obrigatórios e seus formatos.");
  }

  @ExceptionHandler(IndicatorRateLimitExceededException.class)
  ResponseEntity<ProblemDetail> rateLimited(HttpServletRequest request) {
    return problem(
        request,
        HttpStatus.TOO_MANY_REQUESTS,
        "RATE_LIMITED",
        "Muitas consultas",
        "Aguarde antes de realizar outra consulta de indicadores.");
  }

  @ExceptionHandler(IndicatorAccessDeniedException.class)
  ResponseEntity<ProblemDetail> accessDenied(HttpServletRequest request) {
    return problem(
        request,
        HttpStatus.FORBIDDEN,
        "ACCESS_DENIED",
        "Acesso negado",
        "Você não possui acesso a esta operação.");
  }

  private static ResponseEntity<ProblemDetail> problem(
      HttpServletRequest request, HttpStatus status, String code, String title, String detail) {
    ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
    problem.setType(URI.create(PROBLEM_BASE + code.toLowerCase().replace('_', '-')));
    problem.setTitle(title);
    problem.setProperty("code", code);
    problem.setProperty("requestId", RequestCorrelationFilter.getRequestId(request));
    return ResponseEntity.status(status)
        .contentType(MediaType.APPLICATION_PROBLEM_JSON)
        .body(problem);
  }
}
