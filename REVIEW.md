# Instruções de revisão (M² Real)

## Passes
Marque cada achado com o passe:
- Bugs: erro de lógica, caso de borda quebrado (vaga sem apartamento, guia sem bairro, prédio de uma planta), regressão.
- Segurança: matriz da seção 5 e políticas da 6.4 respeitadas; service role, token do GitHub, chave do Firecrawl e chave da Claude API só no servidor; coleta só com os campos de `anuncios` e `editais_leilao`; nenhum PDF de leilão persistido; nenhum dado de pessoa (princípio 4, seção 20).
- Conformidade: bate com spec.md (épicos da seção 8, regras da seção 11), com o plano em plans/ e com a seção 18: banco em português snake_case, rotinas comentadas com a regra, limiares em config/regras.ts.

## O que é Importante
O que quebra comportamento, devolve m² sem selo, vaza segredo ou viola regra do spec. Estilo e nome são detalhe.

## Limite de detalhes
No máximo cinco detalhes por revisão; resuma o resto como contagem.

## Não reportar
Arquivos gerados (types.ts, schema.sql) e o que o lint/CI já garante.
