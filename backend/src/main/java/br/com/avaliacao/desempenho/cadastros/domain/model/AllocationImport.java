package br.com.avaliacao.desempenho.cadastros.domain.model;

import static br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport.*;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Importação cria lotações abertas; encerramentos e correções de histórico continuam individuais.
 */
public final class AllocationImport {
  private AllocationImport() {}

  public record Fields(String branch, String area, String manager, String startsOn) {}

  public record Resolved(Fields fields, UUID branchId, UUID areaId, LocalDate startsOn) {}

  public record NamedResource(UUID id, boolean active) {}

  public record Existing(
      UUID branchId,
      UUID areaId,
      String manager,
      LocalDate startsOn,
      LocalDate endsOn,
      boolean closed) {}

  public record Snapshot(
      Map<String, List<Collaborator>> collaborators,
      Map<String, List<NamedResource>> branches,
      Map<String, List<NamedResource>> areas,
      Map<UUID, List<Existing>> allocations) {}

  public static final DateTimeFormatter DATE =
      DateTimeFormatter.ofPattern("dd/MM/uuuu").withResolverStyle(ResolverStyle.STRICT);

  public static List<Row> review(List<SourceRow> source, Snapshot snapshot) {
    Set<String> names = new HashSet<>();
    Set<UUID> people = new HashSet<>();
    return source.stream().map(row -> reviewRow(row, snapshot, names, people)).toList();
  }

  private static Row reviewRow(SourceRow row, Snapshot data, Set<String> names, Set<UUID> people) {
    Fields fields = row.allocation();
    if (fields == null)
      return result(row, Status.ERROR, "Confira as cinco colunas de lotação.", null, null);
    if (!validText(row.name(), false)
        || !validText(fields.branch(), true)
        || !validText(fields.area(), true)
        || !validText(fields.manager(), true))
      return result(
          row,
          Status.ERROR,
          "Colaborador é obrigatório; nomes de colaborador, filial, área e gestor devem ter até 200 caracteres.",
          null,
          null);
    if (!names.add(key(row.name())))
      return result(
          row,
          Status.ERROR,
          "Colaborador repetido na planilha; confira uma lotação por pessoa.",
          null,
          null);
    LocalDate start;
    try {
      if (!fields.startsOn().matches("[0-9]{2}/[0-9]{2}/[0-9]{4}"))
        throw new DateTimeParseException("Data inválida", "", 0);
      start = LocalDate.parse(fields.startsOn(), DATE);
      if (start.getYear() < 1) throw new DateTimeParseException("Data inválida", "", 0);
    } catch (DateTimeParseException exception) {
      return result(
          row,
          Status.ERROR,
          "Informe Início da Lotação como data válida (dd/mm/aaaa), sem horário.",
          null,
          null);
    }
    List<Collaborator> matches = data.collaborators().getOrDefault(key(row.name()), List.of());
    if (matches.size() != 1)
      return result(
          row,
          Status.ERROR,
          matches.isEmpty()
              ? "Colaborador não encontrado. Importe os colaboradores primeiro."
              : "Nome ambíguo: há mais de um colaborador. Revise individualmente.",
          null,
          null);
    Collaborator person = matches.getFirst();
    if (!person.active())
      return result(
          row,
          Status.ERROR,
          "Colaborador inativo. Revise o cadastro antes de importar.",
          person.id(),
          null);
    if (!people.add(person.id()))
      return result(
          row,
          Status.ERROR,
          "Mais de uma linha corresponde ao mesmo colaborador.",
          person.id(),
          null);
    String branchProblem = resourceProblem(fields.branch(), data.branches(), "Filial");
    String areaProblem = resourceProblem(fields.area(), data.areas(), "Área");
    if (branchProblem != null || areaProblem != null)
      return result(
          row,
          Status.ERROR,
          branchProblem == null ? areaProblem : branchProblem,
          person.id(),
          null);
    var resolved =
        new Resolved(
            fields,
            resourceId(fields.branch(), data.branches()),
            resourceId(fields.area(), data.areas()),
            start);
    List<Existing> overlapping =
        data.allocations().getOrDefault(person.id(), List.of()).stream()
            .filter(item -> item.endsOn() == null || !item.endsOn().isBefore(start))
            .toList();
    if (overlapping.size() == 1) {
      Existing existing = overlapping.getFirst();
      if (!existing.closed()
          && existing.endsOn() == null
          && start.equals(existing.startsOn())
          && Objects.equals(existing.branchId(), resolved.branchId())
          && Objects.equals(existing.areaId(), resolved.areaId())
          && key(existing.manager()).equals(key(fields.manager())))
        return result(
            row,
            Status.EXISTS,
            "Lotação idêntica já cadastrada; será mantida.",
            person.id(),
            resolved);
    }
    if (!overlapping.isEmpty())
      return result(
          row,
          Status.ERROR,
          "Existe uma lotação que coincide com o período informado. Revise ou encerre individualmente antes de importar.",
          person.id(),
          resolved);
    return result(row, Status.CREATE, "Criar lotação.", person.id(), resolved);
  }

  private static boolean validText(String text, boolean optional) {
    String value = cleanText(text);
    return (optional || !value.isEmpty())
        && value.length() <= 200
        && value.codePoints().noneMatch(Character::isISOControl);
  }

  private static String resourceProblem(
      String name, Map<String, List<NamedResource>> resources, String label) {
    if (cleanText(name).isEmpty()) return null;
    List<NamedResource> matches = resources.getOrDefault(key(name), List.of());
    if (matches.size() != 1)
      return label
          + (matches.isEmpty()
              ? " não encontrada. Cadastre antes de importar."
              : " ambígua. Revise os cadastros existentes.");
    return matches.getFirst().active()
        ? null
        : label + " inativa. Revise o cadastro antes de importar.";
  }

  private static UUID resourceId(String name, Map<String, List<NamedResource>> resources) {
    return cleanText(name).isEmpty() ? null : resources.get(key(name)).getFirst().id();
  }

  private static Row result(
      SourceRow row, Status status, String message, UUID person, Resolved resolved) {
    return new Row(
        row.line(),
        cleanText(row.name()),
        "",
        status,
        message,
        person,
        null,
        resolved != null ? resolved : new Resolved(row.allocation(), null, null, null));
  }
}
