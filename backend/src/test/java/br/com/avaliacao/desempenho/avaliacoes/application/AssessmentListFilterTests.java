package br.com.avaliacao.desempenho.avaliacoes.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAccessContext;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentStatus;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.FeedbackStatus;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AssessmentListFilterTests {
  @Test
  void normalizesNamesWithoutTreatingSqlCharactersAsWildcards() {
    var filter =
        new AssessmentRepository.AssessmentListFilter(
            null,
            null,
            "  Ana %_[]'  ",
            " João ",
            AssessmentStatus.PUBLICADA,
            FeedbackStatus.CONCLUIDO);
    assertThat(filter.evaluatedName()).isEqualTo("Ana %_[]'");
    assertThat(filter.managerName()).isEqualTo("João");
    assertThat(
            new AssessmentRepository.AssessmentListFilter(null, null, "   ", null, null, null)
                .evaluatedName())
        .isNull();
    assertThat(AssessmentRepository.AssessmentListFilter.none().status()).isNull();
  }

  @Test
  void rejectsOversizedNamesAndControlCharactersBeforePersistence() {
    for (String value : List.of("a".repeat(161), "Ana\nSilva", "Ana\u0000")) {
      assertThatThrownBy(
              () ->
                  new AssessmentRepository.AssessmentListFilter(
                      null, null, value, null, null, null))
          .isInstanceOf(AssessmentValidationException.class);
      assertThatThrownBy(
              () ->
                  new AssessmentRepository.AssessmentListFilter(
                      null, null, null, value, null, null))
          .isInstanceOf(AssessmentValidationException.class);
    }
    assertThat(
            new AssessmentRepository.AssessmentListFilter(
                    null, null, "a".repeat(160), null, null, null)
                .evaluatedName())
        .hasSize(160);
  }

  @Test
  void forwardsAllFiltersAndTheOriginalActorWithoutGrantingPermissions() {
    var repository = mock(AssessmentRepository.class);
    var actor =
        new AssessmentAccessContext(
            UUID.randomUUID(), Set.of("AVALIACOES.VISUALIZAR_PROPRIAS_RESPOSTAS"));
    var filter =
        new AssessmentRepository.AssessmentListFilter(
            UUID.randomUUID(),
            UUID.randomUUID(),
            "Ana",
            "João",
            AssessmentStatus.PUBLICADA,
            FeedbackStatus.PENDENTE);
    var page = new AssessmentRepository.AssessmentPageView(List.of(), null);
    when(repository.listAccessible(actor, filter, 12, null)).thenReturn(page);
    assertThat(new AssessmentApplicationService(repository).list(actor, filter, 12, null))
        .isSameAs(page);
    verify(repository).listAccessible(actor, filter, 12, null);
    assertThat(actor.has("AVALIACOES.VISUALIZAR_TODAS")).isFalse();
  }
}
