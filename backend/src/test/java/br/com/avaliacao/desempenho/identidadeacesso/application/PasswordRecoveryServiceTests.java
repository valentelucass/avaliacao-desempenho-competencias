package br.com.avaliacao.desempenho.identidadeacesso.application;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import br.com.avaliacao.desempenho.identidadeacesso.domain.model.LocalPasswordPolicy;
import java.time.Clock;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionTemplate;

class PasswordRecoveryServiceTests {
  final PasswordRecoveryRepository repository = mock(PasswordRecoveryRepository.class);
  final UserAdministrationRepository users = mock(UserAdministrationRepository.class);
  final UserAdministrationService administration = mock(UserAdministrationService.class);
  final TransactionTemplate transaction = mock(TransactionTemplate.class);
  final PasswordRecoveryService service =
      new PasswordRecoveryService(
          repository, users, administration, transaction, Clock.systemUTC());
  final UUID actor = UUID.randomUUID();
  final Set<String> permissions = Set.of("SENHAS.REDEFINIR");

  @Test
  void deniesAnAccountWithoutSupremeOrIndividualDelegation() {
    assertThatThrownBy(() -> service.list(actor, Set.of(), 0, 100))
        .isInstanceOf(UserAdministrationException.class);
    assertThatThrownBy(
            () -> service.generate(UUID.randomUUID(), actor, Set.of("USUARIOS.LER"), "test"))
        .isInstanceOf(UserAdministrationException.class);
    verifyNoInteractions(repository, administration);
  }

  @Test
  void generatesIndependentStrongTemporaryCredentialsThroughTheExistingRevocationFlow() {
    when(users.isSupremeAdministrator(actor)).thenReturn(true);
    UUID target = UUID.randomUUID();
    var first = service.generate(target, actor, permissions, "test");
    var second = service.generate(target, actor, permissions, "test");
    assertThat(first.temporaryPassword()).hasSize(32).isNotEqualTo(second.temporaryPassword());
    assertThat(LocalPasswordPolicy.accepts(first.temporaryPassword())).isTrue();
    assertThat(first.toString()).doesNotContain(first.temporaryPassword());
    verify(administration)
        .resetOrdinaryUserPassword(target, first.temporaryPassword(), actor, permissions, "test");
  }

  @Test
  void enforcesLimitsByLoginIndependentlyOfAddressAndByAddressIndependentlyOfLogin() {
    for (int n = 0; n < 3; n++) service.request("pessoa@example.invalid", "address-" + n, "test");
    assertThatThrownBy(() -> service.request(" PESSOA@example.invalid ", "address-new", "test"))
        .isInstanceOf(
            br.com.avaliacao.desempenho.identidadeacesso.application.RateLimitedException.class);
    for (int n = 0; n < 10; n++) service.request("fictional-" + n, "same-address", "test");
    assertThatThrownBy(() -> service.request("other", "same-address", "test"))
        .isInstanceOf(
            br.com.avaliacao.desempenho.identidadeacesso.application.RateLimitedException.class);
  }

  @Test
  void rejectsBcryptOverflowAndAcceptsUnicodeWithinItsByteLimit() {
    assertThat(LocalPasswordPolicy.accepts("a".repeat(72))).isTrue();
    assertThat(LocalPasswordPolicy.accepts("a".repeat(73))).isFalse();
    assertThat(LocalPasswordPolicy.accepts("á".repeat(36))).isTrue();
    assertThat(LocalPasswordPolicy.accepts("á".repeat(37))).isFalse();
    assertThat(LocalPasswordPolicy.accepts("curta")).isFalse();
  }
}
