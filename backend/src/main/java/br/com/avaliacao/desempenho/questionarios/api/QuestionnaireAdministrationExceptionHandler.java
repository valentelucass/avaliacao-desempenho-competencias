package br.com.avaliacao.desempenho.questionarios.api;

import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.RequestCorrelationFilter;
import br.com.avaliacao.desempenho.questionarios.application.QuestionnaireAdministrationException;
import br.com.avaliacao.desempenho.questionarios.domain.model.QuestionnaireRuleViolation;
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

/** Converte falhas administrativas em respostas estáveis e sem detalhes do schema. */
@RestControllerAdvice(basePackageClasses = QuestionnaireAdministrationController.class)
public class QuestionnaireAdministrationExceptionHandler {

  private static final String PROBLEM_BASE = "https://api-formulario.rodogarcia.com.br/problems/";

  @ExceptionHandler(QuestionnaireAdministrationException.class)
  ResponseEntity<ProblemDetail> administrationFailure(
      QuestionnaireAdministrationException exception, HttpServletRequest request) {
    return switch (exception.reason()) {
      case CONFLICT ->
          problem(
              request,
              HttpStatus.CONFLICT,
              "CONFLICT",
              "Operação não permitida",
              "A versão conflita com o catálogo ou versão já existente.");
      case UNAVAILABLE ->
          problem(
              request,
              HttpStatus.SERVICE_UNAVAILABLE,
              "RESOURCE_UNAVAILABLE",
              "Recurso indisponível",
              "O recurso administrativo ainda não está disponível.");
    };
  }

  @ExceptionHandler({
    QuestionnaireRuleViolation.class,
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
        "Revise o conteúdo, a ordem e as versões informadas.");
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
