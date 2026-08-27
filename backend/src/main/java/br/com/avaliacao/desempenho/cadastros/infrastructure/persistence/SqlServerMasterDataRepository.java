package br.com.avaliacao.desempenho.cadastros.infrastructure.persistence;

import br.com.avaliacao.desempenho.cadastros.application.MasterDataException;
import br.com.avaliacao.desempenho.cadastros.application.MasterDataRepository;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * JDBC parametrizado para cadastros versionados; DELETE físico é limitado à filial inativa e sem
 * referências, conforme a regra administrativa.
 */
@Repository
@ConditionalOnSqlServerPersistence
public class SqlServerMasterDataRepository implements MasterDataRepository {

  private static final String MIGRATION_CADASTROS = "V0003";
  private static final String MIGRATION_REGRA_2024_1 = "V0005";
  private static final String MIGRATION_ATRIBUICOES = "V0007";

  private final JdbcTemplate jdbcTemplate;

  public SqlServerMasterDataRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  @Override
  public boolean createBranch(NamedRecord branch) {
    requireMigration(MIGRATION_CADASTROS);
    return jdbcTemplate.update(
            "INSERT INTO dbo.filial (filial_id, nome, ativa) VALUES (?, ?, 1)",
            branch.id(),
            branch.name())
        == 1;
  }

  @Override
  public boolean deactivateBranch(UUID branchId) {
    requireMigration(MIGRATION_CADASTROS);
    return jdbcTemplate.update(
            """
            UPDATE dbo.filial
            SET ativa = 0, atualizado_em_utc = SYSUTCDATETIME()
            WHERE filial_id = ? AND ativa = 1
            """,
            branchId)
        == 1;
  }

  @Override
  public boolean deleteInactiveUnusedBranch(UUID branchId) {
    requireMigration(MIGRATION_CADASTROS);
    return jdbcTemplate.update(
            """
            DELETE FROM dbo.filial
            WHERE filial_id = ?
              AND ativa = 0
              AND NOT EXISTS (
                  SELECT 1
                  FROM dbo.lotacao_colaborador
                  WHERE filial_id = ?
              )
            """,
            branchId,
            branchId)
        == 1;
  }

  @Override
  public boolean createArea(NamedRecord area) {
    requireMigration(MIGRATION_CADASTROS);
    return jdbcTemplate.update(
            "INSERT INTO dbo.area (area_id, nome, ativa) VALUES (?, ?, 1)", area.id(), area.name())
        == 1;
  }

  @Override
  public boolean deactivateArea(UUID areaId) {
    requireMigration(MIGRATION_CADASTROS);
    return jdbcTemplate.update(
            """
            UPDATE dbo.area
            SET ativa = 0, atualizado_em_utc = SYSUTCDATETIME()
            WHERE area_id = ? AND ativa = 1
            """,
            areaId)
        == 1;
  }

  @Override
  public boolean createCollaborator(NamedRecord collaborator) {
    requireMigration(MIGRATION_CADASTROS);
    return jdbcTemplate.update(
            """
            INSERT INTO dbo.colaborador (colaborador_id, nome_exibicao, ativo)
            VALUES (?, ?, 1)
            """,
            collaborator.id(),
            collaborator.name())
        == 1;
  }

  @Override
  public boolean deactivateCollaborator(UUID collaboratorId) {
    requireMigration(MIGRATION_CADASTROS);
    return jdbcTemplate.update(
            """
            UPDATE dbo.colaborador
            SET ativo = 0, atualizado_em_utc = SYSUTCDATETIME()
            WHERE colaborador_id = ? AND ativo = 1
            """,
            collaboratorId)
        == 1;
  }

