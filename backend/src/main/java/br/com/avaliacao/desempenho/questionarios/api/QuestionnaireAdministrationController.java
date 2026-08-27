package br.com.avaliacao.desempenho.questionarios.api;

import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.AuthenticatedPrincipal;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.security.RequestCorrelationFilter;
import br.com.avaliacao.desempenho.questionarios.api.dto.CreatedQuestionnaireVersionResponse;
import br.com.avaliacao.desempenho.questionarios.api.dto.QuestionnaireAdministrationRequests.CreateVersion;
import br.com.avaliacao.desempenho.questionarios.application.QuestionnaireAdministrationRepository.CreatedQuestionnaireVersion;
import br.com.avaliacao.desempenho.questionarios.application.QuestionnaireAdministrationService;
import br.com.avaliacao.desempenho.questionarios.application.QuestionnaireCommandContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Cria já aprovada uma versão completa e imutável do questionário. */
@RestController
@RequestMapping("/api/v1/questionnaire-versions")
@ConditionalOnSqlServerPersistence
public class QuestionnaireAdministrationController {

  private static final String MANAGE_QUESTIONNAIRES =
      "hasAuthority('PERMISSION:QUESTIONARIOS.GERIR')";

  private final QuestionnaireAdministrationService service;

  public QuestionnaireAdministrationController(QuestionnaireAdministrationService service) {
    this.service = Objects.requireNonNull(service, "serviço não pode ser nulo");
  }

  @PostMapping
  @PreAuthorize(MANAGE_QUESTIONNAIRES)
  public ResponseEntity<CreatedQuestionnaireVersionResponse> createFrozenVersion(
      @Valid @RequestBody CreateVersion request,
      @AuthenticationPrincipal AuthenticatedPrincipal principal,
      HttpServletRequest servletRequest) {
    CreatedQuestionnaireVersion created =
        service.createFrozenVersion(request.toDraft(), context(principal, servletRequest));
    return ResponseEntity.status(HttpStatus.CREATED)
        .body(
            new CreatedQuestionnaireVersionResponse(
                created.questionnaireVersionId(),
                created.calculationConfigurationVersionId(),
                created.classificationMatrixVersionId()));
  }

  private static QuestionnaireCommandContext context(
      AuthenticatedPrincipal principal, HttpServletRequest servletRequest) {
    AuthenticatedPrincipal authenticated =
        Objects.requireNonNull(principal, "principal autenticado não foi resolvido");
    return new QuestionnaireCommandContext(
        authenticated.userId(), RequestCorrelationFilter.getRequestId(servletRequest));
  }
}
