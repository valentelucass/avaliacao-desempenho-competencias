package br.com.avaliacao.desempenho.ciclosavaliacao.infrastructure.persistence;

import br.com.avaliacao.desempenho.ciclosavaliacao.application.EvaluationCycleReadRepository;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleReadScope;
import br.com.avaliacao.desempenho.ciclosavaliacao.domain.model.EvaluationCycleStatus;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Leitura JDBC parametrizada para o schema formado pelas migrations V0003, V0005 e V0007.
 *
 * <p>Para gestor e colaborador, a consulta só retorna ciclos com atribuição de questionário ativa e
 * vínculo atualmente ativo. Assim, uma associação de ciclo não concede acesso sem escopo.
 */
public final class SqlServerEvaluationCycleReadRepository implements EvaluationCycleReadRepository {

  private static final int MAXIMUM_PAGE_LIMIT = 100;

  private final JdbcTemplate jdbcTemplate;

  public SqlServerEvaluationCycleReadRepository(JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = Objects.requireNonNull(jdbcTemplate, "JdbcTemplate não pode ser nulo");
  }

  @Override
  public EvaluationCyclePage listAccessible(
      UUID actorUserId, EvaluationCycleReadScope scope, int fetchLimit, UUID cursor) {
    UUID actor = Objects.requireNonNull(actorUserId, "ator não pode ser nulo");
    EvaluationCycleReadScope requestedScope =
        Objects.requireNonNull(scope, "escopo não pode ser nulo");
    if (fetchLimit < 1 || fetchLimit > MAXIMUM_PAGE_LIMIT) {
      throw new IllegalArgumentException("O limite de paginação está fora do intervalo permitido.");
    }

    List<EvaluationCycleView> rows =
        jdbcTemplate.query(
            listSql(requestedScope, cursor != null),
            (resultSet, rowNumber) -> mapCycle(resultSet),
            listArguments(actor, requestedScope, fetchLimit, cursor));

    if (rows.size() <= fetchLimit) {
      return new EvaluationCyclePage(rows, null);
    }

    List<EvaluationCycleView> items = List.copyOf(rows.subList(0, fetchLimit));
    return new EvaluationCyclePage(items, items.get(items.size() - 1).id());
  }

  @Override
  public Optional<AppliedQuestionnaireView> findAppliedQuestionnaireAccessible(
      UUID cycleId, UUID cycleQuestionnaireId, UUID actorUserId, EvaluationCycleReadScope scope) {
    UUID requestedCycleId = Objects.requireNonNull(cycleId, "ciclo não pode ser nulo");
    UUID requestedCycleQuestionnaireId =
        Objects.requireNonNull(cycleQuestionnaireId, "questionário aplicado não pode ser nulo");
    UUID actor = Objects.requireNonNull(actorUserId, "ator não pode ser nulo");
    EvaluationCycleReadScope requestedScope =
        Objects.requireNonNull(scope, "escopo não pode ser nulo");

    List<QuestionnaireRow> rows =
        jdbcTemplate.query(
            questionnaireSql(requestedScope),
            (resultSet, rowNumber) -> mapQuestionnaireRow(resultSet),
            questionnaireArguments(
                requestedCycleId, requestedCycleQuestionnaireId, actor, requestedScope));
    return rows.isEmpty() ? Optional.empty() : Optional.of(foldQuestionnaire(rows));
  }

  static String listSql(EvaluationCycleReadScope scope, boolean hasCursor) {
    return """
        SELECT TOP (?)
               ciclo.ciclo_avaliacao_id,
               ciclo.nome,
               ciclo.situacao
        FROM dbo.ciclo_avaliacao AS ciclo
        WHERE 1 = 1
        """
        + visibilityPredicate(scope, "ciclo", null)
        + (hasCursor ? "\n  AND ciclo.ciclo_avaliacao_id > ?" : "")
        + """

        ORDER BY ciclo.ciclo_avaliacao_id ASC
        """;
  }

