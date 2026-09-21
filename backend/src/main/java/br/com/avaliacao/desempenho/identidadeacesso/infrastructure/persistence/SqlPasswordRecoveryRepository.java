package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence;

import br.com.avaliacao.desempenho.identidadeacesso.application.PasswordRecoveryRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@ConditionalOnSqlServerPersistence
public class SqlPasswordRecoveryRepository implements PasswordRecoveryRepository {
  private final JdbcTemplate jdbc;

  public SqlPasswordRecoveryRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  // A sequência da auditoria evita ambiguidades de eventos ocorridos no mesmo milissegundo.
  private static final String LAST_RECOVERY_EVENT =
      """
      SELECT TOP (1) evento_auditoria_id, ocorrido_em_utc, acao
      FROM dbo.evento_auditoria
      WHERE tipo_recurso = 'USUARIO' AND recurso_id = usuario.usuario_id
        AND resultado = 'SUCESSO'
        AND acao IN ('AUTENTICACAO.REDEFINICAO_SOLICITAR', 'USUARIO.SENHA_REDEFINIR',
                     'AUTENTICACAO.ALTERAR_SENHA')
      ORDER BY evento_auditoria_id DESC
      """;

  @Override
  public void request(String normalizedLogin, String requestId) {
    List<UUID> eligible =
        jdbc.query(
            """
        SELECT usuario.usuario_id FROM dbo.usuario usuario WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.credencial_local credencial WITH (UPDLOCK, HOLDLOCK)
          ON credencial.usuario_id = usuario.usuario_id
        WHERE usuario.login_normalizado = ? AND
        """
                + PasswordResetSqlEligibility.TARGET,
            (rs, row) -> rs.getObject(1, UUID.class),
            normalizedLogin);
    if (eligible.isEmpty()) return;
    jdbc.update(
        """
        INSERT INTO dbo.evento_auditoria
            (ator_usuario_id, acao, tipo_recurso, recurso_id, resultado, request_id)
        SELECT NULL, 'AUTENTICACAO.REDEFINICAO_SOLICITAR', 'USUARIO', usuario.usuario_id, 'SUCESSO', ?
        FROM dbo.usuario AS usuario
        OUTER APPLY (
        """
            + LAST_RECOVERY_EVENT
            + """
        ) AS ultimo
        WHERE usuario.usuario_id = ?
          AND (ultimo.acao IS NULL OR ultimo.acao <> 'AUTENTICACAO.REDEFINICAO_SOLICITAR')
        """,
        requestId,
        eligible.getFirst());
  }

  @Override
  public List<PendingRequest> listPending(UUID actor, boolean supreme, long after, int limit) {
    return jdbc.query(
        """
        SELECT TOP (?) usuario.usuario_id, usuario.nome_exibicao, usuario.login_normalizado,
            ultimo.evento_auditoria_id, ultimo.ocorrido_em_utc
        FROM dbo.usuario AS usuario
        JOIN dbo.credencial_local credencial ON credencial.usuario_id = usuario.usuario_id
        CROSS APPLY (
        """
            + LAST_RECOVERY_EVENT
            + """
        ) AS ultimo
        WHERE
        """
            + PasswordResetSqlEligibility.TARGET
            + PasswordResetSqlEligibility.OPERATOR_SCOPE
            + """
          AND ultimo.acao = 'AUTENTICACAO.REDEFINICAO_SOLICITAR'
          AND ultimo.evento_auditoria_id > ?
        ORDER BY ultimo.evento_auditoria_id
        """,
        (rs, row) ->
            new PendingRequest(
                rs.getLong("evento_auditoria_id"),
                rs.getObject("usuario_id", UUID.class),
                rs.getString("nome_exibicao"),
                rs.getString("login_normalizado"),
                SqlServerUtcDateTime.read(rs, "ocorrido_em_utc")),
        limit,
        actor,
        supreme ? 1 : 0,
        after);
  }
}
