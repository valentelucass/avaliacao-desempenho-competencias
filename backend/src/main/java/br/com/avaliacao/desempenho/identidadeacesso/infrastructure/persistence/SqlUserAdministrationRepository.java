package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence;

import br.com.avaliacao.desempenho.identidadeacesso.application.UserAdministrationRepository;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AccountStatus;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.PermissionEffect;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Administração JDBC parametrizada; mudanças preservam as concessões históricas revogadas. */
@Repository
@ConditionalOnSqlServerPersistence
public class SqlUserAdministrationRepository implements UserAdministrationRepository {

  private final JdbcTemplate jdbcTemplate;

  public SqlUserAdministrationRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  @Override
  public List<UserView> listUsers() {
    return jdbcTemplate
        .query(
            """
        SELECT u.usuario_id, u.login_normalizado, u.nome_exibicao, u.situacao,
               u.protegido_fluxo_normal, u.excluido_logicamente,
               c.senha_deve_ser_trocada, u.atualizado_em_utc
        FROM dbo.usuario AS u
        INNER JOIN dbo.credencial_local AS c ON c.usuario_id = u.usuario_id
        ORDER BY u.nome_exibicao, u.usuario_id
        """,
            (resultSet, rowNumber) -> baseUser(resultSet))
        .stream()
        .map(this::hydrate)
        .toList();
  }

  @Override
  public Optional<UserView> findUser(UUID userId) {
    return jdbcTemplate.query(
        """
        SELECT u.usuario_id, u.login_normalizado, u.nome_exibicao, u.situacao,
               u.protegido_fluxo_normal, u.excluido_logicamente,
               c.senha_deve_ser_trocada, u.atualizado_em_utc
        FROM dbo.usuario AS u
        INNER JOIN dbo.credencial_local AS c ON c.usuario_id = u.usuario_id
        WHERE u.usuario_id = ?
        """,
        resultSet ->
            resultSet.next() ? Optional.of(hydrate(baseUser(resultSet))) : Optional.empty(),
        userId);
  }

  @Override
  public UserView createLocalUser(NewLocalUser user, UUID actorUserId) {
    jdbcTemplate.update(
        """
        INSERT INTO dbo.usuario (
            usuario_id, login_normalizado, nome_exibicao, situacao,
            administrador_supremo, protegido_fluxo_normal
        ) VALUES (?, ?, ?, 'ATIVO', 0, 0)
        """,
        user.userId(),
        user.normalizedLogin(),
        user.displayName());
    jdbcTemplate.update(
        """
        INSERT INTO dbo.credencial_local (
            usuario_id, senha_hash, algoritmo, parametros, senha_deve_ser_trocada
        ) VALUES (?, ?, ?, ?, 1)
        """,
        user.userId(),
        user.passwordHash(),
        user.passwordAlgorithm(),
        user.passwordParameters());
    return findUser(user.userId()).orElseThrow();
  }

  @Override
  public Optional<UserView> updateUser(UUID userId, UpdateUser update, UUID actorUserId) {
    int updated =
        jdbcTemplate.update(
            """
            UPDATE dbo.usuario
            SET nome_exibicao = ?, situacao = ?, atualizado_em_utc = SYSUTCDATETIME()
            WHERE usuario_id = ?
              AND administrador_supremo = 0
              AND excluido_logicamente = 0
            """,
            update.displayName(),
            databaseStatus(update.status()),
            userId);
    return updated == 0 ? Optional.empty() : findUser(userId);
  }

  @Override
  public Optional<UserView> logicallyDeleteUser(UUID userId, UUID actorUserId) {
    int updated =
        jdbcTemplate.update(
            """
            UPDATE dbo.usuario
            SET situacao = 'DESATIVADO',
                excluido_logicamente = 1,
                excluido_por_usuario_id = ?,
                excluido_em_utc = SYSUTCDATETIME(),
                atualizado_em_utc = SYSUTCDATETIME()
            WHERE usuario_id = ?
              AND administrador_supremo = 0
              AND protegido_fluxo_normal = 0
              AND excluido_logicamente = 0
            """,
            actorUserId,
            userId);
    return updated == 0 ? Optional.empty() : findUser(userId);
  }

  @Override
  public boolean isSupremeAdministrator(UUID userId) {
    Boolean supremeAdministrator =
        jdbcTemplate.query(
            """
            SELECT CAST(administrador_supremo AS bit)
            FROM dbo.usuario
            WHERE usuario_id = ? AND situacao = 'ATIVO' AND excluido_logicamente = 0
            """,
            resultSet -> resultSet.next() ? resultSet.getBoolean(1) : null,
            userId);
    return Boolean.TRUE.equals(supremeAdministrator);
  }

