# CLAUDE.md — Fechou por Quanto

Fonte única de verdade: `spec.md` (v1.1). Os princípios da seção 0 desempatam. Os planos aprovados ficam em `plans/` (um por épico); se a implementação divergir, atualize o plano no mesmo commit.

## Regra de ouro
**Se um teste falhar, corrija o código, não o teste.** Nunca pule nem apague teste que falha. Bug se corrige com teste primeiro: escreva o teste que reproduz o bug, veja falhar, commite, `touch .claude/fix-mode`, corrija o código, `rm .claude/fix-mode`.

## Convenções
- **Nome do produto: Fechou por Quanto** (`fechouporquanto.com.br`, spec v1.2) em todo texto visível (painel, MCP, mensagens da seção 15). Identificadores técnicos continuam `m2-real` / `m2_`: não renomeie repositório, pacotes, banco nem variáveis.
- **Banco em português `snake_case`, com prefixo `m2_` em todo objeto**: tabelas (`m2_predios`), enums (`m2_selo_area`), funções (`m2_eh_admin()`), triggers, políticas (`m2_predios_leitura_admin`), índices e bucket (`m2_brutos`). Colunas e valores de enum ficam como no spec. Esta é uma divergência declarada do spec (decisão do usuário, 21/11/2026).
- Código, variáveis e arquivos em inglês. Os tipos gerados (`packages/db/src/types.ts`) mantêm os nomes do banco.
- Toda função, rotina, rota, trigger e política tem cabeçalho em português: o que faz, o que recebe, o que devolve e qual regra do spec implementa (com número). Lógica não óbvia leva comentário inline citando a regra.
- Limiares das regras **só** em `packages/ingestao/src/config/regras.ts`, um por constante, com o número da regra. Nenhum número mágico.
- Migration aplicada nunca se edita: crie uma nova. Depois de cada DDL: advisors, `schema.sql` e tipos.
- Fora do escopo: seções 28.2 a 28.7. Itens da seção 25 (perguntas abertas): pergunte, não assuma.

## Mapa
- `packages/ingestao/src/` — pipeline em Node/TS (`itbi/ iptu/ anuncios/ leiloes/ calibracao/ bairros/ config/ shared/`), entrada em `cli.ts`.
- `packages/db/` — tipos gerados e cliente.
- `apps/web/` — Next.js: painel em `src/app/(painel)`, MCP em `src/app/api/mcp/route.ts`, acesso com service role só em `src/server/`.
- `supabase/` — `migrations/`, `seed.sql` e `seed/primeiro_admin.sql` (criados no 8.1), `tests/` (pgTAP).
- `.claude/` — hooks do Anexo B e subagente `verifier`.

## Comandos (raiz)
| Comando | Saída saudável |
|---|---|
| `npm run typecheck` | `tsc --noEmit` em cada workspace, sem erros |
| `npm test` | `Test Files  N passed` |
| `npm run build` | `✓ Compiled successfully` e a tabela de rotas |
| `npm run db:test` | `All tests successful.` (precisa de `supabase start`) |
| `npm run ingestao -- itbi 2025` | execução `concluida` em `m2_execucoes_ingestao` (a partir do 8.3; no 8.0 responde "ainda não implementada") |

## Pegadinhas
- A vaga é vendida em guia separada (regra 11.15).
- A área da guia é a do IPTU (construída), não a privativa.
- As abas do ITBI têm 28 ou 29 colunas: leia pelo nome do cabeçalho, nunca pela posição. "Uso (IPTU)" é código; a descrição está em "Descrição do uso (IPTU)".
- 40% das guias vêm sem bairro (regra 11.2).
- O hook `guard-coleta.sh` bloqueia termos como cpf, devedor, proprietario, telefone, description e `writeFile` em qualquer arquivo não-teste de `anuncios/` e `leiloes/`. Por isso, filtro de campos é **allowlist positiva** (só as chaves da tabela), e o prompt de extração não cita esses termos. Listas negativas só em `*.test.ts`.
- Nos testes de hook feitos no zsh, use `printf '%s'` e não `echo`: o `echo` do zsh expande `\n` e quebra o JSON.
- Com várias stacks Supabase na mesma máquina, o `supabase start` pode estourar o health check (analytics, vector, realtime). Use `supabase start -x vector,logflare,realtime,edge-runtime`: o Fechou por Quanto não usa esses serviços.
- IPTU: download só manual (desafio anti-robô do GeoSampa); CSV em UTF-8, `;`, CRLF. O campo bairro vem vazio na maioria: o bairro do prédio sai da lógica da 11.2 (campo → voto por CEP → voto por quadra).
- Número de condomínio do IPTU tem hífen ("01-9"): nunca reconstrua a partir da chave `setor-quadra-condominio`.
- Filtro `.in(...)` do supabase-js vai na URL: no máximo ~100 UUIDs por chamada ("URI too long").
- **max_rows = 1.000 do PostgREST corta respostas EM SILÊNCIO** (sem erro). Toda leitura ou RPC que possa devolver mais de 1.000 linhas precisa de lote que garanta menos que isso, ou de paginação.
- Chamadas ao banco e ao Storage em rotina: use `withRetry` / `downloadIfExists` (shared/), porque o limite de 8 s do PostgREST derruba carga sob contenção. Só em operação idempotente.
- ITBI: leia o .xlsx com `shared/xlsx.ts`, não com o streaming do exceljs (2024 tem workbook.xml no fim do zip). Há abas sem cabeçalho (JAN/OUT-2024) e cabeçalhos deslocados (2021/2022: "ACC" repetido). SQL e CEP vêm como número, sem zeros.
- Critério de contagem do ITBI (13.289 / 11.355) é de guias de **apartamento** dos 10 bairros originais (antes do 8.14); o banco guarda todas as guias dos 14 bairros.
- TypeScript fixado em `~6.0.3`: o `next build` usa a API JS do compilador, que mudou no TS 7 (port nativo).