  @Override
  public boolean createAllocation(AllocationRecord allocation) {
    requireMigration(MIGRATION_CADASTROS);
    return jdbcTemplate.update(
            """
            INSERT INTO dbo.lotacao_colaborador (
                lotacao_colaborador_id,
                colaborador_id,
                filial_id,
                area_id,
                gestor_texto_livre,
                inicio_vigencia,
                criado_por_usuario_id
            )
            SELECT ?, ?, ?, ?, ?, ?, ?
            WHERE EXISTS (
                SELECT 1 FROM dbo.colaborador
                WHERE colaborador_id = ? AND ativo = 1
            )
              AND (
                CAST(? AS uniqueidentifier) IS NULL
                OR EXISTS (
                    SELECT 1 FROM dbo.filial
                    WHERE filial_id = ? AND ativa = 1
                )
              )
              AND (
                CAST(? AS uniqueidentifier) IS NULL
                OR EXISTS (
                    SELECT 1 FROM dbo.area
                    WHERE area_id = ? AND ativa = 1
                )
              )
            """,
            allocation.id(),
            allocation.collaboratorId(),
            allocation.branchId(),
            allocation.areaId(),
            allocation.managerText(),
            allocation.startsOn(),
            allocation.createdByUserId(),
            allocation.collaboratorId(),
            allocation.branchId(),
            allocation.branchId(),
            allocation.areaId(),
            allocation.areaId())
        == 1;
  }

  @Override
  public boolean closeAllocation(UUID allocationId, LocalDate endsOn, UUID actorUserId) {
    requireMigration(MIGRATION_CADASTROS);
    return jdbcTemplate.update(
            """
            UPDATE dbo.lotacao_colaborador
            SET fim_vigencia = ?,
                encerrado_por_usuario_id = ?,
                encerrado_em_utc = SYSUTCDATETIME()
            WHERE lotacao_colaborador_id = ?
              AND encerrado_em_utc IS NULL
              AND (inicio_vigencia IS NULL OR inicio_vigencia <= ?)
            """,
            endsOn,
            actorUserId,
            allocationId,
            endsOn)
        == 1;
  }

  @Override
  public boolean createManagerAssignment(ManagerAssignmentRecord assignment) {
    requireMigration(MIGRATION_CADASTROS);
    requireMigration(MIGRATION_REGRA_2024_1);
    return jdbcTemplate.update(
            """
            INSERT INTO dbo.vinculo_gestor_colaborador (
                vinculo_gestor_colaborador_id,
                gestor_usuario_id,
                colaborador_id,
                inicio_vigencia,
                criado_por_usuario_id
            )
            SELECT ?, ?, ?, ?, ?
            WHERE EXISTS (
                SELECT 1 FROM dbo.usuario
                WHERE usuario_id = ? AND situacao = 'ATIVO'
            )
              AND EXISTS (
                SELECT 1
                FROM dbo.atribuicao_papel AS atribuicao
                INNER JOIN dbo.papel AS papel ON papel.papel_id = atribuicao.papel_id
                WHERE atribuicao.usuario_id = ?
                  AND atribuicao.revogado_em_utc IS NULL
                  AND papel.codigo = 'GESTOR'
                  AND papel.ativo = 1
              )
              AND EXISTS (
                SELECT 1 FROM dbo.colaborador
                WHERE colaborador_id = ? AND ativo = 1
              )
            """,
            assignment.id(),
            assignment.managerUserId(),
            assignment.collaboratorId(),
            assignment.startsOn(),
            assignment.createdByUserId(),
            assignment.managerUserId(),
            assignment.managerUserId(),
            assignment.collaboratorId())
        == 1;
  }

  @Override
  public boolean closeManagerAssignment(UUID assignmentId, LocalDate endsOn, UUID actorUserId) {
    requireMigration(MIGRATION_CADASTROS);
    requireMigration(MIGRATION_REGRA_2024_1);
    return jdbcTemplate.update(
            """
            UPDATE dbo.vinculo_gestor_colaborador
            SET fim_vigencia = ?,
                revogado_por_usuario_id = ?,
                revogado_em_utc = SYSUTCDATETIME()
            WHERE vinculo_gestor_colaborador_id = ?
              AND revogado_em_utc IS NULL
              AND (inicio_vigencia IS NULL OR inicio_vigencia <= ?)
            """,
            endsOn,
            actorUserId,
            assignmentId,
            endsOn)
        == 1;
  }

