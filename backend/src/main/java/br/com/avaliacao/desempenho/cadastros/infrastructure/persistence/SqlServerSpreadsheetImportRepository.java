package br.com.avaliacao.desempenho.cadastros.infrastructure.persistence;

import br.com.avaliacao.desempenho.cadastros.application.SpreadsheetImportRepository;
import br.com.avaliacao.desempenho.cadastros.domain.model.AllocationImport;
import br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport.*;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.ObjectMapper;

@Repository
@ConditionalOnSqlServerPersistence
public class SqlServerSpreadsheetImportRepository implements SpreadsheetImportRepository {
  private final JdbcTemplate jdbc;
  private final ObjectMapper json;

  public SqlServerSpreadsheetImportRepository(JdbcTemplate jdbc, ObjectMapper json) {
    this.jdbc = jdbc;
    this.json = json;
  }

  @Override
  public Snapshot snapshot(Set<String> names, UUID cycleId, boolean lock) {
    // Apenas fragmento constante; nenhum texto do arquivo é interpolado em SQL.
    String hint = lock ? " WITH (UPDLOCK, HOLDLOCK) " : " ";
    Cycle cycle = null;
    if (cycleId != null) {
      List<Cycle> cycles =
          jdbc.query(
              "SELECT ciclo_avaliacao_id, codigo, nome FROM dbo.ciclo_avaliacao"
                  + hint
                  + "WHERE ciclo_avaliacao_id = ? AND situacao = 'RASCUNHO'",
              (rs, row) ->
                  new Cycle(
                      rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3), List.of()),
              cycleId);
      if (!cycles.isEmpty()) {
        List<Questionnaire> questionnaires =
            jdbc.query(
                "SELECT cq.ciclo_questionario_id, v.titulo FROM dbo.ciclo_questionario cq"
                    + hint
                    + "JOIN dbo.versao_questionario v ON v.versao_questionario_id = cq.versao_questionario_id "
                    + "WHERE cq.ciclo_avaliacao_id = ? ORDER BY cq.ciclo_questionario_id",
                (rs, row) -> new Questionnaire(rs.getObject(1, UUID.class), rs.getString(2)),
                cycleId);
        Cycle found = cycles.getFirst();
        cycle = new Cycle(found.id(), found.code(), found.name(), questionnaires);
      }
    }
    Map<String, List<Collaborator>> collaborators = new HashMap<>();
    jdbc.query(
        "SELECT n.[value], c.colaborador_id, c.ativo FROM dbo.colaborador c"
            + hint
            + "JOIN OPENJSON(?) n ON TRIM(REPLACE(REPLACE(c.nome_exibicao, NCHAR(160), N' '), NCHAR(8239), N' ')) COLLATE Latin1_General_100_CI_AI "
            + "= n.[value] COLLATE Latin1_General_100_CI_AI ORDER BY c.colaborador_id",
        rs -> {
          collaborators
              .computeIfAbsent(rs.getString(1), ignored -> new ArrayList<>())
              .add(new Collaborator(rs.getObject(2, UUID.class), rs.getBoolean(3)));
        },
        json.writeValueAsString(names));
    Map<UUID, UUID> assignments = new HashMap<>();
    if (cycleId != null) {
      jdbc.query(
          "SELECT a.colaborador_id, a.ciclo_questionario_id "
              + "FROM dbo.atribuicao_questionario_colaborador a"
              + hint
              + "WHERE a.ciclo_avaliacao_id = ? AND a.revogado_em_utc IS NULL "
              + "AND a.colaborador_id IN (SELECT TRY_CONVERT(uniqueidentifier, [value]) FROM OPENJSON(?))",
          rs -> {
            assignments.put(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class));
          },
          cycleId,
          json.writeValueAsString(
              collaborators.values().stream()
                  .flatMap(List::stream)
                  .map(Collaborator::id)
                  .toList()));
    }
    return new Snapshot(collaborators, cycle, assignments);
  }

  @Override
  public AllocationImport.Snapshot allocationSnapshot(
      Set<String> names, Set<String> branches, Set<String> areas, boolean lock) {
    var people = snapshot(names, null, lock).collaborators();
    var branchRecords = namedResources(branches, true, lock);
    var areaRecords = namedResources(areas, false, lock);
    Map<UUID, List<AllocationImport.Existing>> allocations = new HashMap<>();
    String hint = lock ? " WITH (UPDLOCK, HOLDLOCK) " : " ";
    jdbc.query(
        "SELECT colaborador_id, filial_id, area_id, gestor_texto_livre, inicio_vigencia, fim_vigencia, encerrado_em_utc "
            + "FROM dbo.lotacao_colaborador"
            + hint
            + "WHERE colaborador_id IN (SELECT TRY_CONVERT(uniqueidentifier, [value]) FROM OPENJSON(?))",
        rs -> {
          allocations
              .computeIfAbsent(rs.getObject(1, UUID.class), ignored -> new ArrayList<>())
              .add(
                  new AllocationImport.Existing(
                      rs.getObject(2, UUID.class),
                      rs.getObject(3, UUID.class),
                      rs.getString(4),
                      rs.getObject(5, java.time.LocalDate.class),
                      rs.getObject(6, java.time.LocalDate.class),
                      rs.getTimestamp(7) != null));
        },
        json.writeValueAsString(
            people.values().stream().flatMap(List::stream).map(Collaborator::id).toList()));
    return new AllocationImport.Snapshot(people, branchRecords, areaRecords, allocations);
  }

  private Map<String, List<AllocationImport.NamedResource>> namedResources(
      Set<String> names, boolean branch, boolean lock) {
    Map<String, List<AllocationImport.NamedResource>> result = new HashMap<>();
    if (names.isEmpty()) return result;
    // Identificadores vêm somente destas constantes; valores da planilha são parâmetros.
    String table = branch ? "dbo.filial" : "dbo.area";
    String id = branch ? "filial_id" : "area_id";
    String hint = lock ? " WITH (UPDLOCK, HOLDLOCK) " : " ";
    jdbc.query(
        "SELECT n.[value], r."
            + id
            + ", r.ativa FROM "
            + table
            + " r"
            + hint
            + "JOIN OPENJSON(?) n ON TRIM(REPLACE(REPLACE(r.nome, NCHAR(160), N' '), NCHAR(8239), N' ')) COLLATE Latin1_General_100_CI_AI "
            + "= n.[value] COLLATE Latin1_General_100_CI_AI",
        rs -> {
          result
              .computeIfAbsent(rs.getString(1), ignored -> new ArrayList<>())
              .add(
                  new AllocationImport.NamedResource(
                      rs.getObject(2, UUID.class), rs.getBoolean(3)));
        },
        json.writeValueAsString(names));
    return result;
  }
}
