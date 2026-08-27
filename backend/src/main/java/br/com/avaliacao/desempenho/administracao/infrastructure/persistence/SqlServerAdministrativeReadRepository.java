package br.com.avaliacao.desempenho.administracao.infrastructure.persistence;

import br.com.avaliacao.desempenho.administracao.application.AdministrativeReadException;
import br.com.avaliacao.desempenho.administracao.application.AdministrativeReadException.Reason;
import br.com.avaliacao.desempenho.administracao.application.AdministrativeReadRepository;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.SqlServerUtcDateTime;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Leitura JDBC parametrizada e minimizada para a administração. Não seleciona dados de credencial,
 * sessão, avaliação ou texto de avaliação.
 */
@Repository
@ConditionalOnSqlServerPersistence
public class SqlServerAdministrativeReadRepository implements AdministrativeReadRepository {

  static final String LIST_BRANCHES_SQL =
      """
      SELECT filial_id, nome, ativa
      FROM dbo.filial
      ORDER BY nome, filial_id
      """;

  static final String LIST_AREAS_SQL =
      """
      SELECT area_id, nome, ativa
      FROM dbo.area
      ORDER BY nome, area_id
      """;

  static final String LIST_COLLABORATORS_SQL =
      """
      SELECT colaborador_id, nome_exibicao, ativo
      FROM dbo.colaborador
      ORDER BY nome_exibicao, colaborador_id
      """;

  static final String LIST_ACTIVE_ALLOCATIONS_SQL =
      """
      SELECT lotacao_colaborador_id,
             colaborador_id,
             filial_id,
             area_id,
             gestor_texto_livre,
             inicio_vigencia
      FROM dbo.lotacao_colaborador
      WHERE encerrado_em_utc IS NULL
      ORDER BY colaborador_id, inicio_vigencia, lotacao_colaborador_id
      """;

  static final String LIST_ACTIVE_MANAGER_ASSIGNMENTS_SQL =
      """
      SELECT vinculo_gestor_colaborador_id,
             gestor_usuario_id,
             colaborador_id,
             inicio_vigencia
      FROM dbo.vinculo_gestor_colaborador
      WHERE revogado_em_utc IS NULL
      ORDER BY gestor_usuario_id, colaborador_id, vinculo_gestor_colaborador_id
      """;

  static final String LIST_ELIGIBLE_MANAGER_OPTIONS_SQL =
      """
      SELECT usuario.usuario_id,
             usuario.nome_exibicao
      FROM dbo.usuario AS usuario
      INNER JOIN dbo.atribuicao_papel AS atribuicao
          ON atribuicao.usuario_id = usuario.usuario_id
      INNER JOIN dbo.papel AS papel
          ON papel.papel_id = atribuicao.papel_id
      WHERE usuario.situacao = 'ATIVO'
        AND atribuicao.revogado_em_utc IS NULL
        AND papel.codigo = 'GESTOR'
        AND papel.ativo = 1
      ORDER BY usuario.nome_exibicao, usuario.usuario_id
      """;

  static final String LIST_ACTIVE_USER_OPTIONS_SQL =
      """
      SELECT usuario_id,
             nome_exibicao
      FROM dbo.usuario
      WHERE situacao = 'ATIVO'
      ORDER BY nome_exibicao, usuario_id
      """;

  static final String LIST_ACTIVE_COLLABORATOR_OPTIONS_SQL =
      """
      SELECT colaborador_id,
             nome_exibicao
      FROM dbo.colaborador
      WHERE ativo = 1
      ORDER BY nome_exibicao, colaborador_id
      """;

  static final String LIST_ACTIVE_USER_COLLABORATOR_LINKS_SQL =
      """
      SELECT vinculo_usuario_colaborador_id,
             usuario_id,
             colaborador_id,
             inicio_vigencia
      FROM dbo.vinculo_usuario_colaborador
      WHERE encerrado_em_utc IS NULL
      ORDER BY usuario_id, colaborador_id, vinculo_usuario_colaborador_id
      """;

