package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security;

import br.com.avaliacao.desempenho.identidadeacesso.application.LocalAuthenticationService.SessionCredentials;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;

/** Escreve cookies host-only seguros; nenhum token é devolvido em JSON. */
public final class AuthenticationCookieWriter {

  public static final String REFRESH_COOKIE_NAME = "ADC-REFRESH";

  public void write(HttpServletResponse response, SessionCredentials credentials) {
    addCookie(
        response,
        ResponseCookie.from(
                AccessTokenAuthenticationFilter.ACCESS_COOKIE_NAME, credentials.accessToken())
            .httpOnly(true)
            .secure(true)
            .sameSite("Strict")
            .path("/")
            .maxAge(
                nonNegative(
                    Duration.between(java.time.Instant.now(), credentials.accessTokenExpiresAt())))
            .build());
    addCookie(
        response,
        ResponseCookie.from(REFRESH_COOKIE_NAME, credentials.refreshToken())
            .httpOnly(true)
            .secure(true)
            .sameSite("Strict")
            .path("/api/v1/auth/sessions")
            .maxAge(
                nonNegative(
                    Duration.between(java.time.Instant.now(), credentials.refreshTokenExpiresAt())))
            .build());
  }

  public void clear(HttpServletResponse response) {
    addCookie(
        response,
        ResponseCookie.from(AccessTokenAuthenticationFilter.ACCESS_COOKIE_NAME, "")
            .httpOnly(true)
            .secure(true)
            .sameSite("Strict")
            .path("/")
            .maxAge(Duration.ZERO)
            .build());
    addCookie(
        response,
        ResponseCookie.from(REFRESH_COOKIE_NAME, "")
            .httpOnly(true)
            .secure(true)
            .sameSite("Strict")
            .path("/api/v1/auth/sessions")
            .maxAge(Duration.ZERO)
            .build());
  }

  private static void addCookie(HttpServletResponse response, ResponseCookie cookie) {
    response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
  }

  private static Duration nonNegative(Duration value) {
    return value.isNegative() ? Duration.ZERO : value;
  }
}
