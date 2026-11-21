# Fechou por Quanto

Domínio principal: `fechouporquanto.com.br`. O nome do produto mudou na v1.2 do spec (antes "M² Real"); os identificadores técnicos continuam `m2-real` (repositório, pacotes, projetos Supabase/Vercel) e `m2_` (banco).

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
supabase start -x vector,logflare,realtime,edge-runtime   # Postgres, Auth, REST e Storage em Docker
supabase db reset               # aplica supabase/migrations e o seed dos 10 bairros (a partir do 8.1)
```
A saída de `supabase start` mostra a `anon key` e a `service_role key` locais. Coloque-as em `.env.local`.

### Primeiro admin (seção 6.2)
1. Crie o usuário no Supabase Studio (Authentication → Add user).
2. Rode `supabase/seed/primeiro_admin.sql` (criado no 8.1) com o e-mail desse usuário.

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
- Depois de cada migration: `npm run db:advisors` (security e performance; falha com qualquer `warn`), `npm run db:schema` (regenera o `schema.sql`) e `npm run db:types` (regenera `packages/db/src/types.ts`).
- Toda tabela `m2_*` nova repete o padrão de grants da migration `20261121120200` (só `select` para anon/authenticated); o teste `supabase/tests/010_estrutura` confere.
- Todo objeto do banco leva o prefixo `m2_`.

## Estrutura
Ver seção 18.3 do spec e o `CLAUDE.md`.
