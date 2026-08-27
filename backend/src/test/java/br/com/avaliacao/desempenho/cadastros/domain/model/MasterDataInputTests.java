package br.com.avaliacao.desempenho.cadastros.domain.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import br.com.avaliacao.desempenho.cadastros.application.MasterDataException;
import org.junit.jupiter.api.Test;

class MasterDataInputTests {

  @Test
  void normalizesRequiredTextWithoutAcceptingBlankValues() {
    assertThat(MasterDataInput.requiredText("  Filial Norte  ", "nome", 200))
        .isEqualTo("Filial Norte");

    assertThatThrownBy(() -> MasterDataInput.requiredText("   ", "nome", 200))
        .isInstanceOf(MasterDataException.class)
        .extracting(exception -> ((MasterDataException) exception).reason())
        .isEqualTo(MasterDataException.Reason.INVALID_INPUT);
  }

  @Test
  void keepsAnOptionalTextAbsentButRejectsWhitespaceOnlyInput() {
    assertThat(MasterDataInput.optionalText(null, "gestorTexto", 200)).isNull();

    assertThatThrownBy(() -> MasterDataInput.optionalText(" ", "gestorTexto", 200))
        .isInstanceOf(MasterDataException.class)
        .extracting(exception -> ((MasterDataException) exception).reason())
        .isEqualTo(MasterDataException.Reason.INVALID_INPUT);
  }
}
