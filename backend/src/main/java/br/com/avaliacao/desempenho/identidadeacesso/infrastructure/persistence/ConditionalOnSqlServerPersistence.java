package br.com.avaliacao.desempenho.identidadeacesso.infrastructure.persistence;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

/**
 * Ativa componentes que precisam da persistência SQL Server somente quando ela foi habilitada de
 * forma explícita.
 *
 * <p>Esta condição é baseada apenas em propriedade. Diferentemente de {@code ConditionalOnBean},
 * ela não depende da ordem em que o component scan encontra a configuração que declara o {@code
 * JdbcTemplate}.
 */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.TYPE, ElementType.METHOD})
@ConditionalOnProperty(prefix = "app.persistence.sqlserver", name = "enabled", havingValue = "true")
public @interface ConditionalOnSqlServerPersistence {}
