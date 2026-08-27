package br.com.avaliacao.desempenho.indicadores.application;

import java.util.UUID;

/** Porta para limitar consultas repetidas por ator autenticado. */
public interface IndicatorRequestLimiter {

  void checkAndRecord(UUID actorUserId);
}