  @Override
  public Optional<UserView> resetOrdinaryUserPassword(
      UUID userId, String passwordHash, String algorithm, String parameters) {
    int updated =
        jdbcTemplate.update(
            """
            UPDATE credencial
            SET senha_hash = ?, algoritmo = ?, parametros = ?,
                senha_alterada_em_utc = SYSUTCDATETIME(), senha_deve_ser_trocada = 1,
                tentativas_falhas = 0, bloqueada_ate_utc = NULL
            FROM dbo.credencial_local AS credencial
            INNER JOIN dbo.usuario AS usuario ON usuario.usuario_id = credencial.usuario_id
            WHERE usuario.usuario_id = ?
              AND usuario.situacao = 'ATIVO'
              AND usuario.administrador_supremo = 0
              AND usuario.protegido_fluxo_normal = 0
              AND usuario.excluido_logicamente = 0
            """,
            passwordHash,
            algorithm,
            parameters,
            userId);
    return updated == 0 ? Optional.empty() : findUser(userId);
  }

  @Override
  public boolean replaceAccess(UUID userId, AccessConfiguration access, UUID actorUserId) {
    Boolean ordinaryUser =
        jdbcTemplate.query(
            """
            SELECT CASE WHEN administrador_supremo = 0 THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END
            FROM dbo.usuario WITH (UPDLOCK, HOLDLOCK) WHERE usuario_id = ?
            """,
            resultSet -> resultSet.next() ? resultSet.getBoolean(1) : null,
            userId);
    if (!Boolean.TRUE.equals(ordinaryUser)
        || !allKnownAndActiveRoles(access.roleCodes())
        || !allKnownAndActivePermissions(access.permissions())) {
      return false;
    }

    Set<String> currentRoles = activeRoles(userId);
    for (String role : currentRoles) {
      if (!access.roleCodes().contains(role)) {
        jdbcTemplate.update(
            """
            UPDATE atribuicao
            SET revogado_por_usuario_id = ?, revogado_em_utc = SYSUTCDATETIME()
            FROM dbo.atribuicao_papel AS atribuicao
            INNER JOIN dbo.papel AS papel ON papel.papel_id = atribuicao.papel_id
            WHERE atribuicao.usuario_id = ? AND papel.codigo = ? AND atribuicao.revogado_em_utc IS NULL
            """,
            actorUserId,
            userId,
            role);
      }
    }
    for (String role : access.roleCodes()) {
      if (!currentRoles.contains(role)) {
        jdbcTemplate.update(
            """
            INSERT INTO dbo.atribuicao_papel (usuario_id, papel_id, concedido_por_usuario_id)
            SELECT ?, papel_id, ? FROM dbo.papel WHERE codigo = ? AND ativo = 1
            """,
            userId,
            actorUserId,
            role);
      }
    }

    List<IndividualPermission> currentPermissions = activeIndividualPermissions(userId);
    for (IndividualPermission current : currentPermissions) {
      IndividualPermission desired =
          access.permissions().stream()
              .filter(item -> item.permissionCode().equals(current.permissionCode()))
              .findFirst()
              .orElse(null);
      if (desired == null || desired.effect() != current.effect()) {
        jdbcTemplate.update(
            """
            UPDATE concessao
            SET revogado_por_usuario_id = ?, revogado_em_utc = SYSUTCDATETIME()
            FROM dbo.concessao_permissao_usuario AS concessao
            INNER JOIN dbo.permissao AS permissao ON permissao.permissao_id = concessao.permissao_id
            WHERE concessao.usuario_id = ? AND permissao.codigo = ? AND concessao.revogado_em_utc IS NULL
            """,
            actorUserId,
            userId,
            current.permissionCode());
      }
    }
    for (IndividualPermission desired : access.permissions()) {
      boolean unchanged =
          currentPermissions.stream()
              .anyMatch(
                  current ->
                      current.permissionCode().equals(desired.permissionCode())
                          && current.effect() == desired.effect());
      if (!unchanged) {
        jdbcTemplate.update(
            """
            INSERT INTO dbo.concessao_permissao_usuario (
                usuario_id, permissao_id, efeito, concedido_por_usuario_id
            )
            SELECT ?, permissao_id, ?, ? FROM dbo.permissao WHERE codigo = ? AND ativo = 1
            """,
            userId,
            databaseEffect(desired.effect()),
            actorUserId,
            desired.permissionCode());
      }
    }
    return true;
  }

