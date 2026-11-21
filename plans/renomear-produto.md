# Renomear o produto: "M² Real" → "Fechou por Quanto"

## Contexto
O produto ganhou nome definitivo, **Fechou por Quanto**, com domínio principal `fechouporquanto.com.br`. A troca vale só para textos visíveis e documentação. Repositório, pastas, pacotes (`m2-real`), projetos Supabase e Vercel, variáveis de ambiente e tudo no banco (tabelas `m2_*`, colunas, enums, funções, políticas e migrations) ficam como estão. Lógica, regras da seção 11 e testes também não mudam. Hoje nenhum teste compara o nome.

Branch `renomear-produto`, saindo do `main` (5e2f785). O plano fica salvo em `plans/renomear-produto.md`, e a mudança vai num commit só.

## Ocorrências que mudam (levantamento com `git grep "M² Real"`)

| Arquivo | Linha | De → para |
|---|---|---|
| `spec.md` | 1 | título: `# Fechou por Quanto: base de preço real…` |
| `spec.md` | 5 | Versão: `1.1 (inclui editais…)` → `1.2 (renomeado para Fechou por Quanto)` |
| `spec.md` | 8 | Data: `20/11/2026` → `21/11/2026`, para acompanhar a versão nova |
| `spec.md` | 9 | Nome do produto: `**Fechou por Quanto**` (nome definitivo, domínio `fechouporquanto.com.br`, ver assunção A1) |
| `spec.md` | 13, 33, 44 | "o M² Real" → "o Fechou por Quanto" |
| `spec.md` | 781 | `fonte: "ITBI Prefeitura de SP + IPTU GeoSampa + calibração Fechou por Quanto"` |
| `spec.md` | 849 | mensagem da seção 15 "MCP fora da cobertura": "…na base do Fechou por Quanto, que hoje cobre…" |
| `spec.md` | 851 | "Painel sem perfil": "…Fale com o administrador do Fechou por Quanto." |
| `spec.md` | 1054 | A1 → `Nome definitivo "Fechou por Quanto" (domínio principal fechouporquanto.com.br). O repositório, as pastas, os pacotes e o banco continuam com m2-real / m2_` \| Por quê: `Nome escolhido na v1.2; os identificadores técnicos não mudam para não mexer em banco, deploys e variáveis` \| Se discordar: `Trocar os identificadores técnicos exige migration nova e renomear os projetos Supabase e Vercel` |
| `spec.md` | 1138 | modelo de prompt da seção 29: "O Fechou por Quanto já está implementado…" |
| `spec.md` | 1299, 1317 | Anexo B: `description` do verifier e título do REVIEW.md |
| `.claude/agents/verifier.md` | 3 | `…critérios de aceite do spec do Fechou por Quanto…`. Continua cópia literal do Anexo B |
| `REVIEW.md` | 1 | `# Instruções de revisão (Fechou por Quanto)`. Continua cópia literal do Anexo B |
| `apps/web/src/app/layout.tsx` | 10 | aba do navegador: `title: "Fechou por Quanto"` |
| `apps/web/src/app/page.tsx` | 8 | cabeçalho provisório: `<h1>Fechou por Quanto</h1>` |
| `README.md` | 1 | `# Fechou por Quanto`, mais uma linha com o domínio e a nota de que os identificadores técnicos continuam `m2-real` / `m2_` |
| `CLAUDE.md` | 1, 39 | título e a pegadinha do `supabase start`. Ganha uma linha em Convenções: "nome do produto: Fechou por Quanto; identificadores técnicos continuam m2-real/m2_" |
| `prompt-design-m2-real.md` | 1, 7, 37 | o nome, inclusive a mensagem "Acesso não autorizado…". O nome do arquivo não muda |
| `packages/ingestao/src/config/regras.ts` | 2 | comentário do cabeçalho (escolha sua: comentários internos) |
| `.env.example` | 1 | comentário (escolha sua) |
| `package.json` (raiz) | 5 | só o `description`; o `name` continua `m2-real` (escolha sua) |
| `modelo-m2-real.dbml` | 1 | comentário: `// Fechou por Quanto — modelo de dados (spec.md, seção 7, versão 1.2)` (escolha sua; o nome do arquivo não muda) |
| `plans/00-plano-mestre.md` | 1 | título: `# Plano mestre — Fechou por Quanto (spec.md v1.2)` (escolha sua) |
| `plans/8.0-guardrails.md` | 51 | "o Fechou por Quanto não usa esses serviços" (escolha sua) |
| `supabase/seed.sql` | 2 | só o comentário (escolha sua; sem efeito no banco) |

