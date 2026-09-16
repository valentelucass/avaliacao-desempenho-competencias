package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.servlet.HandlerMapping;

class RequestCorrelationDiagnosticsTests {
  @Test
  void logsOnlyRouteTemplateStatusCodesAndSafeCorrelation() throws Exception {
    Logger logger = (Logger) LoggerFactory.getLogger(RequestCorrelationFilter.class);
    ListAppender<ILoggingEvent> appender = new ListAppender<>();
    appender.start();
    logger.addAppender(appender);
    try {
      MockHttpServletRequest request =
          new MockHttpServletRequest("POST", "/api/v1/evaluation-cycles/private-resource");
      request.setQueryString("name=private-query");
      request.setContent("private-payload".getBytes());
      request.addHeader("Cookie", "private-cookie");
      request.addHeader("Authorization", "private-authorization");
      request.addHeader("X-Request-Id", "safe-reference");
      request.setAttribute(
          HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, "/api/v1/evaluation-cycles/{cycleId}");
      MockHttpServletResponse response = new MockHttpServletResponse();
      new RequestCorrelationFilter()
          .doFilter(
              request,
              response,
              (ignoredRequest, ignoredResponse) -> {
                RequestCorrelationFilter.recordProblem(
                    request, "VALIDATION_FAILED", "CYCLE_WINDOW_INVALID");
                response.setStatus(422);
              });
      assertThat(appender.list).hasSize(1);
      assertThat(appender.list.getFirst().getFormattedMessage())
          .contains(
              "method=POST",
              "route=/api/v1/evaluation-cycles/{cycleId}",
              "status=422",
              "code=VALIDATION_FAILED",
              "reason=CYCLE_WINDOW_INVALID",
              "requestId=safe-reference")
          .doesNotContain("private-");
    } finally {
      logger.detachAppender(appender);
      appender.stop();
    }
  }
}
