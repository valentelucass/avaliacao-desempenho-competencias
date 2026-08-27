package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.http.Cookie;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfToken;

class CookieCsrfTokenRepositoryTests {

  @Test
  void acceptsTheMaskedTokenIssuedForTheCsrfCookie() throws Exception {
    CookieCsrfTokenRepository repository = new ApiSecurityConfiguration().csrfTokenRepository();
    CsrfFilter csrfFilter = new CsrfFilter(repository);
    MockHttpServletRequest issueRequest = new MockHttpServletRequest("GET", "/api/v1/auth/csrf");
    MockHttpServletResponse issueResponse = new MockHttpServletResponse();
    AtomicReference<CsrfToken> issuedToken = new AtomicReference<>();

    csrfFilter.doFilter(
        issueRequest,
        issueResponse,
        (request, response) ->
            issuedToken.set((CsrfToken) request.getAttribute(CsrfToken.class.getName())));

    String maskedToken = issuedToken.get().getToken();
    Cookie csrfCookie = issueResponse.getCookie("ADC-XSRF-TOKEN");
    assertThat(csrfCookie).isNotNull();
    assertThat(maskedToken).isNotEqualTo(csrfCookie.getValue());

    MockHttpServletRequest protectedRequest =
        new MockHttpServletRequest("PUT", "/api/v1/auth/password");
    protectedRequest.setCookies(csrfCookie);
    protectedRequest.addHeader("X-CSRF-TOKEN", maskedToken);
    AtomicBoolean targetReached = new AtomicBoolean();

    csrfFilter.doFilter(
        protectedRequest,
        new MockHttpServletResponse(),
        (request, response) -> targetReached.set(true));

    assertThat(targetReached).isTrue();
  }

  @Test
  void issuesTheReadableCsrfCookieWithSecureSameSiteAndHostOnlyAttributes() throws Exception {
    CookieCsrfTokenRepository repository = new ApiSecurityConfiguration().csrfTokenRepository();
    CsrfFilter csrfFilter = new CsrfFilter(repository);
    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/auth/csrf");
    MockHttpServletResponse response = new MockHttpServletResponse();

    csrfFilter.doFilter(
        request,
        response,
        (filteredRequest, ignoredResponse) ->
            ((CsrfToken) filteredRequest.getAttribute(CsrfToken.class.getName())).getToken());

    Cookie csrfCookie = response.getCookie("ADC-XSRF-TOKEN");
    assertThat(csrfCookie).isNotNull();
    assertThat(csrfCookie.getSecure()).isTrue();
    assertThat(csrfCookie.isHttpOnly()).isFalse();
    assertThat(csrfCookie.getAttribute("SameSite")).isEqualTo("Strict");
    String setCookie = response.getHeader(HttpHeaders.SET_COOKIE);
    assertThat(setCookie).contains("Path=/", "Secure");
    assertThat(setCookie).doesNotContain("Domain=");
  }
}
