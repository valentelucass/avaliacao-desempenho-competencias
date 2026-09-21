package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence;

import br.com.avaliacao.desempenho.identidadeacesso.application.UserAdministrationRepository;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AccountStatus;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.PasswordResetAuthorizationPolicy;
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

  private static final String RESET_PASSWORD_PERMISSION = "SENHAS.REDEFINIR";
  private static final String DELEGATE_PASSWORD_RESET_PERMISSION = "SENHAS.DELEGAR_REDEFINICAO";
  private static final Set<String> PASSWORD_RESET_DELEGATION_PERMISSIONS =
      Set.of(RESET_PASSWORD_PERMISSION, DELEGATE_PASSWORD_RESET_PERMISSION);

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
  public Optional<PasswordResetAuthorizationPolicy.Actor> lockPasswordResetActor(UUID actorUserId) {
    return jdbcTemplate.query(
        """
        SELECT usuario.administrador_supremo
        FROM dbo.usuario usuario WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.credencial_local credencial WITH (UPDLOCK, HOLDLOCK)
          ON credencial.usuario_id = usuario.usuario_id
        WHERE usuario.usuario_id = ? AND usuario.situacao = 'ATIVO'
          AND usuario.excluido_logicamente = 0 AND credencial.senha_deve_ser_trocada = 0
          AND (credencial.bloqueada_ate_utc IS NULL OR credencial.bloqueada_ate_utc <= SYSUTCDATETIME())
          AND (usuario.administrador_supremo = 1 OR (usuario.protegido_fluxo_normal = 0
            AND NOT EXISTS (SELECT 1 FROM dbo.atribuicao_papel atribuicao
              JOIN dbo.papel papel ON papel.papel_id = atribuicao.papel_id
              WHERE atribuicao.usuario_id = usuario.usuario_id AND atribuicao.revogado_em_utc IS NULL
                AND papel.codigo = 'ADMINISTRADOR_PLATAFORMA')))
        """,
        rs -> {
          if (!rs.next()) return Optional.empty();
          Set<String> permissions =
              new LinkedHashSet<>(
                  jdbcTemplate.queryForList(
                      """
              SELECT permissao.codigo FROM dbo.concessao_permissao_usuario concessao
              JOIN dbo.permissao permissao ON permissao.permissao_id = concessao.permissao_id
              WHERE concessao.usuario_id = ? AND concessao.revogado_em_utc IS NULL
                AND concessao.efeito = 'PERMITIR' AND permissao.ativo = 1
                AND permissao.codigo IN ('SENHAS.REDEFINIR', 'SENHAS.DELEGAR_REDEFINICAO')
              """,
                      String.class,
                      actorUserId));
          return Optional.of(
              new PasswordResetAuthorizationPolicy.Actor(
                  actorUserId, rs.getBoolean(1), permissions));
        },
        actorUserId);
  }

  @Override
  public Optional<UserView> lockPasswordResetTarget(UUID userId) {
    Boolean eligible =
        jdbcTemplate.query(
            """
        SELECT usuario.usuario_id FROM dbo.usuario usuario WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.credencial_local credencial WITH (UPDLOCK, HOLDLOCK)
          ON credencial.usuario_id = usuario.usuario_id
        WHERE usuario.usuario_id = ? AND
        """
                + PasswordResetSqlEligibility.TARGET,
            rs -> {
              return rs.next();
            },
            userId);
    return Boolean.TRUE.equals(eligible) ? findUser(userId) : Optional.empty();
  }

  @Override
  public List<UserView> listPasswordResetTargets(UUID actorUserId, boolean supreme) {
    return jdbcTemplate
        .query(
            """
        SELECT usuario.usuario_id, usuario.login_normalizado, usuario.nome_exibicao, usuario.situacao,
          usuario.protegido_fluxo_normal, usuario.excluido_logicamente,
          credencial.senha_deve_ser_trocada, usuario.atualizado_em_utc
        FROM dbo.usuario usuario JOIN dbo.credencial_local credencial
          ON credencial.usuario_id = usuario.usuario_id
        WHERE
        """
                + PasswordResetSqlEligibility.TARGET
                + PasswordResetSqlEligibility.OPERATOR_SCOPE
                + " ORDER BY usuario.nome_exibicao, usuario.usuario_id",
            (rs, row) -> baseUser(rs),
            actorUserId,
            supreme ? 1 : 0)
        .stream()
        .map(this::hydrate)
        .toList();
  }

  @Override
  public Optional<String> passwordHashForReset(UUID userId) {
    return jdbcTemplate.query(
        "SELECT senha_hash FROM dbo.credencial_local WHERE usuario_id = ?",
        rs -> rs.next() ? Optional.of(rs.getString(1)) : Optional.empty(),
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
  public Optional<UserView> resetOrdinaryUserPassword(
      UUID userId,
      String passwordHash,
      String algorithm,
      String parameters,
      boolean actorIsSupremeAdministrator) {
    if (lockPasswordResetTarget(userId).isEmpty()) return Optional.empty();
    int updated =
        jdbcTemplate.update(
            """
        UPDATE credencial SET senha_hash = ?, algoritmo = ?, parametros = ?,
          senha_alterada_em_utc = SYSUTCDATETIME(), senha_deve_ser_trocada = 1,
          tentativas_falhas = 0, bloqueada_ate_utc = NULL
        FROM dbo.credencial_local credencial
        JOIN dbo.usuario usuario ON usuario.usuario_id = credencial.usuario_id
        WHERE usuario.usuario_id = ? AND
        """
                + PasswordResetSqlEligibility.TARGET
                + """
        AND (? = 1 OR NOT EXISTS (
          SELECT 1 FROM dbo.concessao_permissao_usuario concessao
          JOIN dbo.permissao permissao ON permissao.permissao_id = concessao.permissao_id
          WHERE concessao.usuario_id = usuario.usuario_id AND concessao.revogado_em_utc IS NULL
            AND concessao.efeito = 'PERMITIR' AND permissao.codigo = 'SENHAS.DELEGAR_REDEFINICAO'))
        """,
            passwordHash,
            algorithm,
            parameters,
            userId,
            actorIsSupremeAdministrator ? 1 : 0);
    return updated == 0 ? Optional.empty() : findUser(userId);
  }

  @Override
  public boolean replacePasswordResetDelegation(
      UUID userId,
      PasswordResetDelegation delegation,
      UUID actorUserId,
      boolean actorIsSupremeAdministrator) {
    Optional<UserView> target = lockPasswordResetTarget(userId);
    if (target.isEmpty()
        || userId.equals(actorUserId)
        || (!actorIsSupremeAdministrator
            && (delegation.canDelegatePasswordReset()
                || target.get().individualPermissions().stream()
                    .anyMatch(
                        permission ->
                            permission.permissionCode().equals(DELEGATE_PASSWORD_RESET_PERMISSION)
                                && permission.effect() == PermissionEffect.ALLOW)))
        || !passwordDelegationPermissionsAreActive()) return false;

    List<IndividualPermission> currentPermissions = activeIndividualPermissions(userId);
    for (IndividualPermission current : currentPermissions) {
      if (PASSWORD_RESET_DELEGATION_PERMISSIONS.contains(current.permissionCode())) {
        jdbcTemplate.update(
            """
            UPDATE concessao
            SET revogado_por_usuario_id = ?, revogado_em_utc = SYSUTCDATETIME()
            FROM dbo.concessao_permissao_usuario AS concessao
            INNER JOIN dbo.permissao AS permissao ON permissao.permissao_id = concessao.permissao_id
            WHERE concessao.usuario_id = ?
              AND permissao.codigo = ?
              AND concessao.revogado_em_utc IS NULL
            """,
            actorUserId,
            userId,
            current.permissionCode());
      }
    }
    insertPasswordDelegationPermission(
        userId, actorUserId, RESET_PASSWORD_PERMISSION, delegation.canResetPassword());
    insertPasswordDelegationPermission(
        userId,
        actorUserId,
        DELEGATE_PASSWORD_RESET_PERMISSION,
        delegation.canDelegatePasswordReset());
    return true;
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
      if (PASSWORD_RESET_DELEGATION_PERMISSIONS.contains(current.permissionCode())) {
        continue;
      }
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

  private boolean passwordDelegationPermissionsAreActive() {
    Integer count =
        jdbcTemplate.queryForObject(
            """
            SELECT COUNT(*)
            FROM dbo.permissao
            WHERE ativo = 1 AND codigo IN (?, ?)
            """,
            Integer.class,
            RESET_PASSWORD_PERMISSION,
            DELEGATE_PASSWORD_RESET_PERMISSION);
    return count != null && count == PASSWORD_RESET_DELEGATION_PERMISSIONS.size();
  }

  private void insertPasswordDelegationPermission(
      UUID userId, UUID actorUserId, String permissionCode, boolean allowed) {
    if (!allowed) {
      return;
    }
    jdbcTemplate.update(
        """
        INSERT INTO dbo.concessao_permissao_usuario (
            usuario_id, permissao_id, efeito, concedido_por_usuario_id
        )
        SELECT ?, permissao_id, 'PERMITIR', ?
        FROM dbo.permissao
        WHERE codigo = ? AND ativo = 1
        """,
        userId,
        actorUserId,
        permissionCode);
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
