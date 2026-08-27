package br.com.avaliacao.desempenho.identidadeacesso.domain.model;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class LoginNormalizerTests {

  @Test
  void normalizesWhitespaceCaseAndUnicodeCompatibilityForms() {
    assertThat(LoginNormalizer.normalize("  GESTOR\uFF11  ")).isEqualTo("gestor1");
  }

  @Test
  void returnsEmptyTextForAbsentLoginWithoutThrowing() {
    assertThat(LoginNormalizer.normalize(null)).isEmpty();
  }
}
