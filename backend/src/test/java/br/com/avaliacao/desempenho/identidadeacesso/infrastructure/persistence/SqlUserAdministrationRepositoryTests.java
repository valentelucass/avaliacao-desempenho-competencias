package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import br.com.avaliacao.desempenho.identidadeacesso.application.UserAdministrationRepository.UpdateUser;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AccountStatus;
import java.sql.ResultSet;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

class SqlUserAdministrationRepositoryTests {

  @Test
  void normalAdministrativeUpdateExcludesEverySupremeAdministrator() {
    JdbcTemplate jdbcTemplate = org.mockito.Mockito.mock(JdbcTemplate.class);
    when(jdbcTemplate.update(anyString(), any(), any(), any())).thenReturn(0);
    SqlUserAdministrationRepository repository = new SqlUserAdministrationRepository(jdbcTemplate);

    assertThat(
            repository.updateUser(
                UUID.randomUUID(),
                new UpdateUser("Nome alterado", AccountStatus.DISABLED),
                UUID.randomUUID()))
        .isEmpty();

    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate).update(sql.capture(), any(), any(), any());
    assertThat(sql.getValue()).contains("administrador_supremo = 0");
    assertThat(sql.getValue()).contains("excluido_logicamente = 0");
  }

  @Test
  void logicalDeletionExcludesEveryProtectedOrSupremeAdministrator() {
    JdbcTemplate jdbcTemplate = org.mockito.Mockito.mock(JdbcTemplate.class);
    SqlUserAdministrationRepository repository = new SqlUserAdministrationRepository(jdbcTemplate);

    assertThat(repository.logicallyDeleteUser(UUID.randomUUID(), UUID.randomUUID())).isEmpty();

    String sql =
        org.mockito.Mockito.mockingDetails(jdbcTemplate).getInvocations().stream()
            .filter(invocation -> invocation.getMethod().getName().equals("update"))
            .findFirst()
            .orElseThrow()
            .getArgument(0);
    assertThat(sql)
        .contains("administrador_supremo = 0")
        .contains("protegido_fluxo_normal = 0")
        .contains("excluido_logicamente = 0");
  }

  @Test
  void passwordResetExcludesProtectedSupremeInactiveOrLogicallyDeletedAccounts() {
    JdbcTemplate jdbcTemplate = org.mockito.Mockito.mock(JdbcTemplate.class);
    when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(0);
    SqlUserAdministrationRepository repository = new SqlUserAdministrationRepository(jdbcTemplate);

    assertThat(
            repository.resetOrdinaryUserPassword(
                UUID.randomUUID(), "hash", "BCRYPT", "strength=12"))
        .isEmpty();

    String sql =
        org.mockito.Mockito.mockingDetails(jdbcTemplate).getInvocations().stream()
            .filter(invocation -> invocation.getMethod().getName().equals("update"))
            .findFirst()
            .orElseThrow()
            .getArgument(0);
    assertThat(sql)
        .contains("senha_deve_ser_trocada = 1")
        .contains("usuario.situacao = 'ATIVO'")
        .contains("usuario.administrador_supremo = 0")
        .contains("usuario.protegido_fluxo_normal = 0")
        .contains("usuario.excluido_logicamente = 0");
  }

  @Test
  void readsUserUpdateDatetime2AsUtc() throws Exception {
    ResultSet resultSet = org.mockito.Mockito.mock(ResultSet.class);
    when(resultSet.getObject("usuario_id", UUID.class)).thenReturn(UUID.randomUUID());
    when(resultSet.getString("login_normalizado")).thenReturn("usuario@example.test");
    when(resultSet.getString("nome_exibicao")).thenReturn("Usuário");
    when(resultSet.getString("situacao")).thenReturn("ATIVO");
    when(resultSet.getBoolean("senha_deve_ser_trocada")).thenReturn(false);
    when(resultSet.getObject("atualizado_em_utc", LocalDateTime.class))
        .thenReturn(LocalDateTime.of(2026, 8, 26, 14, 30));

    assertThat(SqlUserAdministrationRepository.baseUser(resultSet).updatedAt())
        .isEqualTo(Instant.parse("2026-08-26T14:30:00Z"));

    verify(resultSet).getObject("atualizado_em_utc", LocalDateTime.class);
    verify(resultSet, org.mockito.Mockito.never()).getTimestamp("atualizado_em_utc");
  }
}
