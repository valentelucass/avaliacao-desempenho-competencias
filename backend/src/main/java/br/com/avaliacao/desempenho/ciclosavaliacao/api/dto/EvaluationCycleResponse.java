package br.com.avaliacao.desempenho.ciclosavaliacao.api.dto;

import java.util.UUID;

/** Resumo mínimo de ciclo, sem código interno, janela, autor ou dados de colaboradores. */
public record EvaluationCycleResponse(UUID id, String name, String status) {}
