package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security;

import br.com.avaliacao.desempenho.identidadeacesso.application.IdentityAccessRepository;
import br.com.avaliacao.desempenho.identidadeacesso.application.LoginRateLimiter;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuditEvent;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.security.web.header.writers.StaticHeadersWriter;
import org.springframework.security.web.util.matcher.AnyRequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import tools.jackson.databind.ObjectMapper;

/** Segurança HTTP da API até que a persistência de identidade seja autorizada. */
@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
@EnableMethodSecurity
@EnableConfigurationProperties({
  CorsSecurityProperties.class,
  AuthenticationSecurityProperties.class
})
public class ApiSecurityConfiguration {

  @Bean
  SecurityFilterChain securityFilterChain(
      HttpSecurity http,
      CorsConfigurationSource corsConfigurationSource,
      RequestCorrelationFilter requestCorrelationFilter,
      SecurityProblemWriter securityProblemWriter,
      ObjectProvider<AccessTokenAuthenticationFilter> accessTokenAuthenticationFilter,
      ObjectProvider<IdentityAccessRepository> identityAccessRepository)
      throws Exception {
    http.csrf(csrf -> csrf.csrfTokenRepository(csrfTokenRepository()))
        .cors(cors -> cors.configurationSource(corsConfigurationSource))
        .sessionManagement(
            sessionManagement ->
                sessionManagement.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .requestCache(AbstractHttpConfigurer::disable)
        .httpBasic(AbstractHttpConfigurer::disable)
        .formLogin(AbstractHttpConfigurer::disable)
        .logout(AbstractHttpConfigurer::disable)
        .exceptionHandling(
            exceptionHandling ->
                exceptionHandling
                    .authenticationEntryPoint(
                        (request, response, exception) ->
                            securityProblemWriter.writeAuthenticationRequired(request, response))
                    .accessDeniedHandler(
                        (request, response, exception) -> {
                          writeDeniedAudit(request, identityAccessRepository.getIfAvailable());
                          securityProblemWriter.writeAccessDenied(request, response);
                        }))
        .headers(
            headers ->
                headers
                    .contentTypeOptions(Customizer.withDefaults())
                    .frameOptions(frameOptions -> frameOptions.deny())
                    .referrerPolicy(
                        referrerPolicy -> referrerPolicy.policy(ReferrerPolicy.NO_REFERRER))
                    .contentSecurityPolicy(
                        contentSecurityPolicy ->
                            contentSecurityPolicy.policyDirectives(
                                "default-src 'none'; base-uri 'none'; frame-ancestors 'none'"))
                    .addHeaderWriter(
                        new StaticHeadersWriter(
                            "Permissions-Policy",
                            "camera=(), microphone=(), geolocation=(), payment=(), usb=()"))
                    .httpStrictTransportSecurity(
                        hsts ->
                            hsts.requestMatcher(AnyRequestMatcher.INSTANCE)
                                .includeSubDomains(false)
                                .maxAgeInSeconds(31536000))
                    .cacheControl(Customizer.withDefaults()))
        .authorizeHttpRequests(
            authorization ->
                authorization
                    .requestMatchers(HttpMethod.OPTIONS, "/api/**")
                    .permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/v1/auth/csrf")
                    .permitAll()
                    .requestMatchers(HttpMethod.POST, "/api/v1/auth/sessions")
                    .permitAll()
                    .requestMatchers(HttpMethod.POST, "/api/v1/auth/sessions/refresh")
                    .permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/v1/administration/users/**")
                    .hasAuthority("PERMISSION:USUARIOS.LER")
                    .requestMatchers(HttpMethod.POST, "/api/v1/administration/users")
                    .hasAuthority("PERMISSION:USUARIOS.CRIAR")
                    .requestMatchers(HttpMethod.PATCH, "/api/v1/administration/users/**")
                    .hasAuthority("PERMISSION:USUARIOS.ALTERAR")
                    .requestMatchers(
                        HttpMethod.PUT, "/api/v1/administration/users/*/password-reset")
                    .hasAuthority("PERMISSION:USUARIOS.ALTERAR")
                    .requestMatchers(HttpMethod.PUT, "/api/v1/administration/users/*/access-grants")
                    .hasAnyAuthority("PERMISSION:ACESSOS.GERIR", "PERMISSION:ACESSOS.NEGOCIO.GERIR")
                    .requestMatchers("/api/v1/administration/access-grants/**")
                    .hasAnyAuthority("PERMISSION:ACESSOS.GERIR", "PERMISSION:ACESSOS.NEGOCIO.GERIR")
                    .requestMatchers(
                        HttpMethod.GET,
                        "/api/v1/master-data/branches",
                        "/api/v1/master-data/areas",
                        "/api/v1/master-data/collaborators",
                        "/api/v1/master-data/allocations/active",
                        "/api/v1/master-data/questionnaire-assignment-options",
                        "/api/v1/master-data/questionnaire-assignments/active")
                    .hasAuthority("PERMISSION:CADASTROS.GERIR")
                    .requestMatchers(
                        HttpMethod.GET, "/api/v1/administration/manager-assignments/active")
                    .hasAuthority("PERMISSION:VINCULOS_GESTOR_COLABORADOR.GERIR")
                    .requestMatchers(
                        HttpMethod.GET, "/api/v1/administration/manager-assignments/options")
                    .hasAuthority("PERMISSION:VINCULOS_GESTOR_COLABORADOR.GERIR")
                    .requestMatchers(
                        HttpMethod.GET,
                        "/api/v1/administration/director-manager-assignments/active",
                        "/api/v1/administration/director-manager-assignments/options")
                    .hasAuthority("PERMISSION:VINCULOS_DIRETORIA_GERENCIA.GERIR")
                    .requestMatchers(
                        HttpMethod.GET, "/api/v1/master-data/user-collaborator-links/active")
                    .hasAuthority("PERMISSION:VINCULOS_USUARIO_COLABORADOR.GERIR")
                    .requestMatchers(
                        HttpMethod.GET, "/api/v1/master-data/user-collaborator-links/options")
                    .hasAuthority("PERMISSION:VINCULOS_USUARIO_COLABORADOR.GERIR")
                    .requestMatchers(HttpMethod.GET, "/api/v1/questionnaire-versions/approved")
                    .hasAnyAuthority("PERMISSION:QUESTIONARIOS.GERIR", "PERMISSION:CICLOS.GERIR")
                    .requestMatchers(
                        HttpMethod.GET, "/api/v1/evaluation-cycles/*/administration-draft")
                    .hasAuthority("PERMISSION:CICLOS.GERIR")
                    .requestMatchers(
                        "/api/v1/master-data/**",
                        "/api/v1/administration/manager-assignments/**",
                        "/api/v1/administration/director-manager-assignments/**")
                    .hasAnyAuthority(
                        "PERMISSION:CADASTROS.GERIR",
                        "PERMISSION:VINCULOS_GESTOR_COLABORADOR.GERIR",
                        "PERMISSION:VINCULOS_USUARIO_COLABORADOR.GERIR",
                        "PERMISSION:VINCULOS_DIRETORIA_GERENCIA.GERIR")
                    .requestMatchers("/api/v1/questionnaire-versions/**")
                    .hasAuthority("PERMISSION:QUESTIONARIOS.GERIR")
                    .requestMatchers("/api/v1/evaluation-cycles/**")
                    .hasAnyAuthority(
                        "PERMISSION:CICLOS.GERIR",
                        "PERMISSION:AVALIACOES.AVALIAR_VINCULADOS",
                        "PERMISSION:AVALIACOES.AVALIAR_GERENCIAS_VINCULADAS",
                        "PERMISSION:AUTOAVALIACOES.PREENCHER_PROPRIA",
                        "PERMISSION:INDICADORES.VISUALIZAR")
                    .requestMatchers("/api/v1/assessments/**")
                    .hasAnyAuthority(
                        "PERMISSION:AVALIACOES.AVALIAR_VINCULADOS",
                        "PERMISSION:AVALIACOES.AVALIAR_GERENCIAS_VINCULADAS",
                        "PERMISSION:AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS",
                        "PERMISSION:AVALIACOES.VISUALIZAR_TODAS",
                        "PERMISSION:AVALIACOES.PUBLICAR",
                        "PERMISSION:AVALIACOES.REABRIR",
                        "PERMISSION:AVALIACOES.REGISTRAR_FEEDBACK_PROPRIO",
                        "PERMISSION:AUTOAVALIACOES.PREENCHER_PROPRIA",
                        "PERMISSION:AUTOAVALIACOES.ENVIAR_PROPRIA",
                        "PERMISSION:AUTOAVALIACOES.VISUALIZAR_PROPRIA")
                    .requestMatchers("/api/v1/indicators/**")
                    .hasAnyAuthority(
                        "PERMISSION:INDICADORES.VISUALIZAR", "PERMISSION:DADOS.EXPORTAR")
                    .requestMatchers(
                        "/api/v1/auth/me", "/api/v1/auth/password", "/api/v1/auth/sessions/current")
                    .authenticated()
                    .anyRequest()
                    .denyAll())
        .addFilterBefore(requestCorrelationFilter, SecurityContextHolderFilter.class);

    AccessTokenAuthenticationFilter filter = accessTokenAuthenticationFilter.getIfAvailable();
    if (filter != null) {
      http.addFilterAfter(filter, SecurityContextHolderFilter.class);
    }

    return http.build();
  }

  @Bean
  CorsConfigurationSource corsConfigurationSource(CorsSecurityProperties properties) {
    if (properties.allowedOrigins().isEmpty()
        || properties.allowedOrigins().stream().anyMatch("*"::equals)) {
      throw new IllegalStateException(
          "app.security.cors.allowed-origins deve conter origens explícitas e não coringas.");
    }

    CorsConfiguration configuration = new CorsConfiguration();
    configuration.setAllowedOrigins(properties.allowedOrigins());
    configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
    configuration.setAllowedHeaders(
        List.of("Content-Type", "X-CSRF-TOKEN", "X-Request-Id", "Idempotency-Key", "If-Match"));
    configuration.setExposedHeaders(List.of(RequestCorrelationFilter.REQUEST_ID_HEADER, "ETag"));
    configuration.setAllowCredentials(true);
    configuration.setMaxAge(Duration.ofMinutes(10));

    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/api/**", configuration);
    return source;
  }

  @Bean
  CookieCsrfTokenRepository csrfTokenRepository() {
    CookieCsrfTokenRepository repository = CookieCsrfTokenRepository.withHttpOnlyFalse();
    repository.setCookieName("ADC-XSRF-TOKEN");
    repository.setHeaderName("X-CSRF-TOKEN");
    repository.setCookieCustomizer(cookie -> cookie.path("/").secure(true).sameSite("Strict"));
    return repository;
  }

  @Bean
  RequestCorrelationFilter requestCorrelationFilter() {
    return new RequestCorrelationFilter();
  }

  @Bean
  SecurityProblemWriter securityProblemWriter(ObjectMapper objectMapper) {
    return new SecurityProblemWriter(objectMapper);
  }

  @Bean
  PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder(12);
  }

  @Bean
  Clock clock() {
    return Clock.systemUTC();
  }

  @Bean
  @ConditionalOnSqlServerPersistence
  @ConditionalOnProperty(
      prefix = "app.security.authentication",
      name = "enabled",
      havingValue = "true")
  LoginRateLimiter loginRateLimiter(Clock clock, AuthenticationSecurityProperties properties) {
    properties.validateWhenEnabled();
    return new LoginRateLimiter(clock, properties.loginMaximumAttempts(), properties.loginWindow());
  }

  @Bean
  UserDetailsService noUserDetailsService() {
    return username -> {
      throw new UsernameNotFoundException("Autenticação local ainda não foi configurada.");
    };
  }

  private static void writeDeniedAudit(
      jakarta.servlet.http.HttpServletRequest request, IdentityAccessRepository repository) {
    if (repository == null) {
      return;
    }
    Object principal =
        org.springframework.security.core.context.SecurityContextHolder.getContext()
                    .getAuthentication()
                == null
            ? null
            : org.springframework.security.core.context.SecurityContextHolder.getContext()
                .getAuthentication()
                .getPrincipal();
    if (!(principal instanceof AuthenticatedPrincipal authenticatedPrincipal)) {
      return;
    }
    try {
      repository.writeAudit(
          new AuditEvent(
              authenticatedPrincipal.userId(),
              "AUTORIZACAO.NEGAR",
              "HTTP",
              null,
              AuditEvent.AuditResult.DENIED,
              RequestCorrelationFilter.getRequestId(request),
              null));
    } catch (RuntimeException ignored) {
      // Auditoria não pode alterar a resposta de autorização nem expor detalhes de infraestrutura.
    }
  }
}
