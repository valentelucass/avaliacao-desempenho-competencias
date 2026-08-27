package br.com.avaliacao.desempenho.indicadores.api.dto;

import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorFilterOption;
import br.com.avaliacao.desempenho.indicadores.domain.model.IndicatorFilterOptions;
import java.util.List;
import java.util.Objects;

/** Converte a resposta de aplicação para o contrato HTTP mínimo. */
public final class IndicatorFilterOptionsResponseMapper {

  public IndicatorFilterOptionsResponse toResponse(IndicatorFilterOptions options) {
    IndicatorFilterOptions safeOptions =
        Objects.requireNonNull(options, "opções não podem ser nulas");
    return new IndicatorFilterOptionsResponse(
        map(safeOptions.branches()),
        map(safeOptions.areas()),
        map(safeOptions.managers()),
        map(safeOptions.competencies()));
  }

  private static List<IndicatorFilterOptionsResponse.Option> map(
      List<IndicatorFilterOption> options) {
    return options.stream()
        .map(option -> new IndicatorFilterOptionsResponse.Option(option.id(), option.label()))
        .toList();
  }
}
