package br.com.avaliacao.desempenho.cadastros.application;

import static br.com.avaliacao.desempenho.cadastros.application.SpreadsheetImportException.Reason.*;

import br.com.avaliacao.desempenho.cadastros.domain.model.AllocationImport;
import br.com.avaliacao.desempenho.cadastros.domain.model.ManagerAssignmentImport;
import br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport;
import br.com.avaliacao.desempenho.cadastros.domain.model.SpreadsheetImport.*;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Semaphore;
import java.util.stream.Collectors;
import org.springframework.dao.DataAccessException;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Prévia temporária por ator e confirmação atômica; nenhum arquivo é mantido em disco. */
@Service
@EnableScheduling
@ConditionalOnSqlServerPersistence
public class SpreadsheetImportService {
  public record Preview(UUID id, Instant expiresAt, List<Row> rows) {}

  public record Result(int created, int existing) {}

  private record Window(Instant until, int count) {}

  private static final class Pending {
    final UUID actor;
    final Kind kind;
    final UUID cycleId;
    final List<SourceRow> source;
    final Preview preview;
    Result result;

    Pending(UUID actor, Kind kind, UUID cycleId, List<SourceRow> source, Preview preview) {
      this.actor = actor;
      this.kind = kind;
      this.cycleId = cycleId;
      this.source = source;
      this.preview = preview;
    }
  }

  private final SpreadsheetReader reader;
  private final SpreadsheetImportRepository repository;
  private final MasterDataApplicationService writes;
  private final TransactionTemplate transaction;
  private final Clock clock;
  private final Map<UUID, Pending> pending = new HashMap<>();
  private final Map<UUID, Window> windows = new HashMap<>();
  private final Semaphore processing = new Semaphore(2);

  public SpreadsheetImportService(
      SpreadsheetReader reader,
      SpreadsheetImportRepository repository,
      MasterDataApplicationService writes,
      TransactionTemplate transaction,
      Clock clock) {
    this.reader = reader;
    this.repository = repository;
    this.writes = writes;
    this.transaction = transaction;
    this.clock = clock;
  }

  /** Chamado antes da leitura do corpo. Limita inclusive uploads inválidos. */
  public synchronized void admit(UUID actor) {
    expire();
    Instant now = clock.instant();
    Window old = windows.get(actor);
    if ((old != null && old.count() >= 10) || (old == null && windows.size() >= 1000))
      throw new SpreadsheetImportException(RATE_LIMITED);
    windows.put(
        actor,
        new Window(
            old == null ? now.plusSeconds(60) : old.until(), old == null ? 1 : old.count() + 1));
  }

  public Preview preview(Kind kind, UUID cycleId, byte[] bytes, UUID actor) {
    if (!processing.tryAcquire()) throw new SpreadsheetImportException(RATE_LIMITED);
    try {
      return prepare(kind, cycleId, bytes, actor);
    } finally {
      processing.release();
    }
  }

  private Preview prepare(Kind kind, UUID cycleId, byte[] bytes, UUID actor) {
    if ((kind == Kind.ASSIGNMENTS) != (cycleId != null))
      throw new SpreadsheetImportException(INVALID_FILE);
    List<SourceRow> source = reader.read(bytes, kind);
    List<Row> rows = review(kind, source, cycleId, false);
    Preview preview =
        new Preview(UUID.randomUUID(), clock.instant().plus(Duration.ofMinutes(15)), rows);
    synchronized (this) {
      expire();
      if (pending.size() >= 32
          || pending.values().stream().filter(item -> item.actor.equals(actor)).count() >= 4)
        throw new SpreadsheetImportException(RATE_LIMITED);
      pending.put(preview.id(), new Pending(actor, kind, cycleId, source, preview));
    }
    return preview;
  }

  public Result confirm(UUID id, MasterDataCommandContext context) {
    return confirm(id, context, null);
  }

