package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence;

import br.com.avaliacao.desempenho.identidadeacesso.application.IdentityAccessRepository;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AccountStatus;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuditEvent;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthenticationSession;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthorizedUser;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.EffectivePermissionPolicy;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.LocalCredentialAccount;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.PermissionEffect;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Implementação JDBC parametrizada para o schema SQL Server de identidade e acesso. */
@Repository
@ConditionalOnSqlServerPersistence
public class SqlIdentityAccessRepository implements IdentityAccessRepository {

  private static final String LOCAL_CREDENTIAL_SELECT =
      """
      SELECT u.usuario_id, u.nome_exibicao, u.situacao, c.senha_hash,
             c.senha_deve_ser_trocada, c.tentativas_falhas, c.bloqueada_ate_utc
      FROM dbo.usuario AS u
      INNER JOIN dbo.credencial_local AS c ON c.usuario_id = u.usuario_id
      WHERE u.login_normalizado = ?
      """;

  private final JdbcTemplate jdbcTemplate;

  public SqlIdentityAccessRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  @Override
  public Optional<LocalCredentialAccount> findLocalCredentialByNormalizedLogin(
      String normalizedLogin) {
    return jdbcTemplate.query(
        LOCAL_CREDENTIAL_SELECT,
        resultSet -> resultSet.next() ? Optional.of(mapCredential(resultSet)) : Optional.empty(),
        normalizedLogin);
  }

  @Override
  public Optional<LocalCredentialAccount> findLocalCredentialByUserId(UUID userId) {
    return jdbcTemplate.query(
        LOCAL_CREDENTIAL_SELECT.replace("u.login_normalizado = ?", "u.usuario_id = ?"),
        resultSet -> resultSet.next() ? Optional.of(mapCredential(resultSet)) : Optional.empty(),
        userId);
  }

  @Override
  public Optional<AuthorizedUser> findAuthorizedUserForActiveSession(
      UUID sessionId, UUID userId, String accessTokenId, Instant now) {
    Optional<AuthorizedUser> user =
        jdbcTemplate.query(
            """
            SELECT u.usuario_id, u.nome_exibicao, u.administrador_supremo, c.senha_deve_ser_trocada
            FROM dbo.sessao_autenticacao AS s
            INNER JOIN dbo.usuario AS u ON u.usuario_id = s.usuario_id
            INNER JOIN dbo.credencial_local AS c ON c.usuario_id = u.usuario_id
            WHERE s.sessao_id = ?
              AND s.usuario_id = ?
              AND s.jti_acesso = ?
              AND s.revogada_em_utc IS NULL
              AND s.expira_em_utc > ?
              AND u.situacao = 'ATIVO'
            """,
            resultSet -> {
              if (!resultSet.next()) {
                return Optional.empty();
              }
              UUID resolvedUserId = resultSet.getObject("usuario_id", UUID.class);
              return Optional.of(
                  new AuthorizedUser(
                      resolvedUserId,
                      resultSet.getString("nome_exibicao"),
                      resultSet.getBoolean("senha_deve_ser_trocada"),
                      resultSet.getBoolean("administrador_supremo"),
                      effectivePermissions(resolvedUserId),
                      effectiveRoleCodes(resolvedUserId)));
            },
            sessionId,
            userId,
            accessTokenId,
            timestamp(now));
    return user;
  }

  @Override
  public void registerFailedLogin(
      UUID userId, Instant now, int failureThreshold, Instant blockUntilWhenThresholdReached) {
    jdbcTemplate.update(
        """
        UPDATE dbo.credencial_local
        SET tentativas_falhas = CASE
                WHEN tentativas_falhas + 1 >= ? THEN 0
                ELSE tentativas_falhas + 1
            END,
            bloqueada_ate_utc = CASE
                WHEN tentativas_falhas + 1 >= ? THEN ?
                ELSE bloqueada_ate_utc
            END
        WHERE usuario_id = ?
          AND (bloqueada_ate_utc IS NULL OR bloqueada_ate_utc <= ?)
        """,
        failureThreshold,
        failureThreshold,
        timestamp(blockUntilWhenThresholdReached),
        userId,
        timestamp(now));
  }