  @Override
  public boolean createUserCollaboratorLink(UserCollaboratorLinkRecord link) {
    requireMigration(MIGRATION_REGRA_2024_1);
    return jdbcTemplate.update(
            """
            INSERT INTO dbo.vinculo_usuario_colaborador (
                vinculo_usuario_colaborador_id,
                usuario_id,
                colaborador_id,
                inicio_vigencia,
                criado_por_usuario_id
            )
            SELECT ?, ?, ?, ?, ?
            WHERE EXISTS (
                SELECT 1 FROM dbo.usuario
                WHERE usuario_id = ? AND situacao = 'ATIVO'
            )
              AND EXISTS (
                SELECT 1 FROM dbo.colaborador
                WHERE colaborador_id = ? AND ativo = 1
              )
            """,
            link.id(),
            link.userId(),
            link.collaboratorId(),
            link.startsOn(),
            link.createdByUserId(),
            link.userId(),
            link.collaboratorId())
        == 1;
  }

  @Override
  public boolean closeUserCollaboratorLink(UUID linkId, LocalDate endsOn, UUID actorUserId) {
    requireMigration(MIGRATION_REGRA_2024_1);
    return jdbcTemplate.update(
            """
            UPDATE dbo.vinculo_usuario_colaborador
            SET fim_vigencia = ?,
                encerrado_por_usuario_id = ?,
                encerrado_em_utc = SYSUTCDATETIME()
            WHERE vinculo_usuario_colaborador_id = ?
              AND encerrado_em_utc IS NULL
              AND inicio_vigencia <= ?
            """,
            endsOn,
            actorUserId,
            linkId,
            endsOn)
        == 1;
  }

  @Override
  public boolean createQuestionnaireAssignment(QuestionnaireAssignmentRecord assignment) {
    requireMigration(MIGRATION_ATRIBUICOES);
    return jdbcTemplate.update(
            """
            INSERT INTO dbo.atribuicao_questionario_colaborador (
                atribuicao_questionario_colaborador_id,
                ciclo_avaliacao_id,
                colaborador_id,
                ciclo_questionario_id,
                atribuido_por_usuario_id
            )
            SELECT ?, ?, ?, ?, ?
            WHERE EXISTS (
                SELECT 1 FROM dbo.colaborador
                WHERE colaborador_id = ? AND ativo = 1
            )
            """,
            assignment.id(),
            assignment.cycleId(),
            assignment.collaboratorId(),
            assignment.cycleQuestionnaireId(),
            assignment.assignedByUserId(),
            assignment.collaboratorId())
        == 1;
  }

  @Override
  public boolean revokeQuestionnaireAssignment(UUID assignmentId, String reason, UUID actorUserId) {
    requireMigration(MIGRATION_ATRIBUICOES);
    return jdbcTemplate.update(
            """
            UPDATE dbo.atribuicao_questionario_colaborador
            SET revogado_por_usuario_id = ?,
                revogado_em_utc = SYSUTCDATETIME(),
                motivo_revogacao = ?
            WHERE atribuicao_questionario_colaborador_id = ?
              AND revogado_em_utc IS NULL
            """,
            actorUserId,
            reason,
            assignmentId)
        == 1;
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

  private void requireMigration(String version) {
    try {
      Integer applied =
          jdbcTemplate.queryForObject(
              "SELECT COUNT(*) FROM dbo.schema_migrations WHERE version = ?",
              Integer.class,
              version);
      if (applied == null || applied != 1) {
        throw unavailable();
      }
    } catch (DataAccessException exception) {
      throw unavailable();
    }
  }

  private static MasterDataException unavailable() {
    return new MasterDataException(
        MasterDataException.Reason.UNAVAILABLE,
        "A estrutura necessária para este cadastro ainda não está disponível.");
  }
}
