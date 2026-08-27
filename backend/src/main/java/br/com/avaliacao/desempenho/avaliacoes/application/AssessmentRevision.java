package br.com.avaliacao.desempenho.avaliacoes.application;

import java.util.Arrays;
import java.util.Base64;
import java.util.Objects;

/** Codifica o {@code rowversion} SQL Server como uma revisão opaca de avaliação. */
public final class AssessmentRevision {

  private static final int SQL_SERVER_ROW_VERSION_LENGTH = 8;

  private AssessmentRevision() {}

  public static String encode(byte[] rowVersion) {
    byte[] safeRowVersion = validateRowVersion(rowVersion);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(safeRowVersion);
  }

  public static byte[] decodeIfMatch(String ifMatch) {
    if (ifMatch == null || ifMatch.isBlank()) {
      throw new AssessmentValidationException("If-Match é obrigatório para alterar um rascunho.");
    }

    String normalized = ifMatch.strip();
    if (normalized.startsWith("W/") || normalized.startsWith("w/")) {
      throw new AssessmentValidationException("If-Match deve conter uma revisão forte.");
    }
    if (normalized.length() >= 2 && normalized.startsWith("\"") && normalized.endsWith("\"")) {
      normalized = normalized.substring(1, normalized.length() - 1);
    }

    try {
      return validateRowVersion(Base64.getUrlDecoder().decode(normalized));
    } catch (IllegalArgumentException exception) {
      throw new AssessmentValidationException("If-Match não contém uma revisão válida.");
    }
  }

  public static boolean matches(String ifMatch, byte[] rowVersion) {
    return Arrays.equals(decodeIfMatch(ifMatch), validateRowVersion(rowVersion));
  }

  private static byte[] validateRowVersion(byte[] rowVersion) {
    Objects.requireNonNull(rowVersion, "rowVersion não pode ser nulo");
    if (rowVersion.length != SQL_SERVER_ROW_VERSION_LENGTH) {
      throw new AssessmentValidationException("A revisão persistida é inválida.");
    }
    return Arrays.copyOf(rowVersion, rowVersion.length);
  }
}
