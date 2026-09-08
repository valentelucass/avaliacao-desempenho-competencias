# Massa complementar de teste — somente DEV

Autorizada pelo usuário em 2026-09-08 (`ADC-DEV-002`). Alvo exclusivo: SQL Server local, banco `AVALIACAO_DEV`, API do launcher DEV em `https://localhost:5181/api/v1`. A aplicação para testes fica em `https://localhost:5180`. Não aplicar em PROD, não transportar credenciais nem usar dados reais.

## Contas

As quatro contas fictícias existentes foram preservadas. Seus acessos permanecem em `secrets/contas-teste-dev.csv`. A conta técnica comum adicionada usa `secrets/conta-admin-teste-dev.csv`; não é administradora suprema. Ambos os arquivos são locais, protegidos por ACL e ignorados pelo Git. Senhas e hashes não devem ser copiados para chat, documentação ou logs.

RH e Gestor têm oito novas pessoas vinculadas cada; Diretoria tem duas novas gerências. RH, Gestor e Diretoria também têm vínculo para sua autoavaliação. Há 20 novos colaboradores fictícios (19 ativos e um inativo), duas pessoas já existentes reutilizadas para autoavaliação, lotações com filial/área/gestor/vigência/autoria, uma lotação encerrada e filiais/áreas ativas e inativas.

O Administrador técnico consulta contas, mas não avaliações ou indicadores. RH continua sem `USUARIOS.LER`; a concessão administrativa de negócio não equivale a consultar contas. Não foram adicionadas concessões excepcionais para preencher tabelas vazias ou contornar a segregação.

## Cenários disponíveis

| Código do ciclo | Uso na massa inicial |
| --- | --- |
| `DEV-COMPLETO-LIVRE` | Aberto, sem avaliações: criar avaliação de equipe e autoavaliação do zero. Oito opções por equipe RH/Gestor e duas gerências para Diretoria. |
| `DEV-COMPLETO-FLUXOS` | 21 avaliações: dez de gestor publicadas, duas enviadas, quatro rascunhos (dois parciais e dois reabertos), três autoavaliações publicadas e duas avaliações Diretoria–Gerência publicadas. |
| `DEV-COMPLETO-CONFIG` | Rascunho: testar configuração, questionários aplicados, atribuições e abertura. |
| `DEV-COMPLETO-FUTURO` | Aberto com encerramento futuro: contém uma autoavaliação publicada e permite testar a rejeição de encerramento antecipado. Não significa abertura futura. |
| `DEV-COMPLETO-ENCERRADO` | Histórico de ciclo com janela passada, encerrado pela API; não contém avaliações individuais. |

Os quatro primeiros ciclos possuem os três questionários oficiais — Operacional, Administrativo e Liderança — e 21 atribuições cada (84 no total). O histórico encerrado também possui os três questionários aplicados. Não foram alterados questionários, fórmulas ou versões aprovadas.

Em `FLUXOS`, cada equipe possui cinco avaliações publicadas com notas 80, 90, 100, 110 e 120. Há comentários, feedbacks com data/conclusão, pendências e versões anteriores preservadas. Todos os resultados foram calculados pela API a partir das respostas; não foram fabricados por SQL.

## Roteiro de teste manual

1. Entrar como RH: criar avaliação da equipe e autoavaliação em `LIVRE`; em `FLUXOS`, abrir seus rascunhos, avaliar envio/publicação e registrar somente o próprio feedback.
2. Entrar como Gestor: conferir que aparecem apenas pessoas vinculadas e a própria autoavaliação. As avaliações de outras equipes não ficam disponíveis.
3. Entrar como Diretoria: criar avaliação das duas gerências em `LIVRE` e sua autoavaliação; consultar as publicadas em `FLUXOS`.
4. Como RH, abrir rascunho e feedback pendente de outro autor: respostas ficam desabilitadas, sem hover, salvar/enviar/feedback alheio. Publicação ou reabertura administrativa continuam conforme estado e autorização.
5. Em indicadores de `FLUXOS`, conferir média agregada 100, cinco faixas de classificação e CSV agregado. A filial de grupo pequeno possui somente duas pessoas elegíveis: não aparece nas opções e uma consulta direta retorna apenas dados insuficientes.
6. Imprimir uma avaliação de Liderança: verificar gráfico maior, as 21 notas abaixo dele, assinatura e data à direita, uma página A4. Usar escala 100% e desativar cabeçalhos/rodapés externos do navegador; conferir a prévia da impressora real.
7. Com a conta técnica, testar contas, cadastros e filtros de ativos/inativos. Não esperar acesso às avaliações, nem operações reservadas ao administrador supremo.

## Execução e verificação

Na raiz, com PowerShell 7 e DEV iniciado por `iniciar-dev.bat`:

```powershell
# Apenas consulta os marcadores; não autentica nem altera dados.
pwsh -NoProfile -File scripts/complementar-massa-teste-dev.ps1

# Carga explicitamente autorizada. Já concluída: não duplica nem sobrescreve.
pwsh -NoProfile -File scripts/complementar-massa-teste-dev.ps1 -Populate

# Confere a massa inicial por API: opções, indicadores, supressão e CSV.
pwsh -NoProfile -File scripts/complementar-massa-teste-dev.ps1 -Validate
```

`-Validate` não edita avaliações ou cadastros; cria/revoga sessões e registra as auditorias normais de acesso/consulta/exportação. Suas quantidades esperadas descrevem a massa inicial: testes manuais que consumam opções ou alterem resultados podem fazê-lo falhar sem indicar defeito da aplicação. Ele nunca restaura automaticamente os dados.

Para a regressão completa independente, `scripts/testar-fluxo-feedback-dev.ps1` cria outra massa fictícia `QA-*` a cada execução e verifica API/SQL, concorrência, idempotência, histórico, sessões, indicadores e negações. Não confundir esses registros automatizados com `DEV COMPLETO`.

## Preservação, limites e recuperação

- A base usa transação e marcador `ADC-DEV-002`; avaliações usam comandos da API e chaves idempotentes. Uma interrupção pode deixar a base concluída e jornadas parciais: reexecutar permite retomada, sem apagar histórico. Não executar cargas simultâneas.
- Na primeira execução, a tentativa de encerrar um ciclo com prazo futuro foi corretamente negada (`409`). A recuperação preservou a janela e a autoavaliação desse ciclo, identificou-o como `FUTURO` e criou um cenário histórico separado, encerrado pela API. Nenhum gatilho foi desativado e nenhum prazo de ciclo aberto foi reescrito.
- Campo nulo não é necessariamente falta de massa: rascunho não tem resultado; vínculo vigente não tem encerramento; feedback pendente não tem conclusão; autoavaliação não tem feedback. Plano de ação deixou a interface e valores legados continuam preservados.
- A carga não cria migrations, banco, login SQL, serviço, concessão especial ou deploy. O histórico e os testes manuais preexistentes foram mantidos.
- Recuperação autorizável: inativar contas, pessoas e vínculos fictícios pelos fluxos administrativos e deixar os ciclos concluírem conforme a regra. Nunca apagar avaliações, versões ou auditoria. Não existe comando de limpeza destrutiva da massa.
