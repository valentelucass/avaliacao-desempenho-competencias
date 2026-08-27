package br.com.avaliacao.desempenho.cadastros.domain.model;

import br.com.avaliacao.desempenho.cadastros.application.MasterDataException;
import java.time.LocalDate;
import java.util.UUID;

/** Normaliza entradas de cadastro antes de qualquer chamada à persistência. */
public final class MasterDataInput {

  private MasterDataInput() {}

  public static String requiredText(String value, String fieldName, int maximumLength) {
    if (value == null) {
      throw invalid(fieldName);
    }
    String normalized = value.strip();
    if (normalized.isEmpty() || normalized.length() > maximumLength) {
      throw invalid(fieldName);
    }
    return normalized;
  }

  public static String optionalText(String value, String fieldName, int maximumLength) {
    if (value == null) {
      return null;
    }
    return requiredText(value, fieldName, maximumLength);
  }

  public static UUID requiredId(UUID value, String fieldName) {
    if (value == null) {
      throw invalid(fieldName);
    }
    return value;
  }

  public static LocalDate requiredDate(LocalDate value, String fieldName) {
    if (value == null) {
      throw invalid(fieldName);
    }
    return value;
  }

  private static MasterDataException invalid(String fieldName) {
    return new MasterDataException(
        MasterDataException.Reason.INVALID_INPUT, "Campo de cadastro inválido: " + fieldName + '.');
  }
}
