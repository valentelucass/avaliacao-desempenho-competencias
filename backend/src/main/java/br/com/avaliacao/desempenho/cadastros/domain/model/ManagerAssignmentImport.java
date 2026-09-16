package br.com.avaliacao.desempenho.cadastros.domain.model;

import static br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport.*;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Um vínculo concede escopo de avaliação; não substitui nem encerra relações existentes. */
public final class ManagerAssignmentImport {
  private ManagerAssignmentImport() {}

  public record Fields(String manager, String startsOn) {}

  public record Resolved(Fields fields, UUID managerUserId, LocalDate startsOn) {}

  public record Existing(
      UUID managerUserId, LocalDate startsOn, LocalDate endsOn, boolean closed) {}

  public record Snapshot(
      Map<String, List<Collaborator>> collaborators,
      Map<String, List<UUID>> managers,
      Map<UUID, List<Existing>> assignments) {}

  public static List<Row> review(List<SourceRow> rows, Snapshot data) {
    Set<String> names = new HashSet<>();
    Set<UUID> people = new HashSet<>();
    return rows.stream().map(row -> reviewRow(row, data, names, people)).toList();
  }

  private static Row reviewRow(SourceRow row, Snapshot data, Set<String> names, Set<UUID> people) {
    Fields fields = row.managerAssignment();
    if (fields == null || !validText(row.name()) || !validText(fields.manager()))
      return result(
          row,
          Status.ERROR,
          "Informe conta avaliadora e colaborador com nomes de até 200 caracteres.",
          null,
          null);
    if (!names.add(key(row.name())))
      return result(
          row,
          Status.ERROR,
          "Colaborador repetido na planilha; mantenha um único vínculo por pessoa.",
          null,
          null);
    LocalDate startsOn;
    try {
      if (fields.startsOn() == null || !fields.startsOn().matches("[0-9]{2}/[0-9]{2}/[0-9]{4}"))
        throw new DateTimeParseException("Data inválida", "", 0);
      startsOn = LocalDate.parse(fields.startsOn(), AllocationImport.DATE);
      if (startsOn.getYear() < 1) throw new DateTimeParseException("Data inválida", "", 0);
    } catch (DateTimeParseException exception) {
      return result(
          row,
          Status.ERROR,
          "Informe Início como data válida (dd/mm/aaaa), sem horário.",
          null,
          null);
    }
    var collaborators = data.collaborators().getOrDefault(key(row.name()), List.of());
    if (collaborators.size() != 1)
      return result(
          row,
          Status.ERROR,
          collaborators.isEmpty()
              ? "Colaborador não encontrado. Cadastre antes de importar."
              : "Nome de colaborador ambíguo. Use o vínculo individual.",
          null,
          null);
    var collaborator = collaborators.getFirst();
    if (!collaborator.active())
      return result(
          row,
          Status.ERROR,
          "Colaborador inativo. Reative o cadastro e confira novamente.",
          collaborator.id(),
          null);
    if (!people.add(collaborator.id()))
      return result(
          row,
          Status.ERROR,
          "Mais de uma linha corresponde ao mesmo colaborador.",
          collaborator.id(),
          null);
    var managers = data.managers().getOrDefault(key(fields.manager()), List.of());
    if (managers.size() != 1)
      return result(
          row,
          Status.ERROR,
          managers.isEmpty()
              ? "Conta avaliadora não disponível. Use o nome de uma conta ativa de Gestor ou RH da lista desta tela."
              : "Nome de conta avaliadora ambíguo. Use o vínculo individual.",
          collaborator.id(),
          null);
    var resolved = new Resolved(fields, managers.getFirst(), startsOn);
    var existing = data.assignments().getOrDefault(collaborator.id(), List.of());
    var conflicts =
        existing.stream()
            .filter(
                item ->
                    !item.closed() || item.endsOn() == null || !item.endsOn().isBefore(startsOn))
            .toList();
    if (conflicts.size() == 1) {
      var current = conflicts.getFirst();
      if (!current.closed()
          && current.endsOn() == null
          && current.managerUserId().equals(resolved.managerUserId())
          && startsOn.equals(current.startsOn()))
        return result(
            row,
            Status.EXISTS,
            "Vínculo idêntico já cadastrado; será mantido.",
            collaborator.id(),
            resolved);
    }
    if (!conflicts.isEmpty())
      return result(
          row,
          Status.ERROR,
          "Existe vínculo ativo ou período conflitante. Revise ou encerre individualmente antes de importar.",
          collaborator.id(),
          resolved);
    return result(
        row, Status.CREATE, "Criar vínculo gestor-colaborador.", collaborator.id(), resolved);
  }

  private static boolean validText(String text) {
    String value = cleanText(text);
    return !value.isEmpty()
        && value.length() <= 200
        && value.codePoints().noneMatch(Character::isISOControl);
  }

  private static Row result(
      SourceRow row, Status status, String message, UUID collaborator, Resolved resolved) {
    return new Row(
        row.line(),
        cleanText(row.name()),
        "",
        status,
        message,
        collaborator,
        null,
        null,
        resolved == null ? new Resolved(row.managerAssignment(), null, null) : resolved);
  }
}
