package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import tools.jackson.databind.ObjectMapper;

/** Escreve erros de segurança sem vazar detalhes internos ou dados pessoais. */
public final class SecurityProblemWriter {

  private static final String PROBLEM_BASE = "https://api-formulario.rodogarcia.com.br/problems/";

  private final ObjectMapper objectMapper;

  public SecurityProblemWriter(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  public void writeAuthenticationRequired(HttpServletRequest request, HttpServletResponse response)
      throws IOException {
    write(
        request,
        response,
        HttpStatus.UNAUTHORIZED,
        "AUTHENTICATION_REQUIRED",
        "Autenticação necessária",
        "Autentique-se para acessar este recurso.");
  }

  public void writeAccessDenied(HttpServletRequest request, HttpServletResponse response)
      throws IOException {
    write(
        request,
        response,
        HttpStatus.FORBIDDEN,
        "ACCESS_DENIED",
        "Acesso negado",
        "Você não possui permissão para esta operação.");
  }

  private void write(
      HttpServletRequest request,
      HttpServletResponse response,
      HttpStatus status,
      String code,
      String title,
      String detail)
      throws IOException {
    if (response.isCommitted()) {
      return;
    }

    ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
    problem.setType(URI.create(PROBLEM_BASE + code.toLowerCase().replace('_', '-')));
    problem.setTitle(title);
    problem.setProperty("code", code);
    problem.setProperty("requestId", RequestCorrelationFilter.getRequestId(request));

    response.setStatus(status.value());
    response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
    objectMapper.writeValue(response.getOutputStream(), problem);
  }
}
