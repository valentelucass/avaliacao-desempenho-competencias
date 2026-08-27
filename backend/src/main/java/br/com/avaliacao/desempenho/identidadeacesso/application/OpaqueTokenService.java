package br.com.avaliacao.desempenho.identidadeacesso.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;

/** Gera tokens opacos de renovação e seus hashes SHA-256 persistíveis. */
public final class OpaqueTokenService {

  private static final SecureRandom RANDOM = new SecureRandom();

  public String generate() {
    byte[] bytes = new byte[48];
    RANDOM.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  public String sha256(String value) {
    try {
      byte[] hash =
          MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
      StringBuilder encoded = new StringBuilder(hash.length * 2);
      for (byte element : hash) {
        encoded.append(String.format("%02x", element));
      }
      return encoded.toString();
    } catch (NoSuchAlgorithmException exception) {
      throw new IllegalStateException("SHA-256 is required by the Java runtime.", exception);
    }
  }
}
