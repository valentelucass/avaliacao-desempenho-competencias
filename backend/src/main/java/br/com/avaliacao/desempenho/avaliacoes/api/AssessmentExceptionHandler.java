package br.com.avaliacao.desempenho.avaliacoes.api;

import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentConflictException;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentForbiddenException;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentNotFoundException;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentValidationException;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentRuleViolation;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.RequestCorrelationFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.net.URI;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.BindException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/** Erros de avaliações com detalhes estáveis, sem SQL, identificadores ou texto de avaliação. */
@RestControllerAdvice(basePackageClasses = AssessmentController.class)
public class AssessmentExceptionHandler {

  private static final String PROBLEM_BASE = "https://api-formulario.rodogarcia.com.br/problems/";

  @ExceptionHandler(AssessmentNotFoundException.class)
  ResponseEntity<ProblemDetail> notFound(HttpServletRequest request) {
    return problem(
        request,
        HttpStatus.NOT_FOUND,
        "RESOURCE_NOT_FOUND",
        "Recurso não encontrado",
        "A avaliação solicitada não está disponível.");
  }

  @ExceptionHandler(AssessmentForbiddenException.class)
  ResponseEntity<ProblemDetail> forbidden(HttpServletRequest request) {
    return problem(
        request,
        HttpStatus.FORBIDDEN,
        "ACCESS_DENIED",
        "Acesso negado",
        "Você não possui acesso a esta operação.");
  }

  @ExceptionHandler(AssessmentConflictException.class)
  ResponseEntity<ProblemDetail> conflict(
      AssessmentConflictException exception, HttpServletRequest request) {
    String code =
        switch (exception.reason()) {
          case DUPLICATE_EVALUATION -> "DUPLICATE_EVALUATION";
          case IDEMPOTENCY_KEY_REUSED -> "IDEMPOTENCY_KEY_REUSED";
          case INVALID_STATE_TRANSITION -> "INVALID_STATE_TRANSITION";
          case REVISION_MISMATCH -> "REVISION_MISMATCH";
          case CONFLICT -> "CONFLICT";
        };
    return problem(
        request,
        HttpStatus.CONFLICT,
        code,
        "Conflito na avaliação",
        "A operação não pode ser concluída com a revisão ou o estado atual.");
  }

  @ExceptionHandler({AssessmentValidationException.class, AssessmentRuleViolation.class})
  ResponseEntity<ProblemDetail> validation(HttpServletRequest request) {
    return problem(
        request,
        HttpStatus.UNPROCESSABLE_CONTENT,
        "VALIDATION_FAILED",
        "Solicitação inválida",
        "Revise os campos e as respostas informados.");
  }

  @ExceptionHandler({
    MethodArgumentNotValidException.class,
    BindException.class,
    ConstraintViolationException.class,
    MethodArgumentTypeMismatchException.class
  })
  ResponseEntity<ProblemDetail> invalidRequest(HttpServletRequest request) {
    return problem(
        request,
        HttpStatus.UNPROCESSABLE_CONTENT,
        "VALIDATION_FAILED",
        "Solicitação inválida",
        "Revise os campos e cabeçalhos informados.");
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