## O que **não** muda
- As 3 migrations em `supabase/migrations/`: o cabeçalho delas cita "M² Real", mas você pediu para não mexer, e o `guard-migrations` bloqueia de qualquer forma.
- Os nomes `m2-real`, `@m2-real/*`, `m2_*`, `project_id = "m2-real"` no `config.toml`, os nomes de arquivo (`modelo-m2-real.dbml`, `prompt-design-m2-real.md`) e as variáveis de ambiente.
- `schema.sql` e `packages/db/src/types.ts`: são gerados e não citam o nome.
- Os testes: nenhuma asserção compara o nome.
- `DOCUMENTACAO-TECNICA.md`: ainda não existe; quando for gerado, no encerramento, já sai com o nome novo.

## Itens 2 e 3 que ainda não existem no código
A tela de login, o cabeçalho do painel, as mensagens da seção 15, o campo `fonte` do MCP, o nome do servidor MCP e as descrições das ferramentas ainda não foram implementados; eles chegam nos épicos 8.7 a 8.9. Como o spec é a fonte da verdade, a troca no spec garante que sejam implementados já com o nome novo. Também registro no `plans/00-plano-mestre.md` (8.7 e 8.9) que o nome do servidor MCP é "Fechou por Quanto".

## Execução
1. `git checkout -b renomear-produto`.
2. Salvar este plano em `plans/renomear-produto.md`.
3. Fazer as trocas com Edit, arquivo por arquivo, conferindo cada linha da tabela acima.
4. Conferir:
   - `git grep -n "M² Real"` deve sobrar só nas 3 migrations e no `plans/renomear-produto.md`, que descreve a troca;
   - comparar os blocos do Anexo B do spec com `.claude/agents/verifier.md` e `REVIEW.md`: precisam continuar idênticos.
5. Rodar `npm run typecheck`, `npm test` e `npm run build` e colar as saídas.
6. Um commit só (`docs: renomeia o produto para Fechou por Quanto (spec v1.2)`) e merge fast-forward no `main`.

## Verificação
- O grep de sobras do passo 4.
- `cmp` dos blocos do Anexo B (verifier e REVIEW).
- Os três comandos passando.
- `next build` com o título novo no `layout.tsx`.

## Execução real (21/11/2026)
- As trocas foram feitas por um script Python, e não por um Edit por linha. Cada arquivo tinha a contagem esperada de ocorrências afirmada antes da troca: o mapeamento é o mesmo da tabela, mas qualquer surpresa interromperia a execução.
- A primeira rodada parou na afirmação do `spec.md`: eu esperava 11 ocorrências restantes, mas eram 10 (12 no total, menos as 2 trocadas nas linhas 9 e A1). As linhas específicas já tinham sido gravadas, e a troca genérica ainda não tinha começado. Rodei de novo com a contagem certa.
- Acréscimo além da tabela: o `description` do `package.json` também citava "(spec.md v1.1)", que passou para v1.2.
- Sobras de "M² Real" depois da troca: só as 3 migrations (intocadas) e a linha do README que registra o nome antigo de propósito.
- Os blocos do Anexo B (`verifier.md`, `REVIEW.md` e os demais) continuam idênticos ao spec, conferido por script.
