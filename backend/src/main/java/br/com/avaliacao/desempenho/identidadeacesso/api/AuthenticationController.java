package br.com.avaliacao.desempenho.identidadeacesso.api;

import br.com.avaliacao.desempenho.identidadeacesso.application.LocalAuthenticationService;
import br.com.avaliacao.desempenho.identidadeacesso.application.LoginRateLimiter;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.LoginNormalizer;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticatedPrincipal;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticationCookieWriter;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.RequestCorrelationFilter;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Endpoints de sessão local que usam exclusivamente cookies de credencial. */
@RestController
@RequestMapping("/api/v1/auth")
@ConditionalOnSqlServerPersistence
@ConditionalOnProperty(
    prefix = "app.security.authentication",
    name = "enabled",
    havingValue = "true")
public class AuthenticationController {

  private final LocalAuthenticationService authenticationService;
  private final LoginRateLimiter loginRateLimiter;
  private final AuthenticationCookieWriter cookieWriter = new AuthenticationCookieWriter();
  private final br.com.avaliacao.desempenho.identidadeacesso.application.OpaqueTokenService
      keyHasher = new br.com.avaliacao.desempenho.identidadeacesso.application.OpaqueTokenService();

  public AuthenticationController(
      LocalAuthenticationService authenticationService, LoginRateLimiter loginRateLimiter) {
    this.authenticationService = authenticationService;
    this.loginRateLimiter = loginRateLimiter;
  }

  @GetMapping("/csrf")
  public CsrfResponse csrf(CsrfToken csrfToken) {
    return new CsrfResponse(csrfToken.getToken());
  }

  @PostMapping("/sessions")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void login(
      @Valid @RequestBody LoginRequest request,
      HttpServletRequest servletRequest,
      HttpServletResponse servletResponse) {
    loginRateLimiter.checkAndRecord(rateLimitKey(servletRequest, request.login()));
    LocalAuthenticationService.SessionCredentials credentials =
        authenticationService.authenticate(
            request.login(),
            request.password(),
            RequestCorrelationFilter.getRequestId(servletRequest));
    cookieWriter.write(servletResponse, credentials);
  }

  @PostMapping("/sessions/refresh")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void refresh(HttpServletRequest request, HttpServletResponse response) {
    LocalAuthenticationService.SessionCredentials credentials =
        authenticationService.refresh(
            findCookie(request, AuthenticationCookieWriter.REFRESH_COOKIE_NAME),
            RequestCorrelationFilter.getRequestId(request));
    cookieWriter.write(response, credentials);
  }

  @DeleteMapping("/sessions/current")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void logout(
      Authentication authentication, HttpServletRequest request, HttpServletResponse response) {
    AuthenticatedPrincipal principal = principal(authentication);
    authenticationService.logout(
        principal.sessionId(), principal.userId(), RequestCorrelationFilter.getRequestId(request));
    cookieWriter.clear(response);
  }

  @GetMapping("/me")
  public CurrentUserResponse currentUser(Authentication authentication) {
    AuthenticatedPrincipal principal = principal(authentication);
    List<String> permissions = principal.user().permissions().stream().sorted().toList();
    return new CurrentUserResponse(
        principal.userId().toString(),
        principal.user().displayName(),
        permissions,
        principal.user().passwordChangeRequired(),
        principal.user().supremeAdministrator());
  }

  @PutMapping("/password")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void changePassword(
      Authentication authentication,
      @Valid @RequestBody ChangePasswordRequest request,
      HttpServletRequest servletRequest,
      HttpServletResponse servletResponse) {
    AuthenticatedPrincipal principal = principal(authentication);
    authenticationService.changePassword(
        principal.userId(),
        request.currentPassword(),
        request.newPassword(),
        RequestCorrelationFilter.getRequestId(servletRequest));
    cookieWriter.clear(servletResponse);
  }

  private String rateLimitKey(HttpServletRequest request, String suppliedLogin) {
    String remoteAddress = request.getRemoteAddr() == null ? "unknown" : request.getRemoteAddr();
    return keyHasher.sha256(remoteAddress + ':' + LoginNormalizer.normalize(suppliedLogin));
  }

  private static AuthenticatedPrincipal principal(Authentication authentication) {
    if (authentication == null
        || !(authentication.getPrincipal() instanceof AuthenticatedPrincipal principal)) {
      throw new IllegalStateException("Authenticated principal was not resolved.");
    }
    return principal;
  }

  private static String findCookie(HttpServletRequest request, String name) {
    Cookie[] cookies = request.getCookies();
    if (cookies == null) {
      return "";
    }
    for (Cookie cookie : cookies) {
      if (name.equals(cookie.getName())) {
        return cookie.getValue();
      }
    }
    return "";
  }

  public record LoginRequest(
      @NotBlank @Size(max = 128) String login, @NotBlank @Size(max = 200) String password) {}

  public record ChangePasswordRequest(
      @NotBlank @Size(max = 200) String currentPassword,
      @NotBlank @Size(max = 200) String newPassword) {}

  public record CurrentUserResponse(
      String id,
      String displayName,
      List<String> permissions,
      boolean passwordChangeRequired,
      boolean supremeAdministrator) {}

  public record CsrfResponse(String token) {}
}