  static String questionnaireSql(EvaluationCycleReadScope scope) {
    return """
        SELECT ciclo_questionario.ciclo_questionario_id,
               ciclo_questionario.versao_questionario_id,
               questionario.codigo AS questionario_codigo,
               versao_questionario.numero_versao AS numero_versao_questionario,
               versao_questionario.titulo AS titulo_questionario,
               competencia.competencia_id,
               versao_competencia.nome AS nome_competencia,
               pergunta.pergunta_questionario_id,
               pergunta.texto AS texto_pergunta,
               pergunta.descricao AS descricao_pergunta,
               pergunta.obrigatoria,
               opcao.opcao_resposta_id,
               opcao.rotulo AS rotulo_opcao
        FROM dbo.ciclo_questionario AS ciclo_questionario
        INNER JOIN dbo.ciclo_avaliacao AS ciclo
            ON ciclo.ciclo_avaliacao_id = ciclo_questionario.ciclo_avaliacao_id
        INNER JOIN dbo.versao_questionario AS versao_questionario
            ON versao_questionario.versao_questionario_id = ciclo_questionario.versao_questionario_id
        INNER JOIN dbo.questionario AS questionario
            ON questionario.questionario_id = versao_questionario.questionario_id
        LEFT JOIN dbo.questionario_competencia AS questionario_competencia
            ON questionario_competencia.versao_questionario_id = ciclo_questionario.versao_questionario_id
        LEFT JOIN dbo.versao_competencia AS versao_competencia
            ON versao_competencia.versao_competencia_id = questionario_competencia.versao_competencia_id
        LEFT JOIN dbo.competencia AS competencia
            ON competencia.competencia_id = versao_competencia.competencia_id
        LEFT JOIN dbo.pergunta_questionario AS pergunta
            ON pergunta.questionario_competencia_id = questionario_competencia.questionario_competencia_id
        LEFT JOIN dbo.opcao_resposta AS opcao
            ON opcao.versao_questionario_id = ciclo_questionario.versao_questionario_id
        WHERE ciclo_questionario.ciclo_avaliacao_id = ?
          AND ciclo_questionario.ciclo_questionario_id = ?
          AND versao_questionario.aprovado_em_utc IS NOT NULL
        """
        + visibilityPredicate(scope, "ciclo", "ciclo_questionario")
        + """

        ORDER BY questionario_competencia.ordem ASC,
                 pergunta.ordem ASC,
                 opcao.ordem ASC
        """;
  }

  private static String visibilityPredicate(
      EvaluationCycleReadScope scope, String cycleAlias, String cycleQuestionnaireAlias) {
    EvaluationCycleReadScope requestedScope =
        Objects.requireNonNull(scope, "escopo não pode ser nulo");
    if (requestedScope.allCycles()) {
      return "";
    }

    List<String> predicates = new ArrayList<>();
    if (requestedScope.managedCollaborators()) {
      predicates.add(managerAssignmentPredicate(cycleAlias, cycleQuestionnaireAlias));
    }
    if (requestedScope.ownCollaborator()) {
      predicates.add(ownAssignmentPredicate(cycleAlias, cycleQuestionnaireAlias));
    }

    return """

          AND %s.situacao IN ('ABERTO', 'ENCERRADO')
          AND (
        %s
          )
        """
        .formatted(cycleAlias, String.join("\n          OR ", predicates));
  }

  private static String managerAssignmentPredicate(
      String cycleAlias, String cycleQuestionnaireAlias) {
    return """
        EXISTS (
            SELECT 1
            FROM dbo.atribuicao_questionario_colaborador AS atribuicao
            INNER JOIN dbo.vinculo_gestor_colaborador AS vinculo_gestor
                ON vinculo_gestor.colaborador_id = atribuicao.colaborador_id
            WHERE atribuicao.ciclo_avaliacao_id = %s.ciclo_avaliacao_id
        %s
              AND atribuicao.revogado_em_utc IS NULL
              AND vinculo_gestor.gestor_usuario_id = ?
              AND vinculo_gestor.revogado_em_utc IS NULL
              AND (
                  vinculo_gestor.inicio_vigencia IS NULL
                  OR vinculo_gestor.inicio_vigencia <= CONVERT(date, SYSUTCDATETIME())
              )
              AND (
                  vinculo_gestor.fim_vigencia IS NULL
                  OR vinculo_gestor.fim_vigencia >= CONVERT(date, SYSUTCDATETIME())
              )
        )
        """
        .formatted(cycleAlias, assignmentQuestionnairePredicate(cycleQuestionnaireAlias));
  }

  private static String ownAssignmentPredicate(String cycleAlias, String cycleQuestionnaireAlias) {
    return """
        EXISTS (
            SELECT 1
            FROM dbo.atribuicao_questionario_colaborador AS atribuicao
            INNER JOIN dbo.vinculo_usuario_colaborador AS vinculo_usuario
                ON vinculo_usuario.colaborador_id = atribuicao.colaborador_id
            WHERE atribuicao.ciclo_avaliacao_id = %s.ciclo_avaliacao_id
        %s
              AND atribuicao.revogado_em_utc IS NULL
              AND %s.autoavaliacao_habilitada = 1
              AND vinculo_usuario.usuario_id = ?
              AND vinculo_usuario.encerrado_em_utc IS NULL
              AND vinculo_usuario.inicio_vigencia <= CONVERT(date, SYSUTCDATETIME())
              AND (
                  vinculo_usuario.fim_vigencia IS NULL
                  OR vinculo_usuario.fim_vigencia >= CONVERT(date, SYSUTCDATETIME())
              )
        )
        """
        .formatted(
            cycleAlias, assignmentQuestionnairePredicate(cycleQuestionnaireAlias), cycleAlias);
  }

  private static String assignmentQuestionnairePredicate(String cycleQuestionnaireAlias) {
    return cycleQuestionnaireAlias == null
        ? ""
        : "      AND atribuicao.ciclo_questionario_id = "
            + cycleQuestionnaireAlias
            + ".ciclo_questionario_id";
  }

