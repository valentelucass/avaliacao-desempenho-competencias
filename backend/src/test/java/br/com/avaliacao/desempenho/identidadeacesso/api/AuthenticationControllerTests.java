package br.com.avaliacao.desempenho.identidadeacesso.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import br.com.avaliacao.desempenho.identidadeacesso.application.LocalAuthenticationService;
import br.com.avaliacao.desempenho.identidadeacesso.application.LoginRateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AuthenticationControllerTests {

  @Test
  void refreshAcceptsTheRefreshCookieFromTheRawCookieHeaderWhenServletParsingIsUnavailable() {
    LocalAuthenticationService authenticationService = mock(LocalAuthenticationService.class);
    AuthenticationController controller =
        new AuthenticationController(
            authenticationService,
            new LoginRateLimiter(
                Clock.fixed(Instant.parse("2026-08-29T00:00:00Z"), ZoneOffset.UTC),
                5,
                Duration.ofMinutes(1)));
    HttpServletRequest request = mock(HttpServletRequest.class);
    HttpServletResponse response = mock(HttpServletResponse.class);
    String refreshToken = "A".repeat(64);
    when(request.getCookies()).thenReturn(null);
    when(request.getHeader("Cookie")).thenReturn("ADC-ACCESS=value; ADC-REFRESH=" + refreshToken);
    when(authenticationService.refresh(eq(refreshToken), any()))
        .thenReturn(sessionCredentials(refreshToken));

    controller.refresh(request, response);

    verify(authenticationService).refresh(eq(refreshToken), any());
  }

  private static LocalAuthenticationService.SessionCredentials sessionCredentials(
      String refreshToken) {
    Instant now = Instant.parse("2026-08-29T00:00:00Z");
    return new LocalAuthenticationService.SessionCredentials(
        UUID.randomUUID(),
        "Conta de teste",
        false,
        UUID.randomUUID(),
        "access-token",
        now.plusSeconds(300),
        refreshToken,
        now.plusSeconds(3600));
  }
}
