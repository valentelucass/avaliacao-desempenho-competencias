package br.com.avaliacao.desempenho.cadastros.domain.model;

import java.text.Normalizer;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Regras de conferência dos modelos aprovados; filial não participa da atribuição. */
public final class SpreadsheetImport {
  private SpreadsheetImport() {}

  public enum Kind {
    COLLABORATORS,
    ASSIGNMENTS,
    ALLOCATIONS,
    MANAGER_ASSIGNMENTS
  }

  public enum Status {
    CREATE,
    EXISTS,
    ERROR
  }

  public record SourceRow(
      int line,
      String name,
      String cycle,
      String questionnaire,
      AllocationImport.Fields allocation,
      ManagerAssignmentImport.Fields managerAssignment) {
    public SourceRow(
        int line,
        String name,
        String cycle,
        String questionnaire,
        AllocationImport.Fields allocation) {
      this(line, name, cycle, questionnaire, allocation, null);
    }

    public SourceRow(int line, String name, String cycle, String questionnaire) {
      this(line, name, cycle, questionnaire, null);
    }
  }

  public record Collaborator(UUID id, boolean active) {}

  public record Questionnaire(UUID id, String title) {}

  public record Cycle(UUID id, String code, String name, List<Questionnaire> questionnaires) {}

  public record Snapshot(
      Map<String, List<Collaborator>> collaborators, Cycle cycle, Map<UUID, UUID> assignments) {}

  public record Row(
      int line,
      String name,
      String questionnaire,
      Status status,
      String message,
      UUID collaboratorId,
      UUID questionnaireId,
      AllocationImport.Resolved allocation,
      ManagerAssignmentImport.Resolved managerAssignment) {
    public Row(
        int line,
        String name,
        String questionnaire,
        Status status,
        String message,
        UUID collaboratorId,
        UUID questionnaireId,
        AllocationImport.Resolved allocation) {
      this(
          line,
          name,
          questionnaire,
          status,
          message,
          collaboratorId,
          questionnaireId,
          allocation,
          null);
    }

    public Row(
        int line,
        String name,
        String questionnaire,
        Status status,
        String message,
        UUID collaboratorId,
        UUID questionnaireId) {
      this(line, name, questionnaire, status, message, collaboratorId, questionnaireId, null);
    }
  }

  public static String cleanText(String value) {
    return value == null ? "" : value.replace('\u00a0', ' ').replace('\u202f', ' ').strip();
  }

  public static String key(String value) {
    return Normalizer.normalize(cleanText(value), Normalizer.Form.NFD)
        .replaceAll("\\p{M}", "")
        .toUpperCase(Locale.ROOT);
  }

  public static List<Row> review(Kind kind, List<SourceRow> source, Snapshot snapshot) {
    Set<String> seen = new HashSet<>();
    return source.stream().map(row -> reviewRow(kind, row, snapshot, seen)).toList();
  }

  private static Row reviewRow(Kind kind, SourceRow row, Snapshot data, Set<String> seen) {
    String name = cleanText(row.name());
    if (name.isBlank()
        || name.length() > 200
        || name.codePoints().anyMatch(Character::isISOControl))
      return result(row, Status.ERROR, "Informe um nome de até 200 caracteres.", null, null);
    if (!seen.add(key(name)))
      return result(
          row, Status.ERROR, "Nome repetido nesta planilha; remova a repetição.", null, null);
    List<Collaborator> matches = data.collaborators().getOrDefault(key(name), List.of());
    if (matches.size() > 1)
      return result(
          row,
          Status.ERROR,
          "Nome ambíguo: há mais de um cadastro. Use o cadastro individual.",
          null,
          null);
    Collaborator person = matches.isEmpty() ? null : matches.getFirst();
    if (person != null && !person.active())
      return result(
          row,
          Status.ERROR,
          "Colaborador inativo. Revise o cadastro antes de importar.",
          person.id(),
          null);
    if (kind == Kind.COLLABORATORS)
      return result(
          row,
          person == null ? Status.CREATE : Status.EXISTS,
          person == null ? "Criar colaborador." : "Colaborador já cadastrado; será mantido.",
          person == null ? null : person.id(),
          null);
    Cycle cycle = data.cycle();
    if (cycle == null)
      return result(
          row,
          Status.ERROR,
          "Selecione um ciclo em rascunho com questionários aplicados.",
          null,
          null);
    String label = key(row.cycle());
    if (!label.equals(key(cycle.code()))
        && !label.equals(key(cycle.name()))
        && !label.equals(key(cycle.code() + " — " + cycle.name()))
        && !label.equals(key(cycle.code() + " - " + cycle.name())))
      return result(row, Status.ERROR, "O ciclo da linha difere do ciclo selecionado.", null, null);
    if (person == null)
      return result(
          row,
          Status.ERROR,
          "Colaborador não encontrado. Importe os colaboradores primeiro.",
          null,
          null);
    List<Questionnaire> questionnaires =
        cycle.questionnaires().stream()
            .filter(item -> key(item.title()).equals(key(row.questionnaire())))
            .toList();
    if (questionnaires.isEmpty())
      return result(
          row,
          Status.ERROR,
          "Questionário não aplicado ao ciclo selecionado. Confira o título na planilha e os questionários do ciclo em Administração de ciclos.",
          person.id(),
          null);
    if (questionnaires.size() > 1)
      return result(
          row,
          Status.ERROR,
          "Há mais de um questionário com este título no ciclo. Revise as combinações em Administração de ciclos ou use a atribuição individual.",
          person.id(),
          null);
    UUID questionnaireId = questionnaires.getFirst().id();
    UUID existing = data.assignments().get(person.id());
    if (existing != null && !existing.equals(questionnaireId))
      return result(
          row,
          Status.ERROR,
          "Já existe uma atribuição para outro questionário; revise individualmente.",
          person.id(),
          questionnaireId);
    return result(
        row,
        existing == null ? Status.CREATE : Status.EXISTS,
        existing == null ? "Criar atribuição." : "Atribuição já cadastrada; será mantida.",
        person.id(),
        questionnaireId);
  }

  private static Row result(
      SourceRow row, Status status, String message, UUID person, UUID questionnaire) {
    return new Row(
        row.line(),
        cleanText(row.name()),
        row.questionnaire(),
        status,
        message,
        person,
        questionnaire);
  }
}
