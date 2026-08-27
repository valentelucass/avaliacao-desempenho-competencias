package br.com.avaliacao.desempenho.administracao.api;

import br.com.avaliacao.desempenho.administracao.application.AdministrativeReadException;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.RequestCorrelationFilter;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/** Erros de leitura administrativa sem expor estado, schema ou informações pessoais adicionais. */
@RestControllerAdvice(basePackageClasses = AdministrativeReadController.class)
public class AdministrativeReadExceptionHandler {

  private static final String PROBLEM_BASE = "https://api-formulario.rodogarcia.com.br/problems/";

  @ExceptionHandler(AdministrativeReadException.class)
  ResponseEntity<ProblemDetail> administrativeReadFailure(
      AdministrativeReadException exception, HttpServletRequest request) {
    return switch (exception.reason()) {
      case FORBIDDEN ->
          problem(
              request,
              HttpStatus.FORBIDDEN,
              "ACCESS_DENIED",
              "Acesso negado",
              "Você não possui acesso a esta operação.");
      case NOT_FOUND ->
          problem(
              request,
              HttpStatus.NOT_FOUND,
              "RESOURCE_NOT_FOUND",
              "Recurso não encontrado",
              "A configuração solicitada não está disponível.");
      case UNAVAILABLE ->
          problem(
              request,
              HttpStatus.SERVICE_UNAVAILABLE,
              "SERVICE_UNAVAILABLE",
              "Serviço indisponível",
              "A leitura administrativa não está disponível.");
    };
  }

  @ExceptionHandler(MethodArgumentTypeMismatchException.class)
  ResponseEntity<ProblemDetail> malformedRequest(HttpServletRequest request) {
    return problem(
        request,
        HttpStatus.BAD_REQUEST,
        "REQUEST_MALFORMED",
        "Solicitação malformada",
        "Revise o identificador informado.");
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
