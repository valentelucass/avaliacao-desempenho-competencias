package br.com.avaliacao.desempenho.identidadeacesso.api;

import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.RequestCorrelationFilter;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

/**
 * Registra somente códigos estáveis; mensagens, conteúdo e identificadores de recursos são
 * omitidos.
 */
@RestControllerAdvice
public class ApiProblemDiagnosticsAdvice implements ResponseBodyAdvice<Object> {
  @Override
  public boolean supports(
      MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
    return true;
  }

  @Override
  public Object beforeBodyWrite(
      Object body,
      MethodParameter returnType,
      MediaType contentType,
      Class<? extends HttpMessageConverter<?>> converterType,
      ServerHttpRequest request,
      ServerHttpResponse response) {
    if (body instanceof ProblemDetail problem
        && request instanceof ServletServerHttpRequest servlet
        && problem.getProperties() != null) {
      RequestCorrelationFilter.recordProblem(
          servlet.getServletRequest(),
          problem.getProperties().get("code"),
          problem.getProperties().get("reasonCode"));
    }
    return body;
  }
}
