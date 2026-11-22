# Plano mestre — Fechou por Quanto (spec.md v1.2)

## Contexto

A pasta `metro-quadrado/` tem só o `spec.md` (fonte única de verdade), o `modelo-m2-real.dbml`, o `prompt-design-m2-real.md` e a planilha `GUIAS DE ITBI PAGAS (28012026) XLS.xlsx` (ITBI 2025: 12 abas mensais JAN-2025…DEZ-2025 com 28 colunas, mais LEGENDA, EXPLICAÇÕES, Tabela de USOS e Tabela de PADRÕES). Não é repositório git e não há código. O objetivo é implementar o MVP épico a épico (8.0 → 8.9, com o 8.5.1 entre o 8.5 e o 8.6), com guardrails ativos desde o início e o verificador ao fim de cada épico.

Ferramentas confirmadas: Node 22, npm 10, Supabase CLI 2.122, Docker ativo, jq, gh. Faltam `psql`/`pg_prove`, mas não são necessários, porque `supabase test db` roda o pgTAP dentro do container.

### Decisões tomadas com você (21/11/2026)
- **Infra:** local primeiro. Uso Supabase local (Docker) em todos os épicos e no `db:test`. Projeto Supabase remoto, repositório GitHub `m2-real` e projeto Vercel só quando você autorizar (eles serão necessários no 8.8, para o `workflow_dispatch`, e no 8.9, para o teste de preview). Até lá, os critérios que dependem deles ficam "não verificável", com o motivo.
- **P4:** `indicativa` **não** entra na cobertura. `pct_cobertura = (confirmada + calibrada) / vendas_24m × 100`, como está no spec.
- **P2:** **não** descontar as vagas. O MCP devolve `vagas_inclusas_area` (regra 11.18).
- **Downloads autorizados:** IPTU GeoSampa, ITBI 2021–2026 e laudo da Rua Canário, 906, além de chamadas reais ao Firecrawl e à Claude API dentro dos tetos. Antes de cada download, aviso o nome, a origem e o tamanho. Você coloca as chaves em `.env.local`, e eu nunca as imprimo. Exceção autorizada pelo usuário em 22/11/2026: as contas de teste do painel no Supabase local (`PAINEL_TESTE_*`) podem ser lidas por mim para testar as telas no navegador; as chaves de serviços (Firecrawl, Anthropic, service role) continuam protegidas.
- **Prefixo do banco (pedido seu, 21/11/2026):** todo objeto do banco leva o prefixo `m2_`: tabelas (`m2_predios`), enums (`m2_selo_area`), funções (`m2_eh_admin()`, `m2_confirmar_area_planta`), triggers (`m2_atualizar_atualizado_em`), políticas (`m2_predios_leitura_admin`), índices e o bucket do Storage (`m2_brutos`). Colunas e valores de enum ficam com os nomes do spec. Vale como divergência declarada do spec (seções 6.4, 7 e 11), registrada na seção 6 da `DOCUMENTACAO-TECNICA.md`. No texto dos planos, um nome do spec sem prefixo significa o objeto com `m2_`.
- **P3** (prédios com várias torres) continua aberta: **paro e pergunto durante o 8.2**, depois de ver os casos reais.

## Forma de trabalho (vale para todos os épicos)

1. `git init` na raiz (branch `main`, commit inicial com o spec). Cada épico roda num branch `epico/8-x-<nome>`; o merge em `main` acontece só depois do `verifier` dizer PRONTO.
2. Para cada épico: escrevo `plans/<épico>.md` com base no trecho correspondente deste plano e o commito **antes** do código. Se a implementação divergir, o plano é atualizado no mesmo commit da divergência.
3. Ao fim de cada épico, rodo `npm run typecheck`, `npm test`, `npm run build` e `npm run db:test`, colo as saídas e aciono o verifier. Como o agente `.claude/agents/verifier.md` só é carregado em sessão nova, nesta sessão uso um subagente com o conteúdo do `verifier.md` como instrução, sem ferramentas de escrita. Depois reviso o diff contra o `REVIEW.md` e contra o plano.
4. Bug: escrevo o teste que falha → commit → `touch .claude/fix-mode` → corrijo o código → `rm .claude/fix-mode`.
5. Convenções: banco em português snake_case e código em inglês. Cabeçalho em português em toda função, rota, trigger e política (o que faz, o que recebe, o que devolve, regra nº). Todo limiar fica em `packages/ingestao/src/config/regras.ts`.
6. Arquivos grandes e segredos ficam fora do git (`.gitignore`): `*.xlsx` da raiz, `.env*` exceto `.env.example`, `supabase/.temp`. As fixtures são recortes pequenos e versionados.

