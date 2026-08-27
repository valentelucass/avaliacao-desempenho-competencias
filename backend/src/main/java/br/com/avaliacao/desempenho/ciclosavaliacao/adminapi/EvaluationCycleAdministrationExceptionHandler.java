package br.com.avaliacao.desempenho.ciclosavaliacao.adminapi;

import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleAdministrationException;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.CycleAdministrationRuleViolation;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.RequestCorrelationFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.net.URI;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/** Falhas seguras de escrita, sem revelar a situação atual do ciclo ou o schema SQL Server. */
@RestControllerAdvice(basePackageClasses = EvaluationCycleAdministrationController.class)
public class EvaluationCycleAdministrationExceptionHandler {

  private static final String PROBLEM_BASE = "https://api-formulario.rodogarcia.com.br/problems/";

  @ExceptionHandler(EvaluationCycleAdministrationException.class)
  ResponseEntity<ProblemDetail> administrationFailure(
      EvaluationCycleAdministrationException exception, HttpServletRequest request) {
    return switch (exception.reason()) {
      case CONFLICT ->
          problem(
              request,
              HttpStatus.CONFLICT,
              "CONFLICT",
              "Operação não permitida",
              "A operação conflita com o estado atual do ciclo.");
      case UNAVAILABLE ->
          problem(
              request,
              HttpStatus.SERVICE_UNAVAILABLE,
              "SERVICE_UNAVAILABLE",
              "Recurso indisponível",
              "O recurso administrativo ainda não está disponível.");
    };
  }

  @ExceptionHandler({
    CycleAdministrationRuleViolation.class,
    MethodArgumentNotValidException.class,
    ConstraintViolationException.class,
    HttpMessageNotReadableException.class,
    MethodArgumentTypeMismatchException.class
  })
  ResponseEntity<ProblemDetail> invalidRequest(HttpServletRequest request) {
    return problem(
        request,
        HttpStatus.UNPROCESSABLE_CONTENT,
        "VALIDATION_FAILED",
        "Solicitação inválida",
        "Revise a janela anual, o fuso e os questionários aprovados informados.");
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
