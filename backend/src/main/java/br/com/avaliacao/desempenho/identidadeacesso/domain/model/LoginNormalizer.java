package br.com.avaliacao.desempenho.identidadeacesso.domain.model;

import java.text.Normalizer;
import java.util.Locale;

/** Normaliza o identificador de login sem alterar a senha. */
public final class LoginNormalizer {

  private LoginNormalizer() {}

  public static String normalize(String login) {
    if (login == null) {
      return "";
    }
    return Normalizer.normalize(login.strip(), Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
  }
}