  static final String LIST_ACTIVE_QUESTIONNAIRE_ASSIGNMENTS_SQL =
      """
      SELECT atribuicao.atribuicao_questionario_colaborador_id,
             atribuicao.ciclo_avaliacao_id,
             ciclo.codigo AS ciclo_codigo,
             ciclo.nome AS ciclo_nome,
             atribuicao.colaborador_id,
             atribuicao.ciclo_questionario_id,
             versao_questionario.titulo AS questionario_titulo
      FROM dbo.atribuicao_questionario_colaborador AS atribuicao
      INNER JOIN dbo.ciclo_avaliacao AS ciclo
          ON ciclo.ciclo_avaliacao_id = atribuicao.ciclo_avaliacao_id
      INNER JOIN dbo.ciclo_questionario AS ciclo_questionario
          ON ciclo_questionario.ciclo_questionario_id = atribuicao.ciclo_questionario_id
         AND ciclo_questionario.ciclo_avaliacao_id = atribuicao.ciclo_avaliacao_id
      INNER JOIN dbo.versao_questionario AS versao_questionario
          ON versao_questionario.versao_questionario_id
              = ciclo_questionario.versao_questionario_id
      WHERE atribuicao.revogado_em_utc IS NULL
      ORDER BY atribuicao.ciclo_avaliacao_id,
               atribuicao.colaborador_id,
               atribuicao.atribuicao_questionario_colaborador_id
      """;

  static final String LIST_QUESTIONNAIRE_ASSIGNMENT_OPTIONS_SQL =
      """
      SELECT ciclo.ciclo_avaliacao_id,
             ciclo.codigo AS ciclo_codigo,
             ciclo.nome AS ciclo_nome,
             ciclo_questionario.ciclo_questionario_id,
             versao_questionario.titulo AS questionario_titulo
      FROM dbo.ciclo_avaliacao AS ciclo
      INNER JOIN dbo.ciclo_questionario AS ciclo_questionario
          ON ciclo_questionario.ciclo_avaliacao_id = ciclo.ciclo_avaliacao_id
      INNER JOIN dbo.versao_questionario AS versao_questionario
          ON versao_questionario.versao_questionario_id
              = ciclo_questionario.versao_questionario_id
      WHERE ciclo.situacao = 'RASCUNHO'
      ORDER BY ciclo.codigo, ciclo.ciclo_avaliacao_id, ciclo_questionario.ciclo_questionario_id
      """;

  static final String LIST_APPROVED_QUESTIONNAIRE_VERSIONS_SQL =
      """
      SELECT versao.versao_questionario_id,
             questionario.codigo AS questionario_codigo,
             questionario.nome AS questionario_nome,
             versao.numero_versao,
             versao.titulo
      FROM dbo.versao_questionario AS versao
      INNER JOIN dbo.questionario AS questionario
          ON questionario.questionario_id = versao.questionario_id
      WHERE versao.aprovado_em_utc IS NOT NULL
      ORDER BY questionario.codigo, versao.numero_versao, versao.versao_questionario_id
      """;

  static final String LIST_APPROVED_CALCULATION_MATRIX_OPTIONS_SQL =
      """
      SELECT configuracao.configuracao_calculo_versao_id,
             configuracao.codigo AS configuracao_codigo,
             configuracao.numero_versao AS configuracao_numero_versao,
             matriz.matriz_classificacao_versao_id,
             matriz.codigo AS matriz_codigo,
             matriz.numero_versao AS matriz_numero_versao
      FROM dbo.configuracao_calculo_versao AS configuracao
      INNER JOIN dbo.matriz_classificacao_versao AS matriz
          ON matriz.configuracao_calculo_versao_id
              = configuracao.configuracao_calculo_versao_id
      WHERE configuracao.aprovado_em_utc IS NOT NULL
        AND matriz.aprovado_em_utc IS NOT NULL
      ORDER BY configuracao.codigo,
               configuracao.numero_versao,
               matriz.codigo,
               matriz.numero_versao,
               matriz.matriz_classificacao_versao_id
      """;

