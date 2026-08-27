package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Objects;

/** Converts instants to and from SQL Server {@code datetime2} values stored in UTC. */
public final class SqlServerUtcDateTime {

  private SqlServerUtcDateTime() {}

  /** Returns the UTC local date-time representation expected by SQL Server {@code datetime2}. */
  public static LocalDateTime forBinding(Instant instant) {
    return LocalDateTime.ofInstant(
        Objects.requireNonNull(instant, "instant não pode ser nulo"), ZoneOffset.UTC);
  }

  /** Reads a SQL Server {@code datetime2} column as a UTC instant, preserving nulls. */
  public static Instant read(ResultSet resultSet, String column) throws SQLException {
    LocalDateTime value = resultSet.getObject(column, LocalDateTime.class);
    return value == null ? null : value.toInstant(ZoneOffset.UTC);
  }
}
