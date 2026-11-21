# CLAUDE.md — M² Real

Fonte única de verdade: `spec.md` (v1.1). Os princípios da seção 0 desempatam. Os planos aprovados ficam em `plans/` (um por épico); se a implementação divergir, atualize o plano no mesmo commit.

## Regra de ouro
**Se um teste falhar, corrija o código, não o teste.** Nunca pule nem apague teste que falha. Bug se corrige com teste primeiro: escreva o teste que reproduz o bug, veja falhar, commite, `touch .claude/fix-mode`, corrija o código, `rm .claude/fix-mode`.

## Convenções
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
- `supabase/` — `migrations/`, `seed.sql`, `seed/primeiro_admin.sql`, `tests/` (pgTAP).
- `.claude/` — hooks do Anexo B e subagente `verifier`.

## Comandos (raiz)
| Comando | Saída saudável |
|---|---|
| `npm run typecheck` | `tsc --noEmit` em cada workspace, sem erros |
| `npm test` | `Test Files  N passed` |
| `npm run build` | `✓ Compiled successfully` e a tabela de rotas |
| `npm run db:test` | `All tests successful.` (precisa de `supabase start`) |
| `npm run ingestao -- itbi 2025` | execução `concluida` em `m2_execucoes_ingestao` |

## Pegadinhas
- A vaga é vendida em guia separada (regra 11.15).
- A área da guia é a do IPTU (construída), não a privativa.
- As abas do ITBI têm 28 ou 29 colunas: leia pelo nome do cabeçalho, nunca pela posição. "Uso (IPTU)" é código; a descrição está em "Descrição do uso (IPTU)".
- 40% das guias vêm sem bairro (regra 11.2).
- O hook `guard-coleta.sh` bloqueia termos como cpf, devedor, proprietario, telefone, description e `writeFile` em qualquer arquivo não-teste de `anuncios/` e `leiloes/`. Por isso, filtro de campos é **allowlist positiva** (só as chaves da tabela), e o prompt de extração não cita esses termos. Listas negativas só em `*.test.ts`.
- Nos testes de hook feitos no zsh, use `printf '%s'` e não `echo`: o `echo` do zsh expande `\n` e quebra o JSON.
- TypeScript fixado em `~6.0.3`: o `next build` usa a API JS do compilador, que mudou no TS 7 (port nativo).
