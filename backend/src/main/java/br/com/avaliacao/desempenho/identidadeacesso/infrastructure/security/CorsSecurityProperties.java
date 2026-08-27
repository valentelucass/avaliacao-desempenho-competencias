package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Origens CORS autorizadas para a API. Não aceita origem curinga com credenciais. */
@ConfigurationProperties(prefix = "app.security.cors")
public record CorsSecurityProperties(List<String> allowedOrigins) {

  public CorsSecurityProperties {
    allowedOrigins = allowedOrigins == null ? List.of() : List.copyOf(allowedOrigins);
  }
}