  @Override
  public void revokeAllSessions(UUID userId, String reason) {
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
  public void writeAdministrativeAudit(
      UUID actorUserId, String action, String resourceType, UUID resourceId, String requestId) {
    jdbcTemplate.update(
        """
        INSERT INTO dbo.evento_auditoria (
            ator_usuario_id, acao, tipo_recurso, recurso_id, resultado, request_id
        ) VALUES (?, ?, ?, ?, 'SUCESSO', ?)
        """,
        actorUserId,
        action,
        resourceType,
        resourceId,
        requestId);
  }

  static BaseUser baseUser(ResultSet resultSet) throws SQLException {
    return new BaseUser(
        resultSet.getObject("usuario_id", UUID.class),
        resultSet.getString("login_normalizado"),
        resultSet.getString("nome_exibicao"),
        accountStatus(resultSet.getString("situacao")),
        resultSet.getBoolean("protegido_fluxo_normal"),
        resultSet.getBoolean("excluido_logicamente"),
        resultSet.getBoolean("senha_deve_ser_trocada"),
        SqlServerUtcDateTime.read(resultSet, "atualizado_em_utc"));
  }

  private UserView hydrate(BaseUser user) {
    return new UserView(
        user.id(),
        user.login(),
        user.displayName(),
        user.status(),
        user.protectedFromNormalFlow(),
        user.logicallyDeleted(),
        user.passwordChangeRequired(),
        activeRoles(user.id()),
        activeIndividualPermissions(user.id()),
        user.updatedAt());
  }

  private Set<String> activeRoles(UUID userId) {
    return new LinkedHashSet<>(
        jdbcTemplate.queryForList(
            """
            SELECT papel.codigo
            FROM dbo.atribuicao_papel AS atribuicao
            INNER JOIN dbo.papel AS papel ON papel.papel_id = atribuicao.papel_id
            WHERE atribuicao.usuario_id = ? AND atribuicao.revogado_em_utc IS NULL
            ORDER BY papel.codigo
            """,
            String.class,
            userId));
  }

  private List<IndividualPermission> activeIndividualPermissions(UUID userId) {
    return jdbcTemplate.query(
        """
        SELECT permissao.codigo, concessao.efeito
        FROM dbo.concessao_permissao_usuario AS concessao
        INNER JOIN dbo.permissao AS permissao ON permissao.permissao_id = concessao.permissao_id
        WHERE concessao.usuario_id = ? AND concessao.revogado_em_utc IS NULL
        ORDER BY permissao.codigo
        """,
        (resultSet, rowNumber) ->
            new IndividualPermission(
                resultSet.getString("codigo"), permissionEffect(resultSet.getString("efeito"))),
        userId);
  }

  private boolean allKnownAndActiveRoles(Set<String> roleCodes) {
    if (roleCodes.isEmpty()) {
      return true;
    }
    Integer count =
        jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM dbo.papel WHERE ativo = 1 AND codigo IN ("
                + placeholders(roleCodes.size())
                + ')',
            Integer.class,
            roleCodes.toArray());
    return count != null && count == roleCodes.size();
  }

  private boolean allKnownAndActivePermissions(List<IndividualPermission> permissions) {
    if (permissions.isEmpty()) {
      return true;
    }
    Integer count =
        jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM dbo.permissao WHERE ativo = 1 AND codigo IN ("
                + placeholders(permissions.size())
                + ')',
            Integer.class,
            permissions.stream().map(IndividualPermission::permissionCode).toArray());
    return count != null && count == permissions.size();
  }

  private static String placeholders(int size) {
    return String.join(", ", java.util.Collections.nCopies(size, "?"));
  }

  private static String databaseStatus(AccountStatus status) {
    return switch (status) {
      case ACTIVE -> "ATIVO";
      case BLOCKED -> "BLOQUEADO";
      case DISABLED -> "DESATIVADO";
    };
  }

  private static AccountStatus accountStatus(String databaseValue) {
    return switch (databaseValue) {
      case "ATIVO" -> AccountStatus.ACTIVE;
      case "BLOQUEADO" -> AccountStatus.BLOCKED;
      case "DESATIVADO" -> AccountStatus.DISABLED;
      default -> throw new IllegalStateException("Unexpected persisted account status.");
    };
  }

  private static String databaseEffect(PermissionEffect effect) {
    return effect == PermissionEffect.ALLOW ? "PERMITIR" : "NEGAR";
  }

  private static PermissionEffect permissionEffect(String databaseValue) {
    return "PERMITIR".equals(databaseValue) ? PermissionEffect.ALLOW : PermissionEffect.DENY;
  }

  record BaseUser(
      UUID id,
      String login,
      String displayName,
      AccountStatus status,
      boolean protectedFromNormalFlow,
      boolean logicallyDeleted,
      boolean passwordChangeRequired,
      Instant updatedAt) {}
}