  @Override
  public void registerSuccessfulLogin(UUID userId) {
    jdbcTemplate.update(
        """
        UPDATE dbo.credencial_local
        SET tentativas_falhas = 0,
            bloqueada_ate_utc = NULL
        WHERE usuario_id = ?
        """,
        userId);
  }

  @Override
  public void createSession(
      AuthenticationSession session, String refreshTokenHash, Instant refreshTokenExpiresAt) {
    jdbcTemplate.update(
        """
        INSERT INTO dbo.sessao_autenticacao (
            sessao_id, usuario_id, familia_id, jti_acesso, emitida_em_utc, expira_em_utc
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        session.sessionId(),
        session.userId(),
        session.familyId(),
        session.accessTokenId(),
        timestamp(session.issuedAt()),
        timestamp(session.expiresAt()));
    jdbcTemplate.update(
        """
        INSERT INTO dbo.token_renovacao (
            token_renovacao_id, sessao_id, token_hash, emitido_em_utc, expira_em_utc
        ) VALUES (?, ?, ?, ?, ?)
        """,
        UUID.randomUUID(),
        session.sessionId(),
        refreshTokenHash,
        timestamp(session.issuedAt()),
        timestamp(refreshTokenExpiresAt));
  }

  @Override
  public Optional<RefreshSession> rotateRefreshToken(
      String refreshTokenHash,
      String replacementRefreshTokenHash,
      String replacementAccessTokenId,
      Instant accessTokenExpiresAt,
      Instant replacementRefreshTokenExpiresAt,
      Instant now) {
    Optional<LockedRefreshToken> locked =
        jdbcTemplate.query(
            """
            SELECT t.token_renovacao_id, t.sessao_id, t.emitido_em_utc, t.expira_em_utc,
                   t.revogado_em_utc, s.usuario_id, s.familia_id, s.revogada_em_utc AS sessao_revogada_em_utc,
                   u.nome_exibicao, u.situacao, c.senha_deve_ser_trocada
            FROM dbo.token_renovacao AS t WITH (UPDLOCK, HOLDLOCK)
            INNER JOIN dbo.sessao_autenticacao AS s ON s.sessao_id = t.sessao_id
            INNER JOIN dbo.usuario AS u ON u.usuario_id = s.usuario_id
            INNER JOIN dbo.credencial_local AS c ON c.usuario_id = u.usuario_id
            WHERE t.token_hash = ?
            """,
            resultSet ->
                resultSet.next() ? Optional.of(mapLockedRefreshToken(resultSet)) : Optional.empty(),
            refreshTokenHash);
    if (locked.isEmpty()) {
      return Optional.empty();
    }

    LockedRefreshToken current = locked.get();
    if (current.revokedAt() != null
        || !current.expiresAt().isAfter(now)
        || !current.sessionActive()
        || !current.userActive()) {
      revokeFamily(current.familyId(), "RENOVACAO_INVALIDA");
      writeAudit(
          new AuditEvent(
              current.userId(),
              "AUTENTICACAO.RENOVAR",
              "SESSAO",
              current.sessionId(),
              AuditEvent.AuditResult.FAILURE,
              null,
              null));
      return Optional.empty();
    }

    UUID replacementId = UUID.randomUUID();
    jdbcTemplate.update(
        """
        INSERT INTO dbo.token_renovacao (
            token_renovacao_id, sessao_id, token_hash, emitido_em_utc, expira_em_utc
        ) VALUES (?, ?, ?, ?, ?)
        """,
        replacementId,
        current.sessionId(),
        replacementRefreshTokenHash,
        timestamp(now),
        timestamp(replacementRefreshTokenExpiresAt));

    int revoked =
        jdbcTemplate.update(
            """
            UPDATE dbo.token_renovacao
            SET revogado_em_utc = ?, substituido_por_token_renovacao_id = ?
            WHERE token_renovacao_id = ? AND revogado_em_utc IS NULL
            """,
            timestamp(now),
            replacementId,
            current.tokenId());
    if (revoked != 1) {
      revokeFamily(current.familyId(), "REUTILIZACAO_RENOVACAO");
      return Optional.empty();
    }

    int updatedSession =
        jdbcTemplate.update(
            """
            UPDATE dbo.sessao_autenticacao
            SET jti_acesso = ?, emitida_em_utc = ?, expira_em_utc = ?
            WHERE sessao_id = ? AND revogada_em_utc IS NULL
            """,
            replacementAccessTokenId,
            timestamp(now),
            timestamp(accessTokenExpiresAt),
            current.sessionId());
    if (updatedSession != 1) {
      revokeFamily(current.familyId(), "RENOVACAO_INVALIDA");
      return Optional.empty();
    }

    return Optional.of(
        new RefreshSession(
            new AuthenticationSession(
                current.sessionId(),
                current.familyId(),
                current.userId(),
                replacementAccessTokenId,
                now,
                accessTokenExpiresAt),
            current.displayName(),
            current.passwordChangeRequired()));
  }

  @Override
  public void revokeSession(UUID sessionId, String reason) {
    jdbcTemplate.update(
        """
        UPDATE dbo.sessao_autenticacao
        SET revogada_em_utc = COALESCE(revogada_em_utc, SYSUTCDATETIME()),
            motivo_revogacao = COALESCE(motivo_revogacao, ?)
        WHERE sessao_id = ?
        """,
        reason,
        sessionId);
    jdbcTemplate.update(
        """
        UPDATE dbo.token_renovacao
        SET revogado_em_utc = COALESCE(revogado_em_utc, SYSUTCDATETIME())
        WHERE sessao_id = ?
        """,
        sessionId);
  }

  @Override
  public void revokeAllUserSessions(UUID userId, String reason) {
    jdbcTemplate.update(
        """
        UPDATE dbo.sessao_autenticacao
        SET revogada_em_utc = COALESCE(revogada_em_utc, SYSUTCDATETIME()),
            motivo_revogacao = COALESCE(motivo_revogacao, ?)
        WHERE usuario_id = ?
        """,
        reason,
        userId);
    jdbcTemplate.update(
        """
        UPDATE token
        SET revogado_em_utc = COALESCE(token.revogado_em_utc, SYSUTCDATETIME())
        FROM dbo.token_renovacao AS token
        INNER JOIN dbo.sessao_autenticacao AS sessao ON sessao.sessao_id = token.sessao_id
        WHERE sessao.usuario_id = ?
        """,
        userId);
  }

  @Override
  public void changePassword(
      UUID userId, String passwordHash, String algorithm, String parameters) {
    jdbcTemplate.update(
        """
        UPDATE dbo.credencial_local
        SET senha_hash = ?, algoritmo = ?, parametros = ?,
            senha_alterada_em_utc = SYSUTCDATETIME(), senha_deve_ser_trocada = 0,
            tentativas_falhas = 0, bloqueada_ate_utc = NULL
        WHERE usuario_id = ?
        """,
        passwordHash,
        algorithm,
        parameters,
        userId);
  }

  @Override
  public void writeAudit(AuditEvent event) {
    jdbcTemplate.update(
        """
        INSERT INTO dbo.evento_auditoria (
            ator_usuario_id, acao, tipo_recurso, recurso_id, resultado, request_id, detalhe_reduzido
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        event.actorUserId(),
        event.action(),
        event.resourceType(),
        event.resourceId(),
        auditResult(event.result()),
        event.requestId(),
        event.reducedDetail());
  }

  private Set<String> effectivePermissions(UUID userId) {
    Set<String> rolePermissions =
        new LinkedHashSet<>(
            jdbcTemplate.queryForList(
                """
                SELECT DISTINCT permissao.codigo
                FROM dbo.atribuicao_papel AS atribuicao
                INNER JOIN dbo.papel AS papel ON papel.papel_id = atribuicao.papel_id
                INNER JOIN dbo.papel_permissao AS papel_permissao
                    ON papel_permissao.papel_id = papel.papel_id
                INNER JOIN dbo.permissao AS permissao
                    ON permissao.permissao_id = papel_permissao.permissao_id
                WHERE atribuicao.usuario_id = ?
                  AND atribuicao.revogado_em_utc IS NULL
                  AND papel.ativo = 1
                  AND papel_permissao.revogado_em_utc IS NULL
                  AND permissao.ativo = 1
                """,
                String.class,
                userId));
    Map<String, PermissionEffect> individualGrants = new LinkedHashMap<>();
    jdbcTemplate.query(
        """
        SELECT permissao.codigo, concessao.efeito
        FROM dbo.concessao_permissao_usuario AS concessao
        INNER JOIN dbo.permissao AS permissao ON permissao.permissao_id = concessao.permissao_id
        WHERE concessao.usuario_id = ?
          AND concessao.revogado_em_utc IS NULL
          AND permissao.ativo = 1
        """,
        resultSet -> {
          individualGrants.put(
              resultSet.getString("codigo"),
              "NEGAR".equals(resultSet.getString("efeito"))
                  ? PermissionEffect.DENY
                  : PermissionEffect.ALLOW);
        },
        userId);
    return EffectivePermissionPolicy.resolve(rolePermissions, individualGrants);
  }

  private Set<String> effectiveRoleCodes(UUID userId) {
    return new LinkedHashSet<>(
        jdbcTemplate.queryForList(
            """
            SELECT DISTINCT papel.codigo
            FROM dbo.atribuicao_papel AS atribuicao
            INNER JOIN dbo.papel AS papel ON papel.papel_id = atribuicao.papel_id
            WHERE atribuicao.usuario_id = ?
              AND atribuicao.revogado_em_utc IS NULL
              AND papel.ativo = 1
            """,
            String.class,
            userId));
  }

  private void revokeFamily(UUID familyId, String reason) {
    jdbcTemplate.update(
        """
        UPDATE dbo.sessao_autenticacao
        SET revogada_em_utc = COALESCE(revogada_em_utc, SYSUTCDATETIME()),
            motivo_revogacao = COALESCE(motivo_revogacao, ?)
        WHERE familia_id = ?
        """,
        reason,
        familyId);
    jdbcTemplate.update(
        """
        UPDATE token
        SET revogado_em_utc = COALESCE(token.revogado_em_utc, SYSUTCDATETIME())
        FROM dbo.token_renovacao AS token
        INNER JOIN dbo.sessao_autenticacao AS sessao ON sessao.sessao_id = token.sessao_id
        WHERE sessao.familia_id = ?
        """,
        familyId);
  }

  private static LocalCredentialAccount mapCredential(ResultSet resultSet) throws SQLException {
    return new LocalCredentialAccount(
        resultSet.getObject("usuario_id", UUID.class),
        resultSet.getString("nome_exibicao"),
        accountStatus(resultSet.getString("situacao")),
        resultSet.getString("senha_hash"),
        resultSet.getBoolean("senha_deve_ser_trocada"),
        resultSet.getInt("tentativas_falhas"),
        instant(resultSet, "bloqueada_ate_utc"));
  }

  private static LockedRefreshToken mapLockedRefreshToken(ResultSet resultSet) throws SQLException {
    return new LockedRefreshToken(
        resultSet.getObject("token_renovacao_id", UUID.class),
        resultSet.getObject("sessao_id", UUID.class),
        resultSet.getObject("usuario_id", UUID.class),
        resultSet.getObject("familia_id", UUID.class),
        resultSet.getString("nome_exibicao"),
        resultSet.getBoolean("senha_deve_ser_trocada"),
        instant(resultSet, "expira_em_utc"),
        instant(resultSet, "revogado_em_utc"),
        instant(resultSet, "sessao_revogada_em_utc") == null,
        accountStatus(resultSet.getString("situacao")).canAuthenticate());
  }

  private static AccountStatus accountStatus(String databaseValue) {
    return switch (databaseValue) {
      case "ATIVO" -> AccountStatus.ACTIVE;
      case "BLOQUEADO" -> AccountStatus.BLOCKED;
      case "DESATIVADO" -> AccountStatus.DISABLED;
      default -> throw new IllegalStateException("Unexpected persisted account status.");
    };
  }

  private static String auditResult(AuditEvent.AuditResult result) {
    return switch (result) {
      case SUCCESS -> "SUCESSO";
      case DENIED -> "NEGADO";
      case FAILURE -> "FALHA";
    };
  }

  private static LocalDateTime timestamp(Instant instant) {
    return SqlServerUtcDateTime.forBinding(instant);
  }

  private static Instant instant(ResultSet resultSet, String column) throws SQLException {
    return SqlServerUtcDateTime.read(resultSet, column);
  }

  private record LockedRefreshToken(
      UUID tokenId,
      UUID sessionId,
      UUID userId,
      UUID familyId,
      String displayName,
      boolean passwordChangeRequired,
      Instant expiresAt,
      Instant revokedAt,
      boolean sessionActive,
      boolean userActive) {}
}