  public Result confirm(UUID id, MasterDataCommandContext context, Kind requiredKind) {
    Pending item;
    synchronized (this) {
      expire();
      item = pending.get(id);
      if (item == null
          || !item.actor.equals(context.actorUserId())
          || !matchesKind(item, requiredKind)) throw new SpreadsheetImportException(EXPIRED);
    }
    synchronized (item) {
      if (!item.preview.expiresAt().isAfter(clock.instant()))
        throw new SpreadsheetImportException(EXPIRED);
      if (item.result != null) return item.result;
      try {
        Result result =
            transaction.execute(
                status -> {
                  List<Row> rows = review(item.kind, item.source, item.cycleId, true);
                  if (!rows.equals(item.preview.rows())
                      || rows.stream().anyMatch(row -> row.status() == Status.ERROR))
                    throw new SpreadsheetImportException(STALE);
                  int created = 0;
                  for (Row row : rows) {
                    if (row.status() != Status.CREATE) continue;
                    if (item.kind == Kind.COLLABORATORS)
                      writes.createCollaborator(row.name(), context);
                    else if (item.kind == Kind.MANAGER_ASSIGNMENTS) {
                      var assignment = row.managerAssignment();
                      writes.createManagerAssignment(
                          assignment.managerUserId(),
                          row.collaboratorId(),
                          assignment.startsOn(),
                          context);
                    } else if (item.kind == Kind.ALLOCATIONS) {
                      var allocation = row.allocation();
                      String manager = SpreadsheetImport.cleanText(allocation.fields().manager());
                      writes.createAllocation(
                          row.collaboratorId(),
                          allocation.branchId(),
                          allocation.areaId(),
                          manager.isEmpty() ? null : manager,
                          allocation.startsOn(),
                          context);
                    } else
                      writes.createQuestionnaireAssignment(
                          item.cycleId, row.collaboratorId(), row.questionnaireId(), context);
                    created++;
                  }
                  return new Result(created, rows.size() - created);
                });
        // Publicado no cache somente após COMMIT; nova tentativa do mesmo token é idempotente.
        item.result = result;
        return result;
      } catch (DataAccessException exception) {
        throw new SpreadsheetImportException(STALE);
      } catch (MasterDataException exception) {
        if (exception.reason() == MasterDataException.Reason.CONFLICT)
          throw new SpreadsheetImportException(STALE);
        throw exception;
      }
    }
  }

  public synchronized Preview get(UUID id, UUID actor) {
    return get(id, actor, null);
  }

  public synchronized Preview get(UUID id, UUID actor, Kind requiredKind) {
    expire();
    Pending item = pending.get(id);
    if (item == null || !item.actor.equals(actor) || !matchesKind(item, requiredKind))
      throw new SpreadsheetImportException(EXPIRED);
    return item.preview;
  }

  public synchronized void discard(UUID id, UUID actor) {
    discard(id, actor, null);
  }

  public synchronized void discard(UUID id, UUID actor, Kind requiredKind) {
    Pending item = pending.get(id);
    if (item != null && item.actor.equals(actor) && matchesKind(item, requiredKind))
      pending.remove(id);
  }

  private static boolean matchesKind(Pending item, Kind requiredKind) {
    return requiredKind == null ? item.kind != Kind.MANAGER_ASSIGNMENTS : item.kind == requiredKind;
  }

  private List<Row> review(Kind kind, List<SourceRow> source, UUID cycleId, boolean lock) {
    try {
      var names =
          source.stream().map(row -> SpreadsheetImport.key(row.name())).collect(Collectors.toSet());
      if (kind == Kind.MANAGER_ASSIGNMENTS) {
        var managers =
            source.stream()
                .map(row -> SpreadsheetImport.key(row.managerAssignment().manager()))
                .collect(Collectors.toSet());
        return ManagerAssignmentImport.review(
            source, repository.managerAssignmentSnapshot(names, managers, lock));
      }
      if (kind == Kind.ALLOCATIONS) {
        var branches =
            source.stream()
                .map(row -> SpreadsheetImport.key(row.allocation().branch()))
                .filter(value -> !value.isEmpty())
                .collect(Collectors.toSet());
        var areas =
            source.stream()
                .map(row -> SpreadsheetImport.key(row.allocation().area()))
                .filter(value -> !value.isEmpty())
                .collect(Collectors.toSet());
        return AllocationImport.review(
            source, repository.allocationSnapshot(names, branches, areas, lock));
      }
      return SpreadsheetImport.review(kind, source, repository.snapshot(names, cycleId, lock));
    } catch (DataAccessException exception) {
      throw new MasterDataException(
          MasterDataException.Reason.UNAVAILABLE, "Importação indisponível.");
    }
  }

  @Scheduled(fixedDelay = 60000)
  public synchronized void expire() {
    Instant now = clock.instant();
    pending.values().removeIf(item -> !item.preview.expiresAt().isAfter(now));
    windows.values().removeIf(window -> !window.until().isAfter(now));
  }
}