## Lista de tarefas por épico

### 8.0 Guardrails e esqueleto
- [ ] `git init`, `.gitignore`, commit inicial.
- [ ] Monorepo com npm workspaces (`apps/web`, `packages/ingestao`, `packages/db`) e a estrutura da 18.3. TS strict, Vitest. Scripts da raiz: `typecheck`, `test`, `build`, `db:test` (`supabase test db`) e `ingestao` (`tsx packages/ingestao/src/cli.ts`).
- [ ] `apps/web` com Next.js (App Router) mínimo + Tailwind; `cli.ts` com stub das rotinas; `supabase init`.
- [ ] Anexo B **literal**: `.claude/settings.json`, os 5 hooks em `.claude/hooks/` (`chmod +x`), `.claude/agents/verifier.md`, `REVIEW.md`.
- [ ] Teste de cada hook provocando a violação uma vez, com a saída colada:
  - `guard-secrets`: Write de `apps/web/src/features/x/a.ts` contendo `SUPABASE_SERVICE_ROLE_KEY` → exit 2.
  - `guard-migrations`: migration versionada. Uso um repo git temporário no scratchpad como `CLAUDE_PROJECT_DIR`, com uma migration commitada, e envio o JSON da ferramenta → exit 2. Isso evita sujar o repositório real com uma migration falsa.
  - `guard-tests`: com `.claude/fix-mode` presente, edição de `*.test.ts` → exit 2; depois `rm`.
  - `guard-coleta`: Write em `packages/ingestao/src/anuncios/x.ts` com `telefone` → exit 2; com `writeFile` → exit 2.
  - `remind-advisors`: Write de arquivo em `supabase/migrations/` → mensagem (exit 2 no PostToolUse).
  - Cada hook roda duas vezes: uma por pipe de JSON (saída exata) e outra ao vivo pela ferramenta Write/Edit.
- [ ] `CLAUDE.md` (uma página, pegadinhas da 18.5 + regra de ouro), `README.md`, `.env.example` (variáveis da 18.4).
- **Pegadinha prevista:** o `guard-coleta` bloqueia as palavras `cpf`, `devedor`, `proprietario`, `description` etc. em `anuncios/` e `leiloes/`. Por isso o filtro de campos é uma **allowlist positiva** (só as chaves da tabela). O prompt da Claude API fica redigido sem esses termos ("não transcreva dados de pessoas, documentos de identificação ou qualquer outro trecho"), e as listas negativas só aparecem em `*.test.ts`. Isso entra em "Pegadinhas" no CLAUDE.md.

### 8.1 Banco, políticas e seed
- [ ] Migrations em `supabase/migrations/`: extensões (`pg_trgm`, `unaccent`; `gen_random_uuid()` já é nativo do Postgres), os 10 enums da 7.1, as 14 tabelas da 7.2 com tipos, nulos e defaults literais, `criado_em`/`atualizado_em`, o unique com `nulls not distinct` em `fatores_referencia` e todos os índices da 7.3, incluindo o trigram em `predios.logradouro`.
- [ ] Funções e triggers da 7.4: `atualizar_atualizado_em`, `eh_admin()` (SECURITY DEFINER, `search_path` fixo), `confirmar_area_planta`, `casar_anuncio`, `casar_edital`, `marcar_outlier`, `normalizar_endereco` (regra 11.5; o espelho em TS entra no 8.2) e `buscar_predio_por_endereco`.
- [ ] RLS em todas as tabelas, com as políticas da 6.4 e os nomes `<tabela>_leitura_admin`, `perfis_leitura_propria`, `chaves_api_leitura_admin` e escrita separada em `chaves_api_insercao_admin`/`chaves_api_atualizacao_admin` (todas com prefixo `m2_`). Sem política de update direto em `plantas`, `anuncios`, `editais_leilao` e `vendas_consolidadas`.
- [ ] Seed: `supabase/seed.sql` com os 10 bairros da tabela 11.2 e `supabase/seed/primeiro_admin.sql`, parametrizado por e-mail.
- [ ] pgTAP em `supabase/tests/`: RLS (`anon` → 0 linhas, autenticado sem perfil → 0, admin → linhas); `confirmar_area_planta` por não-admin gera erro; por admin com observação vazia gera erro; caminho feliz grava em `calibracoes`; `buscar_predio_por_endereco`.
- [ ] Advisors: rodo os lints de segurança e performance do Supabase localmente (`supabase db advisors`/`db lint` do CLI, ou as consultas do splinter) e repito com `get_advisors` quando o projeto remoto existir. `schema.sql` gerado por `npm run db:schema`. Tipos gerados em `packages/db/src/types.ts`.

