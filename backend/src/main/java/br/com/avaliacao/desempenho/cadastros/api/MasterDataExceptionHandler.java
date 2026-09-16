package br.com.avaliacao.desempenho.cadastros.api;

import br.com.avaliacao.desempenho.cadastros.application.MasterDataException;
import br.com.avaliacao.desempenho.cadastros.application.SpreadsheetImportException;
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

  @ExceptionHandler(SpreadsheetImportException.class)
  ResponseEntity<ProblemDetail> spreadsheetFailure(
      SpreadsheetImportException exception, HttpServletRequest request) {
    HttpStatus status =
        switch (exception.reason()) {
          case LIMIT_EXCEEDED -> HttpStatus.CONTENT_TOO_LARGE;
          case INVALID_FILE -> HttpStatus.UNPROCESSABLE_CONTENT;
          case EXPIRED, STALE -> HttpStatus.CONFLICT;
          case RATE_LIMITED -> HttpStatus.TOO_MANY_REQUESTS;
        };
    String detail =
        switch (exception.reason()) {
          case INVALID_FILE ->
              "Use o modelo XLSX com uma aba, os cabeçalhos esperados e somente valores, sem fórmulas ou links.";
          case LIMIT_EXCEEDED ->
              "Use uma planilha de até 1 MB e 1.000 registros, sem conteúdo adicional.";
          case EXPIRED ->
              "A conferência expirou ou não está disponível. Confira novamente a planilha.";
          case STALE ->
              "Os cadastros mudaram ou há pendências. Confira novamente antes de confirmar.";
          case RATE_LIMITED ->
              "Aguarde um minuto ou descarte uma conferência anterior antes de tentar novamente.";
        };
    return problem(
        request, status, "IMPORT_" + exception.reason().name(), "Importação não concluída", detail);
  }

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
      case DELETION_BLOCKED ->
          problem(
              request,
              HttpStatus.CONFLICT,
              "MASTER_DATA_DELETE_BLOCKED",
              "Exclusão não permitida",
              "Só é possível excluir um cadastro desativado e sem uso. Lotações, vínculos, atribuições e avaliações, inclusive históricos, impedem a exclusão. Edite ou reative o cadastro.");
      case DELETION_UNAVAILABLE ->
          problem(
              request,
              HttpStatus.SERVICE_UNAVAILABLE,
              "MASTER_DATA_DELETE_UNAVAILABLE",
              "Exclusão indisponível",
              "A exclusão ainda não foi habilitada neste ambiente. Solicite a configuração ao administrador; edição e reativação continuam disponíveis.");
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
    RequestCorrelationFilter.recordProblem(request, code, null);
    return ResponseEntity.status(status)
        .contentType(MediaType.APPLICATION_PROBLEM_JSON)
        .body(problem);
  }
}
