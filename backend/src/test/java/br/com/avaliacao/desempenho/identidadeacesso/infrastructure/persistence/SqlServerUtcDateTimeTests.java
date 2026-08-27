package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.sql.ResultSet;
import java.time.Instant;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;

class SqlServerUtcDateTimeTests {

  @Test
  void bindsAnInstantAsItsUtcLocalDateTimeForSqlServerDatetime2() {
    assertThat(SqlServerUtcDateTime.forBinding(Instant.parse("2026-09-01T03:00:00Z")))
        .isEqualTo(LocalDateTime.of(2026, 9, 1, 3, 0));
  }

  @Test
  void readsSqlServerDatetime2AsAnUtcInstant() throws Exception {
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getObject("janela_abertura_em_utc", LocalDateTime.class))
        .thenReturn(LocalDateTime.of(2026, 9, 1, 3, 0));

    assertThat(SqlServerUtcDateTime.read(resultSet, "janela_abertura_em_utc"))
        .isEqualTo(Instant.parse("2026-09-01T03:00:00Z"));
  }

  @Test
  void preservesNullSqlServerDatetime2Values() throws Exception {
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getObject("revogada_em_utc", LocalDateTime.class)).thenReturn(null);

    assertThat(SqlServerUtcDateTime.read(resultSet, "revogada_em_utc")).isNull();
  }
}
