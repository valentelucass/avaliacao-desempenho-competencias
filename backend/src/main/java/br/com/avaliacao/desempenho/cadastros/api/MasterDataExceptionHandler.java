package br.com.avaliacao.desempenho.cadastros.api;

import br.com.avaliacao.desempenho.cadastros.application.MasterDataException;
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

/** Converte falhas de cadastro em respostas seguras, sem nome de tabela ou causa SQL. */
@RestControllerAdvice(basePackageClasses = MasterDataController.class)
public class MasterDataExceptionHandler {

  private static final String PROBLEM_BASE = "https://api-formulario.rodogarcia.com.br/problems/";

  @ExceptionHandler(MasterDataException.class)
  ResponseEntity<ProblemDetail> masterDataFailure(
      MasterDataException exception, HttpServletRequest request) {
    return switch (exception.reason()) {
      case INVALID_INPUT ->
          problem(
              request,
              HttpStatus.UNPROCESSABLE_CONTENT,
              "VALIDATION_FAILED",
              "Solicitação inválida",
              "Revise os campos obrigatórios e seus formatos.");
      case CONFLICT ->
          problem(
              request,
              HttpStatus.CONFLICT,
              "CONFLICT",
              "Operação não permitida",
              "A operação conflita com o estado atual do cadastro.");
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
        "Revise os campos obrigatórios e seus formatos.");
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