  static final String FIND_DRAFT_CYCLE_CONFIGURATION_SQL =
      """
      SELECT ciclo.ciclo_avaliacao_id,
             ciclo.codigo,
             ciclo.nome,
             ciclo.janela_abertura_em_utc,
             ciclo.janela_encerramento_em_utc,
             ciclo.fuso_horario_iana,
             ciclo.autoavaliacao_habilitada
      FROM dbo.ciclo_avaliacao AS ciclo
      WHERE ciclo.ciclo_avaliacao_id = ?
        AND ciclo.situacao = 'RASCUNHO'
      """;

  static final String LIST_DRAFT_CYCLE_QUESTIONNAIRES_SQL =
      """
      SELECT ciclo_questionario_id,
             versao_questionario_id,
             configuracao_calculo_versao_id,
             matriz_classificacao_versao_id
      FROM dbo.ciclo_questionario
      WHERE ciclo_avaliacao_id = ?
      ORDER BY ciclo_questionario_id
      """;

  private static final String[] REQUIRED_MIGRATIONS = {"V0003", "V0005", "V0007"};

  private final JdbcTemplate jdbcTemplate;

  public SqlServerAdministrativeReadRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "JdbcTemplate não pode ser nulo");
  }

  @Override
  public List<NamedResourceView> listBranches() {
    requireRequiredMigrations();
    return jdbcTemplate.query(
        LIST_BRANCHES_SQL,
        (resultSet, rowNumber) ->
            new NamedResourceView(
                resultSet.getObject("filial_id", UUID.class),
                resultSet.getString("nome"),
                resultSet.getBoolean("ativa")));
  }

  @Override
  public List<NamedResourceView> listAreas() {
    requireRequiredMigrations();
    return jdbcTemplate.query(
        LIST_AREAS_SQL,
        (resultSet, rowNumber) ->
            new NamedResourceView(
                resultSet.getObject("area_id", UUID.class),
                resultSet.getString("nome"),
                resultSet.getBoolean("ativa")));
  }

  @Override
  public List<CollaboratorView> listCollaborators() {
    requireRequiredMigrations();
    return jdbcTemplate.query(
        LIST_COLLABORATORS_SQL,
        (resultSet, rowNumber) ->
            new CollaboratorView(
                resultSet.getObject("colaborador_id", UUID.class),
                resultSet.getString("nome_exibicao"),
                resultSet.getBoolean("ativo")));
  }

  @Override
  public List<ActiveAllocationView> listActiveAllocations() {
    requireRequiredMigrations();
    return jdbcTemplate.query(
        LIST_ACTIVE_ALLOCATIONS_SQL,
        (resultSet, rowNumber) ->
            new ActiveAllocationView(
                resultSet.getObject("lotacao_colaborador_id", UUID.class),
                resultSet.getObject("colaborador_id", UUID.class),
                resultSet.getObject("filial_id", UUID.class),
                resultSet.getObject("area_id", UUID.class),
                resultSet.getString("gestor_texto_livre"),
                resultSet.getObject("inicio_vigencia", java.time.LocalDate.class)));
  }

  @Override
  public List<ActiveManagerAssignmentView> listActiveManagerAssignments() {
    requireRequiredMigrations();
    return jdbcTemplate.query(
        LIST_ACTIVE_MANAGER_ASSIGNMENTS_SQL,
        (resultSet, rowNumber) ->
            new ActiveManagerAssignmentView(
                resultSet.getObject("vinculo_gestor_colaborador_id", UUID.class),
                resultSet.getObject("gestor_usuario_id", UUID.class),
                resultSet.getObject("colaborador_id", UUID.class),
                resultSet.getObject("inicio_vigencia", java.time.LocalDate.class)));
  }

  @Override
  public List<SelectionOptionView> listEligibleManagerOptions() {
    requireRequiredMigrations();
    return jdbcTemplate.query(
        LIST_ELIGIBLE_MANAGER_OPTIONS_SQL,
        (resultSet, rowNumber) -> selectionOption(resultSet, "usuario_id"));
  }

  @Override
  public List<SelectionOptionView> listActiveUserOptions() {
    requireRequiredMigrations();
    return jdbcTemplate.query(
        LIST_ACTIVE_USER_OPTIONS_SQL,
        (resultSet, rowNumber) -> selectionOption(resultSet, "usuario_id"));
  }

  @Override
  public List<SelectionOptionView> listActiveCollaboratorOptions() {
    requireRequiredMigrations();
    return jdbcTemplate.query(
        LIST_ACTIVE_COLLABORATOR_OPTIONS_SQL,
        (resultSet, rowNumber) -> selectionOption(resultSet, "colaborador_id"));
  }

  @Override
  public List<ActiveUserCollaboratorLinkView> listActiveUserCollaboratorLinks() {
    requireRequiredMigrations();
    return jdbcTemplate.query(
        LIST_ACTIVE_USER_COLLABORATOR_LINKS_SQL,
        (resultSet, rowNumber) ->
            new ActiveUserCollaboratorLinkView(
                resultSet.getObject("vinculo_usuario_colaborador_id", UUID.class),
                resultSet.getObject("usuario_id", UUID.class),
                resultSet.getObject("colaborador_id", UUID.class),
                resultSet.getObject("inicio_vigencia", java.time.LocalDate.class)));
  }

  @Override
  public List<ActiveQuestionnaireAssignmentView> listActiveQuestionnaireAssignments() {
    requireRequiredMigrations();
    return jdbcTemplate.query(
        LIST_ACTIVE_QUESTIONNAIRE_ASSIGNMENTS_SQL,
        (resultSet, rowNumber) ->
            new ActiveQuestionnaireAssignmentView(
                resultSet.getObject("atribuicao_questionario_colaborador_id", UUID.class),
                resultSet.getObject("ciclo_avaliacao_id", UUID.class),
                resultSet.getString("ciclo_codigo"),
                resultSet.getString("ciclo_nome"),
                resultSet.getObject("colaborador_id", UUID.class),
                resultSet.getObject("ciclo_questionario_id", UUID.class),
                resultSet.getString("questionario_titulo")));
  }

  @Override
  public List<QuestionnaireAssignmentOptionView> listQuestionnaireAssignmentOptions() {
    requireRequiredMigrations();
    Map<UUID, QuestionnaireAssignmentOptions> optionsByCycle = new LinkedHashMap<>();
    jdbcTemplate.query(
        LIST_QUESTIONNAIRE_ASSIGNMENT_OPTIONS_SQL,
        resultSet -> {
          while (resultSet.next()) {
            UUID cycleId = resultSet.getObject("ciclo_avaliacao_id", UUID.class);
            String cycleCode = resultSet.getString("ciclo_codigo");
            String cycleName = resultSet.getString("ciclo_nome");
            QuestionnaireAssignmentOptions options =
                optionsByCycle.computeIfAbsent(
                    cycleId,
                    ignored -> new QuestionnaireAssignmentOptions(cycleId, cycleCode, cycleName));
            options
                .questionnaires()
                .add(
                    new AppliedQuestionnaireOptionView(
                        resultSet.getObject("ciclo_questionario_id", UUID.class),
                        resultSet.getString("questionario_titulo")));
          }
          return null;
        });
    return optionsByCycle.values().stream()
        .map(
            value ->
                new QuestionnaireAssignmentOptionView(
                    value.cycleId(), value.cycleCode(), value.cycleName(), value.questionnaires()))
        .toList();
  }

  @Override
  public List<ApprovedQuestionnaireVersionView> listApprovedQuestionnaireVersions() {
    requireRequiredMigrations();
    List<CalculationMatrixOptionView> configurationOptions =
        jdbcTemplate.query(
            LIST_APPROVED_CALCULATION_MATRIX_OPTIONS_SQL,
            (resultSet, rowNumber) -> calculationMatrixOption(resultSet));
    return jdbcTemplate.query(
        LIST_APPROVED_QUESTIONNAIRE_VERSIONS_SQL,
        (resultSet, rowNumber) ->
            new ApprovedQuestionnaireVersionView(
                resultSet.getObject("versao_questionario_id", UUID.class),
                resultSet.getString("questionario_codigo"),
                resultSet.getString("questionario_nome"),
                resultSet.getInt("numero_versao"),
                resultSet.getString("titulo"),
                configurationOptions));
  }

  @Override
  public Optional<DraftCycleConfigurationView> findDraftCycleConfiguration(UUID cycleId) {
    requireRequiredMigrations();
    List<DraftCycleBase> configurations =
        jdbcTemplate.query(
            FIND_DRAFT_CYCLE_CONFIGURATION_SQL,
            (resultSet, rowNumber) -> draftCycleBase(resultSet),
            cycleId);
    if (configurations.isEmpty()) {
      return Optional.empty();
    }
    DraftCycleBase configuration = configurations.getFirst();
    return Optional.of(
        new DraftCycleConfigurationView(
            configuration.cycleId(),
            configuration.code(),
            configuration.name(),
            configuration.openingAtUtc(),
            configuration.closingAtUtc(),
            configuration.timeZone(),
            configuration.selfAssessmentEnabled(),
            listDraftAppliedQuestionnaires(cycleId)));
  }

  private static DraftCycleBase draftCycleBase(ResultSet resultSet) throws SQLException {
    return new DraftCycleBase(
        resultSet.getObject("ciclo_avaliacao_id", UUID.class),
        resultSet.getString("codigo"),
        resultSet.getString("nome"),
        SqlServerUtcDateTime.read(resultSet, "janela_abertura_em_utc"),
        SqlServerUtcDateTime.read(resultSet, "janela_encerramento_em_utc"),
        resultSet.getString("fuso_horario_iana"),
        resultSet.getBoolean("autoavaliacao_habilitada"));
  }

  private List<DraftAppliedQuestionnaireView> listDraftAppliedQuestionnaires(UUID cycleId) {
    return jdbcTemplate.query(
        LIST_DRAFT_CYCLE_QUESTIONNAIRES_SQL,
        (resultSet, rowNumber) ->
            new DraftAppliedQuestionnaireView(
                resultSet.getObject("ciclo_questionario_id", UUID.class),
                resultSet.getObject("versao_questionario_id", UUID.class),
                resultSet.getObject("configuracao_calculo_versao_id", UUID.class),
                resultSet.getObject("matriz_classificacao_versao_id", UUID.class)),
        cycleId);
  }

  private static CalculationMatrixOptionView calculationMatrixOption(ResultSet resultSet)
      throws SQLException {
    return new CalculationMatrixOptionView(
        resultSet.getObject("configuracao_calculo_versao_id", UUID.class),
        resultSet.getString("configuracao_codigo"),
        resultSet.getInt("configuracao_numero_versao"),
        resultSet.getObject("matriz_classificacao_versao_id", UUID.class),
        resultSet.getString("matriz_codigo"),
        resultSet.getInt("matriz_numero_versao"));
  }

  private static SelectionOptionView selectionOption(ResultSet resultSet, String idColumn)
      throws SQLException {
    return new SelectionOptionView(
        resultSet.getObject(idColumn, UUID.class), resultSet.getString("nome_exibicao"));
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
      if (applied == null || applied != REQUIRED_MIGRATIONS.length) {
        throw unavailable();
      }
    } catch (DataAccessException exception) {
      throw unavailable();
    }
  }

  private static AdministrativeReadException unavailable() {
    return new AdministrativeReadException(
        Reason.UNAVAILABLE,
        "A estrutura necessária para leitura administrativa não está disponível.");
  }

  private record DraftCycleBase(
      UUID cycleId,
      String code,
      String name,
      java.time.Instant openingAtUtc,
      java.time.Instant closingAtUtc,
      String timeZone,
      boolean selfAssessmentEnabled) {}

  private record QuestionnaireAssignmentOptions(
      UUID cycleId,
      String cycleCode,
      String cycleName,
      List<AppliedQuestionnaireOptionView> questionnaires) {

    private QuestionnaireAssignmentOptions(UUID cycleId, String cycleCode, String cycleName) {
      this(cycleId, cycleCode, cycleName, new ArrayList<>());
    }
  }
}
