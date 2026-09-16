package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerMapping;

/** Gera um identificador de correlação limitado, sem registrar dados da requisição. */
public final class RequestCorrelationFilter extends OncePerRequestFilter {

  private static final Logger LOG = LoggerFactory.getLogger(RequestCorrelationFilter.class);
  private static final String PROBLEM_CODE =
      RequestCorrelationFilter.class.getName() + ".problemCode";
  private static final String REASON_CODE =
      RequestCorrelationFilter.class.getName() + ".reasonCode";

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
    try {
      filterChain.doFilter(request, response);
    } finally {
      if (response.getStatus() >= 400) {
        String method =
            Set.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD")
                    .contains(request.getMethod())
                ? request.getMethod()
                : "OTHER";
        Object template = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        String route =
            template instanceof String value && value.matches("/api/v1/[A-Za-z0-9_/{}/.*-]{1,160}")
                ? value
                : routeFamily(request.getRequestURI());
        LOG.warn(
            "api_request_rejected method={} route={} status={} code={} reason={} requestId={}",
            method,
            route,
            response.getStatus(),
            safeCode(request.getAttribute(PROBLEM_CODE)),
            safeCode(request.getAttribute(REASON_CODE)),
            requestId);
      }
    }
  }

  private static String routeFamily(String uri) {
    for (String family :
        Set.of(
            "auth",
            "evaluation-cycles",
            "questionnaire-versions",
            "master-data",
            "administration",
            "assessments",
            "indicators")) {
      String prefix = "/api/v1/" + family;
      if (uri.equals(prefix) || uri.startsWith(prefix + "/")) return prefix + "/**";
    }
    return "unmapped";
  }

  public static void recordProblem(HttpServletRequest request, Object code, Object reason) {
    request.setAttribute(PROBLEM_CODE, safeCode(code));
    request.setAttribute(REASON_CODE, safeCode(reason));
  }

  private static String safeCode(Object code) {
    return code instanceof String value && value.matches("[A-Z][A-Z0-9_]{0,63}")
        ? value
        : "UNSPECIFIED";
  }

  public static String getRequestId(HttpServletRequest request) {
    Object value = request.getAttribute(REQUEST_ID_ATTRIBUTE);
    return value instanceof String requestId ? requestId : UUID.randomUUID().toString();
  }

  private boolean isAccepted(String requestId) {
    return requestId != null && ACCEPTED_REQUEST_ID.matcher(requestId).matches();
  }
}
