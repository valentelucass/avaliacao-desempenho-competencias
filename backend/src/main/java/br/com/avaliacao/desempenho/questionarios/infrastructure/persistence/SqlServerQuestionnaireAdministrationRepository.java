package br.com.avaliacao.desempenho.questionarios.infrastructure.persistence;

import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.SqlServerUtcDateTime;
import br.com.avaliacao.desempenho.questionarios.application.QuestionnaireAdministrationException;
import br.com.avaliacao.desempenho.questionarios.application.QuestionnaireAdministrationRepository;
import br.com.avaliacao.desempenho.questionarios.domain.model.QuestionnaireVersionDraft;
import br.com.avaliacao.desempenho.questionarios.domain.model.QuestionnaireVersionDraft.CompetencyDraft;
import br.com.avaliacao.desempenho.questionarios.domain.model.QuestionnaireVersionDraft.QuestionDraft;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Grava uma versão inteira antes da aprovação, para que não exista questionário parcialmente
 * publicado.
 */
@Repository
@ConditionalOnSqlServerPersistence
public class SqlServerQuestionnaireAdministrationRepository
    implements QuestionnaireAdministrationRepository {

  private static final List<ClassificationBand> CLASSIFICATION_BANDS =
      List.of(
          new ClassificationBand(
              1, new BigDecimal("80.0"), new BigDecimal("84.9"), "ABAIXO_ESPERADO", "Desenvolver"),
          new ClassificationBand(
              2,
              new BigDecimal("85.0"),
              new BigDecimal("94.9"),
              "EM_DESENVOLVIMENTO",
              "Entender os porquês"),
          new ClassificationBand(
              3,
              new BigDecimal("95.0"),
              new BigDecimal("104.9"),
              "DENTRO_EXPECTATIVAS",
              "Acelerar e desenvolver"),
          new ClassificationBand(
              4,
              new BigDecimal("105.0"),
              new BigDecimal("114.9"),
              "SUPERA_EXPECTATIVAS",
              "Manter e impulsionar"),
          new ClassificationBand(
              5,
              new BigDecimal("115.0"),
              new BigDecimal("120.0"),
              "REFERENCIA",
              "Reter e engajar"));

  private final JdbcTemplate jdbcTemplate;

  public SqlServerQuestionnaireAdministrationRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "JdbcTemplate não pode ser nulo");
  }

  @Override
  public CreatedQuestionnaireVersion createFrozenVersion(
      QuestionnaireVersionDraft draft, UUID actorUserId) {
    requireRequiredMigrations();
    UUID actor = Objects.requireNonNull(actorUserId, "ator não pode ser nulo");
    UUID questionnaireId = ensureQuestionnaire(draft.questionnaire());
    UUID questionnaireVersionId = UUID.randomUUID();
    insertQuestionnaireVersion(questionnaireVersionId, questionnaireId, draft, actor);

    for (CompetencyDraft competency : draft.competencies()) {
      UUID competencyId = ensureCompetency(competency);
      UUID competencyVersionId = ensureCompetencyVersion(competencyId, competency, actor);

      UUID questionnaireCompetencyId = UUID.randomUUID();
      insertQuestionnaireCompetency(
          questionnaireCompetencyId,
          questionnaireVersionId,
          competencyVersionId,
          competency.order());
      for (QuestionDraft question : competency.questions()) {
        insertQuestion(UUID.randomUUID(), questionnaireCompetencyId, question);
      }
    }

    for (QuestionnaireVersionDraft.ResponseOption option : draft.responseOptions()) {
      insertResponseOption(UUID.randomUUID(), questionnaireVersionId, option);
    }

    VersionedArtifact calculationConfiguration = ensureCalculationConfiguration(draft, actor);
    VersionedArtifact classificationMatrix =
        ensureClassificationMatrix(
            calculationConfiguration.id(), draft.classificationMatrixVersionNumber(), actor);
    approveQuestionnaireVersion(questionnaireVersionId, actor);
    return new CreatedQuestionnaireVersion(
        questionnaireVersionId,
        calculationConfiguration.id(),
        classificationMatrix.id(),
        calculationConfiguration.created(),
        classificationMatrix.created());
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

  private UUID ensureQuestionnaire(QuestionnaireVersionDraft.QuestionnaireDraft questionnaire) {
    List<BaseCatalogRow> existing =
        jdbcTemplate.query(
            """
            SELECT questionario_id, nome, ativo
            FROM dbo.questionario
            WHERE codigo = ?
            """,
            (resultSet, rowNumber) -> baseCatalogRow(resultSet, "questionario_id"),
            questionnaire.code());
    if (existing.isEmpty()) {
      UUID id = UUID.randomUUID();
      jdbcTemplate.update(
          """
          INSERT INTO dbo.questionario (questionario_id, codigo, nome, ativo)
          VALUES (?, ?, ?, 1)
          """,
          id,
          questionnaire.code(),
          questionnaire.name());
      return id;
    }
    BaseCatalogRow row = existing.getFirst();
    if (!row.active() || !row.name().equals(questionnaire.name())) {
      throw conflict("O código de questionário já representa outro catálogo.");
    }
    return row.id();
  }

  private UUID ensureCompetency(CompetencyDraft competency) {
    List<BaseCatalogRow> existing =
        jdbcTemplate.query(
            """
            SELECT competencia_id, nome, ativa AS ativo
            FROM dbo.competencia
            WHERE codigo = ?
            """,
            (resultSet, rowNumber) -> baseCatalogRow(resultSet, "competencia_id"),
            competency.code());
    if (existing.isEmpty()) {
      UUID id = UUID.randomUUID();
      jdbcTemplate.update(
          """
          INSERT INTO dbo.competencia (competencia_id, codigo, nome, ativa)
          VALUES (?, ?, ?, 1)
          """,
          id,
          competency.code(),
          competency.name());
      return id;
    }
    BaseCatalogRow row = existing.getFirst();
    if (!row.active() || !row.name().equals(competency.name())) {
      throw conflict("O código de competência já representa outro catálogo.");
    }
    return row.id();
  }

  private UUID ensureCompetencyVersion(
      UUID competencyId, CompetencyDraft competency, UUID actorUserId) {
    List<CompetencyVersionRow> existing =
        jdbcTemplate.query(
            """
            SELECT versao_competencia_id, nome, descricao
            FROM dbo.versao_competencia
            WHERE competencia_id = ? AND numero_versao = ?
            """,
            (resultSet, rowNumber) ->
                new CompetencyVersionRow(
                    resultSet.getObject("versao_competencia_id", UUID.class),
                    resultSet.getString("nome"),
                    resultSet.getString("descricao")),
            competencyId,
            competency.versionNumber());
    if (existing.isEmpty()) {
      UUID id = UUID.randomUUID();
      insertCompetencyVersion(id, competencyId, competency, actorUserId);
      return id;
    }
    CompetencyVersionRow row = existing.getFirst();
    if (!row.name().equals(competency.name())
        || !Objects.equals(row.description(), competency.description())) {
      throw conflict("A versão de competência já representa outro conteúdo.");
    }
    return row.id();
  }

  private VersionedArtifact ensureCalculationConfiguration(
      QuestionnaireVersionDraft draft, UUID actorUserId) {
    List<CalculationConfigurationRow> existing =
        jdbcTemplate.query(
            """
            SELECT configuracao_calculo_versao_id,
                   algoritmo,
                   casas_decimais,
                   modo_arredondamento,
                   nota_minima,
                   nota_maxima,
                   exige_todas_perguntas,
                   aprovado_em_utc
            FROM dbo.configuracao_calculo_versao
            WHERE codigo = ? AND numero_versao = ?
            """,
            (resultSet, rowNumber) ->
                new CalculationConfigurationRow(
                    resultSet.getObject("configuracao_calculo_versao_id", UUID.class),
                    resultSet.getString("algoritmo"),
                    resultSet.getInt("casas_decimais"),
                    resultSet.getString("modo_arredondamento"),
                    resultSet.getBigDecimal("nota_minima"),
                    resultSet.getBigDecimal("nota_maxima"),
                    resultSet.getBoolean("exige_todas_perguntas"),
                    SqlServerUtcDateTime.read(resultSet, "aprovado_em_utc")),
            draft.calculation().code(),
            draft.calculation().versionNumber());
    if (existing.isEmpty()) {
      UUID id = UUID.randomUUID();
      insertCalculationConfiguration(id, draft, actorUserId);
      approveCalculationConfiguration(id, actorUserId);
      return new VersionedArtifact(id, true);
    }
    CalculationConfigurationRow row = existing.getFirst();
    if (!matches2024Calculation(row)) {
      throw conflict("A configuração de cálculo já representa outra regra ou não está aprovada.");
    }
    return new VersionedArtifact(row.id(), false);
  }

  private VersionedArtifact ensureClassificationMatrix(
      UUID calculationConfigurationVersionId, int matrixVersionNumber, UUID actorUserId) {
    List<ClassificationMatrixRow> existing =
        jdbcTemplate.query(
            """
            SELECT matriz_classificacao_versao_id,
                   configuracao_calculo_versao_id,
                   aprovado_em_utc
            FROM dbo.matriz_classificacao_versao
            WHERE codigo = ? AND numero_versao = ?
            """,
            (resultSet, rowNumber) ->
                new ClassificationMatrixRow(
                    resultSet.getObject("matriz_classificacao_versao_id", UUID.class),
                    resultSet.getObject("configuracao_calculo_versao_id", UUID.class),
                    SqlServerUtcDateTime.read(resultSet, "aprovado_em_utc")),
            QuestionnaireVersionDraft.GENERAL_CLASSIFICATION_MATRIX_CODE,
            matrixVersionNumber);
    if (existing.isEmpty()) {
      UUID id = UUID.randomUUID();
      insertClassificationMatrix(
          id, calculationConfigurationVersionId, matrixVersionNumber, actorUserId);
      for (ClassificationBand band : CLASSIFICATION_BANDS) {
        insertClassificationBand(UUID.randomUUID(), id, band);
      }
      approveClassificationMatrix(id, actorUserId);
      return new VersionedArtifact(id, true);
    }
    ClassificationMatrixRow row = existing.getFirst();
    if (!row.calculationConfigurationVersionId().equals(calculationConfigurationVersionId)
        || row.approvedAt() == null
        || !hasGeneralClassificationBands(row.id())) {
      throw conflict("A matriz GERAL já representa outra configuração ou não está aprovada.");
    }
    return new VersionedArtifact(row.id(), false);
  }

  private boolean hasGeneralClassificationBands(UUID classificationMatrixVersionId) {
    List<ClassificationBand> bands =
        jdbcTemplate.query(
            """
            SELECT ordem, limite_inferior, limite_superior, classificacao, orientacao
            FROM dbo.faixa_classificacao
            WHERE matriz_classificacao_versao_id = ?
            ORDER BY ordem
            """,
            (resultSet, rowNumber) ->
                new ClassificationBand(
                    resultSet.getInt("ordem"),
                    resultSet.getBigDecimal("limite_inferior"),
                    resultSet.getBigDecimal("limite_superior"),
                    resultSet.getString("classificacao"),
                    resultSet.getString("orientacao")),
            classificationMatrixVersionId);
    if (bands.size() != CLASSIFICATION_BANDS.size()) {
      return false;
    }
    for (int index = 0; index < bands.size(); index++) {
      ClassificationBand actual = bands.get(index);
      ClassificationBand expected = CLASSIFICATION_BANDS.get(index);
      if (actual.order() != expected.order()
          || !sameDecimal(actual.lowerLimit(), expected.lowerLimit())
          || !sameDecimal(actual.upperLimit(), expected.upperLimit())
          || !actual.classification().equals(expected.classification())
          || !actual.guidance().equals(expected.guidance())) {
        return false;
      }
    }
    return true;
  }

  private void insertQuestionnaireVersion(
      UUID questionnaireVersionId,
      UUID questionnaireId,
      QuestionnaireVersionDraft draft,
      UUID actorUserId) {
    jdbcTemplate.update(
        """
        INSERT INTO dbo.versao_questionario (
            versao_questionario_id,
            questionario_id,
            numero_versao,
            titulo,
            descricao,
            criado_por_usuario_id
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        questionnaireVersionId,
        questionnaireId,
        draft.versionNumber(),
        draft.title(),
        draft.description(),
        actorUserId);
  }

  private void insertCompetencyVersion(
      UUID competencyVersionId, UUID competencyId, CompetencyDraft competency, UUID actorUserId) {
    jdbcTemplate.update(
        """
        INSERT INTO dbo.versao_competencia (
            versao_competencia_id,
            competencia_id,
            numero_versao,
            nome,
            descricao,
            criado_por_usuario_id
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        competencyVersionId,
        competencyId,
        competency.versionNumber(),
        competency.name(),
        competency.description(),
        actorUserId);
  }

  private void insertQuestionnaireCompetency(
      UUID questionnaireCompetencyId,
      UUID questionnaireVersionId,
      UUID competencyVersionId,
      int order) {
    jdbcTemplate.update(
        """
        INSERT INTO dbo.questionario_competencia (
            questionario_competencia_id,
            versao_questionario_id,
            versao_competencia_id,
            ordem
        ) VALUES (?, ?, ?, ?)
        """,
        questionnaireCompetencyId,
        questionnaireVersionId,
        competencyVersionId,
        order);
  }

  private void insertQuestion(
      UUID questionId, UUID questionnaireCompetencyId, QuestionDraft question) {
    jdbcTemplate.update(
        """
        INSERT INTO dbo.pergunta_questionario (
            pergunta_questionario_id,
            questionario_competencia_id,
            codigo,
            texto,
            descricao,
            ordem,
            obrigatoria
        ) VALUES (?, ?, ?, ?, ?, ?, 1)
        """,
        questionId,
        questionnaireCompetencyId,
        question.code(),
        question.text(),
        question.description(),
        question.order());
  }

  private void insertResponseOption(
      UUID responseOptionId,
      UUID questionnaireVersionId,
      QuestionnaireVersionDraft.ResponseOption option) {
    jdbcTemplate.update(
        """
        INSERT INTO dbo.opcao_resposta (
            opcao_resposta_id,
            versao_questionario_id,
            codigo,
            rotulo,
            ordem,
            pontos
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        responseOptionId,
        questionnaireVersionId,
        option.code(),
        option.label(),
        option.order(),
        option.points());
  }

  private void insertCalculationConfiguration(
      UUID calculationConfigurationVersionId, QuestionnaireVersionDraft draft, UUID actorUserId) {
    jdbcTemplate.update(
        """
        INSERT INTO dbo.configuracao_calculo_versao (
            configuracao_calculo_versao_id,
            codigo,
            numero_versao,
            algoritmo,
            casas_decimais,
            modo_arredondamento,
            nota_minima,
            nota_maxima,
            exige_todas_perguntas,
            criado_por_usuario_id
        ) VALUES (?, ?, ?, 'MEDIA_SIMPLES', 1, 'HALF_UP', 80.0, 120.0, 1, ?)
        """,
        calculationConfigurationVersionId,
        draft.calculation().code(),
        draft.calculation().versionNumber(),
        actorUserId);
  }

  private void insertClassificationMatrix(
      UUID classificationMatrixVersionId,
      UUID calculationConfigurationVersionId,
      int matrixVersionNumber,
      UUID actorUserId) {
    jdbcTemplate.update(
        """
        INSERT INTO dbo.matriz_classificacao_versao (
            matriz_classificacao_versao_id,
            configuracao_calculo_versao_id,
            codigo,
            numero_versao,
            criado_por_usuario_id
        ) VALUES (?, ?, ?, ?, ?)
        """,
        classificationMatrixVersionId,
        calculationConfigurationVersionId,
        QuestionnaireVersionDraft.GENERAL_CLASSIFICATION_MATRIX_CODE,
        matrixVersionNumber,
        actorUserId);
  }

  private void insertClassificationBand(
      UUID classificationBandId, UUID classificationMatrixVersionId, ClassificationBand band) {
    jdbcTemplate.update(
        """
        INSERT INTO dbo.faixa_classificacao (
            faixa_classificacao_id,
            matriz_classificacao_versao_id,
            ordem,
            limite_inferior,
            limite_superior,
            classificacao,
            orientacao
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        classificationBandId,
        classificationMatrixVersionId,
        band.order(),
        band.lowerLimit(),
        band.upperLimit(),
        band.classification(),
        band.guidance());
  }

  private void approveCalculationConfiguration(UUID configurationId, UUID actorUserId) {
    requireOne(
        jdbcTemplate.update(
            """
            UPDATE dbo.configuracao_calculo_versao
            SET aprovado_por_usuario_id = ?, aprovado_em_utc = SYSUTCDATETIME()
            WHERE configuracao_calculo_versao_id = ? AND aprovado_em_utc IS NULL
            """,
            actorUserId,
            configurationId));
  }

  private void approveClassificationMatrix(UUID matrixId, UUID actorUserId) {
    requireOne(
        jdbcTemplate.update(
            """
            UPDATE dbo.matriz_classificacao_versao
            SET aprovado_por_usuario_id = ?, aprovado_em_utc = SYSUTCDATETIME()
            WHERE matriz_classificacao_versao_id = ? AND aprovado_em_utc IS NULL
            """,
            actorUserId,
            matrixId));
  }

  private void approveQuestionnaireVersion(UUID questionnaireVersionId, UUID actorUserId) {
    requireOne(
        jdbcTemplate.update(
            """
            UPDATE dbo.versao_questionario
            SET aprovado_por_usuario_id = ?, aprovado_em_utc = SYSUTCDATETIME()
            WHERE versao_questionario_id = ? AND aprovado_em_utc IS NULL
            """,
            actorUserId,
            questionnaireVersionId));
  }

  private void requireRequiredMigrations() {
    try {
      Integer applied =
          jdbcTemplate.queryForObject(
              """
              SELECT COUNT(*)
              FROM dbo.schema_migrations
              WHERE version IN ('V0003', 'V0005', 'V0007')
              """,
              Integer.class);
      if (applied == null || applied != 3) {
        throw unavailable();
      }
    } catch (DataAccessException exception) {
      throw unavailable();
    }
  }

  private static BaseCatalogRow baseCatalogRow(ResultSet resultSet, String identifierColumn)
      throws SQLException {
    return new BaseCatalogRow(
        resultSet.getObject(identifierColumn, UUID.class),
        resultSet.getString("nome"),
        resultSet.getBoolean("ativo"));
  }

  private static void requireOne(int affectedRows) {
    if (affectedRows != 1) {
      throw conflict("O recurso não está no estado esperado.");
    }
  }

  private static boolean matches2024Calculation(CalculationConfigurationRow row) {
    return "MEDIA_SIMPLES".equals(row.algorithm())
        && row.decimalPlaces() == 1
        && "HALF_UP".equals(row.roundingMode())
        && sameDecimal(row.minimumScore(), new BigDecimal("80.0"))
        && sameDecimal(row.maximumScore(), new BigDecimal("120.0"))
        && row.requiresEveryQuestion()
        && row.approvedAt() != null;
  }

  private static boolean sameDecimal(BigDecimal left, BigDecimal right) {
    return left != null && right != null && left.compareTo(right) == 0;
  }

  private static QuestionnaireAdministrationException conflict(String message) {
    return new QuestionnaireAdministrationException(
        QuestionnaireAdministrationException.Reason.CONFLICT, message);
  }

  private static QuestionnaireAdministrationException unavailable() {
    return new QuestionnaireAdministrationException(
        QuestionnaireAdministrationException.Reason.UNAVAILABLE,
        "A estrutura necessária para administrar questionários ainda não está disponível.");
  }

  private record BaseCatalogRow(UUID id, String name, boolean active) {}

  private record CompetencyVersionRow(UUID id, String name, String description) {}

  private record CalculationConfigurationRow(
      UUID id,
      String algorithm,
      int decimalPlaces,
      String roundingMode,
      BigDecimal minimumScore,
      BigDecimal maximumScore,
      boolean requiresEveryQuestion,
      Instant approvedAt) {}

  private record ClassificationMatrixRow(
      UUID id, UUID calculationConfigurationVersionId, Instant approvedAt) {}

  private record VersionedArtifact(UUID id, boolean created) {}

  private record ClassificationBand(
      int order,
      BigDecimal lowerLimit,
      BigDecimal upperLimit,
      String classification,
      String guidance) {}
}
