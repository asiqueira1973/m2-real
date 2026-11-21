# M² Real

Base de preço real de apartamentos por **prédio e planta**, em 10 bairros de São Paulo. O preço vem do ITBI e a área privativa sai de calibração, sempre com selo. Os dados são consultados por agentes via MCP e conferidos num painel interno. A especificação completa está em [`spec.md`](spec.md); os planos por épico, em [`plans/`](plans/).

## Requisitos
- Node.js ≥ 20 (testado com 22) e npm 10
- Docker (Supabase local)
- Supabase CLI ≥ 2.122
- `jq` (os guardrails em `.claude/hooks/` dependem dele)

## Setup local
```bash
npm install
cp .env.example .env.local      # preencha as chaves; nunca versione
supabase start                  # sobe Postgres, Auth e Storage em Docker
supabase db reset               # aplica supabase/migrations e o seed (10 bairros)
```
A saída de `supabase start` mostra a `anon key` e a `service_role key` locais. Coloque-as em `.env.local`.

### Primeiro admin (seção 6.2)
1. Crie o usuário no Supabase Studio (Authentication → Add user).
2. Rode `supabase/seed/primeiro_admin.sql` com o e-mail desse usuário.

## Comandos (raiz)
| Comando | O que faz |
|---|---|
| `npm run typecheck` | `tsc --noEmit` em todos os workspaces |
| `npm test` | Vitest (regras da seção 11, parsers, coleta) |
| `npm run build` | build do Next.js |
| `npm run db:test` | testes pgTAP de RLS e funções (`supabase test db`) |
| `npm run ingestao -- <rotina> [args]` | roda uma rotina do pipeline |

Rotinas (seção 4.4): `itbi` (`ingestao-itbi`), `iptu` (`ingestao-iptu`), `anuncios` (`coleta-anuncios`), `leiloes` (`coleta-leiloes`) e `calibracao`. Exemplo: `npm run ingestao -- itbi 2025`.

## Migrations
- Ficam em `supabase/migrations/`, com prefixo de data. Uma migration aplicada nunca é editada: mudança vira migration nova.
- Depois de cada migration: rodar os advisors (security e performance), regenerar o `schema.sql` (`supabase db dump --local --schema-only > schema.sql`) e os tipos (`npm run gen:types -w @m2-real/db`).
- Todo objeto do banco leva o prefixo `m2_`.

## Estrutura
Ver seção 18.3 do spec e o `CLAUDE.md`.