### 8.2 IPTU e montagem de prédios
- [ ] Download do IPTU GeoSampa (aviso nome e tamanho), com o caminho alternativo de leitura de `brutos/iptu/<ano>.csv` no Storage local.
- [ ] Conferir as colunas no `Dicionario_dados_IPTU.xlsx` → `iptu/colunas.ts` (PV3). O parser ignora a coluna de nome do contribuinte, com teste.
- [ ] Stream `csv-parse` → filtro por prefixo de CEP → regras 11.3, 11.4, 11.6, 11.7 (módulos puros com Vitest) → upsert idempotente (`unidades.sql` e `predios.chave_predio` como chaves) → `execucoes_ingestao`.
- [ ] Critérios: Joaquim Antunes, 577 (≈132 m², `vagas_cadastro_proprio = true`) e Caiubi, 324 (≈169 m², `false`); duas execuções sem duplicar; falha de download → `falhou` + fallback.
- [ ] **Parada: P3.** Levanto os condomínios com mais de um número de imóvel e te mostro os casos antes de fechar a regra.

### 8.3 ITBI
- [ ] Listagem dos links .xlsx em `ITBI_PAGINA_URL`, download por ano (2021+), hash SHA-256 e "sem mudança" quando o hash é igual.
- [ ] `exceljs` streaming; abas pelo padrão `MMM-AAAA`; colunas pelo nome do cabeçalho com mapa de sinônimos (28/29 colunas); falha com mensagem clara se faltar uma coluna obrigatória.
- [ ] Regra 11.2 (bairro: campo → iptu → voto por CEP → voto por quadra, com o prefixo de CEP como trava), 11.1 (`hash_linha` + substituição), 11.14.
- [ ] Fixture T1: recorte das guias de 2025 da Joaquim Antunes, 577 e da Caiubi, 324, extraído da planilha local para `packages/ingestao/fixtures/`.
- [ ] Critérios: 2025 com 13.289 ± 2% guias e 11.355 ± 2% de compra e venda (planilha local); 6 guias da Joaquim Antunes (3 apartamentos + 3 vagas); hash igual → 0 gravadas.

### 8.4 Consolidação de vendas
- [ ] `calibracao/consolidar.ts`: regra 11.15 (mesmo prédio e data, até 3 vagas, desempate pela matrícula mais próxima), exclusão da 11.14, recálculo preservando `marcado_manual`, regra 11.16 (fora da curva) e `m2_iptu`.
- [ ] Critérios: valores T1 (1.630.000 / 240.000 / 1; 762.600 / 0); nenhuma vaga em duas vendas.

### 8.5 Anúncios e páginas de condomínio
- [ ] Cliente Firecrawl (`/search` + `/scrape` com o schema da 13.3); allowlist de domínios; retentativas 10/30/90 s; teto `FIRECRAWL_MAX_CREDITOS_EXECUCAO`; regra 11.13 (prioridade, 150 prédios, 90 dias).
- [ ] Normalização + allowlist de chaves antes do insert; casamento pela regra 11.8.
- [ ] Testes com páginas de exemplo salvas (fixture), incluindo "área total vs. útil", e uma rodada real para a Joaquim Antunes, 577 (94 m² ± 2).

### 8.5.1 Editais de leilão
- [ ] Alvos pela regra 11.19; busca restrita a `LEILAO_DOMINIOS`; scrape com o schema estendido; PDF baixado para `Buffer` em memória → Claude API (Sonnet, bloco `document`, schema da 13.4 via tool/JSON) → allowlist de chaves → descarte.
- [ ] Casamento pela regra 11.20 (matrícula → complemento normalizado → prédio).
- [ ] Testes: laudo da Rua Canário, 906 (184,32 m², 2 vagas); filtro de dados pessoais com resposta simulada contendo campos extras; não persistência (spy em `fs` e Storage); casamento por matrícula; tetos `LEILAO_MAX_ALVOS_EXECUCAO` e `CLAUDE_MAX_DOCUMENTOS_EXECUCAO`.

### 8.6 Calibração e fatores
- [ ] Regras 11.9 (selos, incluindo edital → `confirmada`, mediana de editais a 3% e `edital_divergente` acima de 5%), 11.10 (grupos com ≥ 8 plantas, faixa de erro), 11.11 (precedência humana), 11.12 (coerência e planta especial); `fator_predio`; linha em `calibracoes` a cada mudança; `cobertura_bairros` (P4: sem indicativa); retenção de anúncios com mais de 3 anos; limpeza de execuções paradas há mais de 6 h.
- [ ] Testes: T2 (94/95 → calibrada 94,5 / 0,716; com o 107 continua calibrada), planta `confirmada` intocada, Joaquim Antunes ≈ 94 / 0,71.

