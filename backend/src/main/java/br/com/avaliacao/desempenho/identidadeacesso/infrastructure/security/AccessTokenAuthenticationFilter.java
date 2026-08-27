package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security;

import br.com.avaliacao.desempenho.identidadeacesso.application.IdentityAccessRepository;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthorizedUser;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Clock;
import java.util.Collection;
import java.util.List;
import java.util.stream.Stream;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Autentica o cookie de acesso somente após validar assinatura, claims, sessão e usuário ativo. */
@Component
@ConditionalOnSqlServerPersistence
@ConditionalOnProperty(
    prefix = "app.security.authentication",
    name = "enabled",
    havingValue = "true")
public class AccessTokenAuthenticationFilter extends OncePerRequestFilter {

  public static final String ACCESS_COOKIE_NAME = "ADC-ACCESS";

  private final AccessTokenService jwtService;
  private final IdentityAccessRepository repository;
  private final Clock clock;

  public AccessTokenAuthenticationFilter(
      AccessTokenService jwtService, IdentityAccessRepository repository, Clock clock) {
    this.jwtService = jwtService;
    this.repository = repository;
    this.clock = clock;
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    return !request.getRequestURI().startsWith("/api/");
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    if (SecurityContextHolder.getContext().getAuthentication() == null) {
      jwtService
          .decode(findCookie(request, ACCESS_COOKIE_NAME))
          .ifPresent(
              token ->
                  repository
                      .findAuthorizedUserForActiveSession(
                          token.sessionId(), token.userId(), token.accessTokenId(), clock.instant())
                      .ifPresent(user -> authenticate(request, user, token.sessionId())));
    }
    filterChain.doFilter(request, response);
  }

  private void authenticate(
      HttpServletRequest request, AuthorizedUser user, java.util.UUID sessionId) {
    Collection<SimpleGrantedAuthority> authorities =
        user.passwordChangeRequired()
            ? List.of()
            : Stream.concat(
                    user.permissions().stream()
                        .map(permission -> new SimpleGrantedAuthority("PERMISSION:" + permission)),
                    user.roleCodes().stream()
                        .map(roleCode -> new SimpleGrantedAuthority("ROLE:" + roleCode)))
                .toList();
    UsernamePasswordAuthenticationToken authentication =
        new UsernamePasswordAuthenticationToken(
            new AuthenticatedPrincipal(user, sessionId), null, authorities);
    authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
    SecurityContextHolder.getContext().setAuthentication(authentication);
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
}
