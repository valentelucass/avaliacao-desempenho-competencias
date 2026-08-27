package br.com.avaliacao.desempenho.indicadores.application;

/** Porta de auditoria; nunca recebe valores agregados, CSV ou identificadores de colaboradores. */
public interface IndicatorAuditSink {

  void record(IndicatorAuditRecord record);
}
