package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.web.filter.OncePerRequestFilter;

/** Gera um identificador de correlação limitado, sem registrar dados da requisição. */
public final class RequestCorrelationFilter extends OncePerRequestFilter {

  public static final String REQUEST_ID_ATTRIBUTE =
      RequestCorrelationFilter.class.getName() + ".requestId";
  public static final String REQUEST_ID_HEADER = "X-Request-Id";

  private static final Pattern ACCEPTED_REQUEST_ID =
      Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,63}");

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    String suppliedRequestId = request.getHeader(REQUEST_ID_HEADER);
    String requestId =
        isAccepted(suppliedRequestId) ? suppliedRequestId : UUID.randomUUID().toString();

    request.setAttribute(REQUEST_ID_ATTRIBUTE, requestId);
    response.setHeader(REQUEST_ID_HEADER, requestId);
    filterChain.doFilter(request, response);
  }

  public static String getRequestId(HttpServletRequest request) {
    Object value = request.getAttribute(REQUEST_ID_ATTRIBUTE);
    return value instanceof String requestId ? requestId : UUID.randomUUID().toString();
  }

  private boolean isAccepted(String requestId) {
    return requestId != null && ACCEPTED_REQUEST_ID.matcher(requestId).matches();
  }
}
