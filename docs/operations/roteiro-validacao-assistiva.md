# Roteiro de validação assistiva manual

> Status: roteiro de teste. Não substitui a validação automatizada e não autoriza exposição, carga de dados ou uso de avaliações reais.

## Preparação

Use uma conta fictícia autorizada no ambiente aprovado e registre apenas resultado, navegador, sistema operacional, leitor de tela, resolução e data. Não registre nomes, notas, comentários ou credenciais.

## Fluxos a validar

Execute em desktop e, quando aplicável, em viewport de celular:

1. Entrar, sair e navegar pelas telas disponíveis ao perfil sem mouse, usando `Tab`, `Shift+Tab`, `Enter`, `Espaço` e `Esc`.
2. Confirmar foco inicial, foco visível, ordem lógica e retorno de foco ao fechar menu, modal, diálogo de confirmação e mensagens de erro.
3. Conferir que campos possuem rótulo programático, instrução e erro associado; que erro é compreensível e que não depende apenas de cor.
4. Percorrer criação, edição, envio, publicação, reabertura e feedback quando o perfil puder executar essas ações; confirmar que ações não autorizadas não são oferecidas nem executadas.
5. Conferir tabelas, paginação, filtros, gráficos e os equivalentes textuais. Para o resumo individual, verificar a tabela equivalente ao gráfico radar.
6. Usar leitor de tela para conferir nome, função, estado expandido, status textual, alerta e anúncio de erro em elementos dinâmicos.
7. Testar zoom de 200% e 400%, orientação retrato, tema claro/escuro e redução de movimento, quando suportados pelo navegador-alvo.

## Resultado

Para cada fluxo, registrar `aprovado`, `falhou` ou `não aplicável`, junto de uma descrição sem dado pessoal e uma referência de defeito quando houver. Bloquear a liberação para usuários reais diante de falha de teclado, foco, rótulo, contraste, leitura do estado ou compreensão de erro.

## Encerramento

Anexar a evidência em repositório protegido e atualizar a pendência `ADC-PEND-019` no `STATES.md` somente após a execução manual no navegador-alvo.