  private static Object[] listArguments(
      UUID actorUserId, EvaluationCycleReadScope scope, int limit, UUID cursor) {
    List<Object> arguments = new ArrayList<>();
    arguments.add(limit + 1);
    appendScopeArguments(arguments, actorUserId, scope);
    if (cursor != null) {
      arguments.add(cursor);
    }
    return arguments.toArray();
  }

  private static Object[] questionnaireArguments(
      UUID cycleId, UUID cycleQuestionnaireId, UUID actorUserId, EvaluationCycleReadScope scope) {
    List<Object> arguments = new ArrayList<>();
    arguments.add(cycleId);
    arguments.add(cycleQuestionnaireId);
    appendScopeArguments(arguments, actorUserId, scope);
    return arguments.toArray();
  }

  private static void appendScopeArguments(
      List<Object> arguments, UUID actorUserId, EvaluationCycleReadScope scope) {
    if (scope.allCycles()) {
      return;
    }
    if (scope.managedCollaborators()) {
      arguments.add(actorUserId);
    }
    if (scope.ownCollaborator()) {
      arguments.add(actorUserId);
    }
  }

  private static EvaluationCycleView mapCycle(ResultSet resultSet) throws SQLException {
    return new EvaluationCycleView(
        resultSet.getObject("ciclo_avaliacao_id", UUID.class),
        resultSet.getString("nome"),
        mapStatus(resultSet.getString("situacao")));
  }

  private static QuestionnaireRow mapQuestionnaireRow(ResultSet resultSet) throws SQLException {
    return new QuestionnaireRow(
        resultSet.getObject("ciclo_questionario_id", UUID.class),
        resultSet.getObject("versao_questionario_id", UUID.class),
        resultSet.getString("questionario_codigo"),
        resultSet.getInt("numero_versao_questionario"),
        resultSet.getString("titulo_questionario"),
        resultSet.getObject("competencia_id", UUID.class),
        resultSet.getString("nome_competencia"),
        resultSet.getObject("pergunta_questionario_id", UUID.class),
        resultSet.getString("texto_pergunta"),
        resultSet.getString("descricao_pergunta"),
        resultSet.getObject("obrigatoria", Boolean.class),
        resultSet.getObject("opcao_resposta_id", UUID.class),
        resultSet.getString("rotulo_opcao"));
  }

  private static AppliedQuestionnaireView foldQuestionnaire(List<QuestionnaireRow> rows) {
    QuestionnaireRow first = rows.getFirst();
    Map<UUID, MutableCompetency> competencies = new LinkedHashMap<>();
    for (QuestionnaireRow row : rows) {
      if (row.competencyId() == null) {
        continue;
      }

      MutableCompetency competency =
          competencies.computeIfAbsent(
              row.competencyId(),
              ignored -> new MutableCompetency(row.competencyId(), row.competencyName()));
      if (row.questionId() == null) {
        continue;
      }

      MutableQuestion question =
          competency.questions.computeIfAbsent(
              row.questionId(),
              ignored ->
                  new MutableQuestion(
                      row.questionId(),
                      row.questionText(),
                      row.questionDescription(),
                      Boolean.TRUE.equals(row.required())));
      if (row.optionId() != null) {
        question.options.add(new OptionView(row.optionId(), row.optionLabel()));
      }
    }

    List<CompetencyView> competencyViews =
        competencies.values().stream().map(MutableCompetency::toView).toList();
    return new AppliedQuestionnaireView(
        first.cycleQuestionnaireId(),
        first.questionnaireVersionId(),
        first.questionnaireCode(),
        first.questionnaireVersionNumber(),
        first.questionnaireTitle(),
        competencyViews);
  }

  private static EvaluationCycleStatus mapStatus(String persistedValue) {
    try {
      return EvaluationCycleStatus.valueOf(persistedValue);
    } catch (IllegalArgumentException | NullPointerException exception) {
      throw new IllegalStateException("Situação de ciclo persistida inválida.", exception);
    }
  }

  private record QuestionnaireRow(
      UUID cycleQuestionnaireId,
      UUID questionnaireVersionId,
      String questionnaireCode,
      int questionnaireVersionNumber,
      String questionnaireTitle,
      UUID competencyId,
      String competencyName,
      UUID questionId,
      String questionText,
      String questionDescription,
      Boolean required,
      UUID optionId,
      String optionLabel) {}

  private static final class MutableCompetency {

    private final UUID id;
    private final String name;
    private final Map<UUID, MutableQuestion> questions = new LinkedHashMap<>();

    private MutableCompetency(UUID id, String name) {
      this.id = id;
      this.name = name;
    }

    private CompetencyView toView() {
      return new CompetencyView(
          id, name, questions.values().stream().map(MutableQuestion::toView).toList());
    }
  }

  private static final class MutableQuestion {

    private final UUID id;
    private final String text;
    private final String description;
    private final boolean required;
    private final List<OptionView> options = new ArrayList<>();

    private MutableQuestion(UUID id, String text, String description, boolean required) {
      this.id = id;
      this.text = text;
      this.description = description;
      this.required = required;
    }

    private QuestionView toView() {
      return new QuestionView(id, text, description, required, options);
    }
  }
}
