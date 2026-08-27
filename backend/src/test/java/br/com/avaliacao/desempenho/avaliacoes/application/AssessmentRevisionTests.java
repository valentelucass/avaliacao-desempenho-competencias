package br.com.avaliacao.desempenho.avaliacoes.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class AssessmentRevisionTests {

  @Test
  void roundTripsTheSqlServerRowVersionAsAStrongQuotedEtag() {
    byte[] rowVersion = new byte[] {0, 0, 0, 0, 0, 0, 0, 7};

    String encoded = AssessmentRevision.encode(rowVersion);

    assertThat(AssessmentRevision.decodeIfMatch("\"" + encoded + "\"")).isEqualTo(rowVersion);
    assertThat(AssessmentRevision.matches(encoded, rowVersion)).isTrue();
  }

  @Test
  void refusesWeakOrInvalidRevisionsInsteadOfIgnoringConcurrency() {
    assertThatThrownBy(() -> AssessmentRevision.decodeIfMatch("W/\"AAAAAAAAAAE\""))
        .isInstanceOf(AssessmentValidationException.class);
    assertThatThrownBy(() -> AssessmentRevision.decodeIfMatch("not-a-rowversion"))
        .isInstanceOf(AssessmentValidationException.class);
  }
}
