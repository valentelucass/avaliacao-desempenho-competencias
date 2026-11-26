package br.com.avaliacao.desempenho.avaliacoes.application;

import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentCoverageRepository.Filter;
import br.com.avaliacao.desempenho.avaliacoes.application.AssessmentCoverageRepository.Page;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAccessContext;
import br.com.avaliacao.desempenho.avaliacoes.domain.model.AssessmentAuthorizationPolicy;
import br.com.avaliacao.desempenho.identidadeacesso.domain.model.AuthorizedUser;
import br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence.ConditionalOnSqlServerPersistence;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

@Service
@ConditionalOnSqlServerPersistence
@ConditionalOnProperty(prefix = "app.assessments", name = "enabled", havingValue = "true")
public class AssessmentCoverageService {

  private final AssessmentCoverageRepository repository;

  public AssessmentCoverageService(AssessmentCoverageRepository repository) {
    this.repository = repository;
  }

  public Page list(AssessmentAccessContext access, Filter filter, int page, int limit) {
    if (!access.has(AssessmentAuthorizationPolicy.VIEW_ALL)
        && !access.has(AuthorizedUser.SUPREME_REVIEW)) {
      throw new AssessmentForbiddenException();
    }
    return repository.list(filter, page, limit);
  }
}