### 8.7 Painel: autenticação, visão geral e prédios
- Nome visível do produto: **Fechou por Quanto** (spec v1.2): título, aba, login e mensagens da seção 15.
- [ ] Supabase Auth (SSR), checagem de perfil ativo, recuperação de senha; layout com menu lateral (seção 16); Visão geral, Prédios e Ficha (abas Plantas, Vendas, Anúncios, Editais, Histórico); estados vazio, carregando e erro; formatação pt-BR.
- [ ] Não existe `design/` do Claude Design. Sigo a seção 16 e o `prompt-design-m2-real.md`, e capturo as telas no navegador embutido para conferir.

### 8.8 Painel: revisão e operação
- [ ] Fila de revisão, Evidências sem vínculo, Execuções (`/api/execucoes/disparar` → GitHub `workflow_dispatch`), Chaves de API (`/api/chaves`, revogar). Workflows em `.github/workflows/` (os 4 de rotina + `ci.yml`).
- [ ] O disparo real depende do repositório GitHub: peço autorização para criá-lo aqui.

### 8.9 Servidor MCP
- Nome do servidor MCP para o cliente: **Fechou por Quanto**; `fonte` = "ITBI Prefeitura de SP + IPTU GeoSampa + calibração Fechou por Quanto" (spec v1.2, 13.2).
- [ ] `app/api/mcp/route.ts` com `mcp-handler@^2` + `@modelcontextprotocol/server@^2` + `zod@^4`. Se essas versões não existirem no npm, paro e pergunto. Autenticação Bearer por hash SHA-256, com atualização de `ultimo_uso_em`; as 5 ferramentas da 13.2; mensagens da seção 15; `fonte` e `atualizado_em` em toda resposta; selo e área em todo m².
- [ ] `scripts/test-client.mjs`: roda local; contra o preview depois que o projeto Vercel for autorizado.

### Encerramento
- [ ] `DOCUMENTACAO-TECNICA.md` com os 6 itens da seção 19, a partir do código real; `CLAUDE.md`, `README.md` e `schema.sql` em dia.

## Observabilidade das cargas (pedido do usuário, 21/11/2026)
Objetivo: nenhuma carga recorrente pode falhar ou parar em silêncio enquanto o MCP responde com dado velho. Os detalhes estão em `plans/8.2-iptu.md`.
- **8.2:**
  - O1 `executarRotina`: registra a execução, marca como falhou o que estiver travado há mais de 6 h e sai com código ≠ 0 em erro, o que dispara o e-mail do GitHub;
  - O2 `avaliarSaude`: estados ok, atrasada, falhou, travada e volume_anomalo, mais a queda de cobertura.
- **8.7/8.8:** O4, selo de saúde por rotina no painel.
- **8.8:** O3, workflow diário `vigia`, que falha quando há problema (e-mail do GitHub) e faz uma sonda sintética.
- **8.9:** O5, `dados_desatualizados` e `motivo_desatualizacao` em toda resposta do MCP. É divergência aprovada da 13.2 (só acrescenta campos).
- Limiares aprovados (em `config/regras.ts`):
  - atraso: ITBI 35 dias, IPTU 400, anúncios, leilões e calibração 8;
  - volume abaixo de 50% da mediana das 3 últimas;
  - cobertura com queda acima de 5 pontos;
  - travada há mais de 6 h.
- Canal de alerta: e-mail nativo do GitHub Actions.

## Fora do escopo (não implementar)
28.2 a 28.7 (cartório/ONR, modelo estatístico do fator, outras cidades, produto externo, preço pedido x fechado, desconto de vagas).

## Verificação
- Por épico: `npm run typecheck`, `npm test`, `npm run build` e `npm run db:test` com a saída colada, o relatório do verifier com cada critério cumprido e evidência, e a revisão do diff contra o `REVIEW.md` e o `plans/<épico>.md`.
- Ponta a ponta (após o 8.6): `npm run ingestao -- iptu <ano>`, `npm run ingestao -- itbi 2025` (arquivo local), `coleta-anuncios`, `coleta-leiloes` e `calibracao` contra o Supabase local; depois, consulta das plantas e vendas da Joaquim Antunes, 577 e da Caiubi, 324.
- Painel e MCP: navegador embutido em `localhost` e `scripts/test-client.mjs`.

## Primeiro passo após a aprovação
Executar o 8.0: `git init` → `plans/8.0-guardrails.md` + commit → esqueleto + Anexo B → teste dos hooks (saídas coladas) → quatro comandos → verifier → merge.
