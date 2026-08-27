package br.com.avaliacao.desempenho.ciclosavaliacao.api;

import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleNotFoundException;
import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleReadForbiddenException;
import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleReadValidationException;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.RequestCorrelationFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.net.URI;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/** Respostas previsíveis de leitura sem revelar se o recurso existe fora do escopo. */
@RestControllerAdvice(basePackageClasses = EvaluationCycleController.class)
public class EvaluationCycleExceptionHandler {

  private static final String PROBLEM_BASE = "https://api-formulario.rodogarcia.com.br/problems/";

  @ExceptionHandler(EvaluationCycleNotFoundException.class)
  ResponseEntity<ProblemDetail> notFound(HttpServletRequest request) {
    return problem(
        request,
        HttpStatus.NOT_FOUND,
        "RESOURCE_NOT_FOUND",
        "Recurso não encontrado",
        "O recurso solicitado não está disponível.");
  }

  @ExceptionHandler(EvaluationCycleReadForbiddenException.class)
  ResponseEntity<ProblemDetail> forbidden(HttpServletRequest request) {
    return problem(
        request,
        HttpStatus.FORBIDDEN,
        "ACCESS_DENIED",
        "Acesso negado",
        "Você não possui acesso a este recurso.");
  }

  @ExceptionHandler({
    EvaluationCycleReadValidationException.class,
    ConstraintViolationException.class,
    MethodArgumentTypeMismatchException.class
  })
  ResponseEntity<ProblemDetail> invalidRequest(HttpServletRequest request) {
    return problem(
        request,
        HttpStatus.UNPROCESSABLE_CONTENT,
        "VALIDATION_FAILED",
        "Solicitação inválida",
        "Revise os campos e a paginação informados.");
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
