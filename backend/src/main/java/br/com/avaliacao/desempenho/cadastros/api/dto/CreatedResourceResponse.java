package br.com.avaliacao.desempenho.cadastros.api.dto;

import java.util.UUID;

/** Retorno mínimo de criação, sem repetir dados pessoais ou de vínculo. */
public record CreatedResourceResponse(UUID id) {}
