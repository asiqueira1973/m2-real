# Fechou por Quanto: base de preço real por prédio e planta (10 bairros de São Paulo)

| Campo | Valor |
|---|---|
| Versão | 1.3 (MCP com OAuth e cadastro aberto, épico 8.10) |
| Responsável de produto | Alexandre Siqueira |
| Status | pronto para revisão |
| Data | 21/11/2026 |
| Nome do produto | **Fechou por Quanto** (nome definitivo; domínio principal `fechouporquanto.com.br`; ver assunção A1) |

## Como usar este documento

Este é o documento de referência do Fechou por Quanto. É o que o Claude Code lê para implementar o sistema. Ele define o que o sistema faz, como os dados são modelados, quais regras de negócio valem e quando cada parte está pronta.

**Antes de gerar código, revise a seção 24 (Assunções declaradas).** Uma assunção não revisada vira verdade no minuto em que o agente começa a programar. Os itens da seção 25 (Perguntas abertas) não podem ser assumidos: o agente pergunta.

As seções são numeradas e a numeração é estável. O prompt de implementação, os planos em `plans/` e as conversas futuras citam itens como "regra 11.4" ou "épico 8.3".

---

## 0. Princípios não-negociáveis

1. **Preço vem de registro, área vem de calibração.** O preço sai do ITBI e nunca é inventado nem ajustado. A área privativa sai de fontes cruzadas e sempre traz o selo que diz de onde veio (regra 11.9). Nenhum m² é exibido sem o selo da área usada.
2. **Automação primeiro; revisão humana só como exceção.** Nenhuma etapa do pipeline depende de alguém digitar dados. O painel serve para conferir e corrigir casos que o próprio pipeline marcou. Se o processo exige uma pessoa para funcionar no caso comum, está errado.
3. **Prédio antigo é o foco.** Quando houver dúvida de prioridade (o que calibrar primeiro, qual heurística privilegiar), vale o que funciona melhor para prédios com mais de 20 anos e poucas plantas.
4. **Coletar o mínimo.** De anúncios, páginas e editais de terceiros só se guardam os campos das tabelas `anuncios` e `editais_leilao` e o link. Texto, PDFs, fotos, contatos e nomes de pessoas (corretores, proprietários, devedores) não são guardados.
5. **Rastreável de ponta a ponta.** Todo número exibido no painel ou devolvido pelo MCP pode ser levado até a linha de origem: guia do ITBI, registro do IPTU ou anúncio, com a execução que o carregou.

---

## 1. Visão e problema

O Fechou por Quanto é uma base de dados de preço real de apartamentos, organizada por **prédio e planta**, para 10 bairros de São Paulo: Perdizes, Pinheiros, Pompeia, Vila Madalena, Alto de Pinheiros, Alto da Lapa, Higienópolis, Jardins, Cerqueira César e Itaim Bibi. Ela é consultada por agentes de IA via MCP e conferida num painel web interno.

**O problema.** O preço de venda é público: a prefeitura publica todo mês as guias de ITBI. Esse número sozinho, porém, não serve para comparar imóveis, por três motivos:
- a área da guia é a área construída do IPTU, que inclui áreas comuns e às vezes as vagas (de 1,4 a 1,9 vez a área privativa, nos casos testados);
- a vaga com matrícula própria é vendida numa guia separada;
- cerca de 40% das guias da cidade vêm sem bairro.

O m² ingênuo sai até 30% errado. O que vale dinheiro é a base que converte cada venda em **m² privativo comparável**: prédio, planta, área privativa e vagas.

**Para quem.** No MVP, para o próprio responsável de produto (validação da tese) e para agentes de IA que ele conecta via MCP. Depois, para corretores, investidores e avaliadores (roadmap, seção 28).

**Anti-escopo (o que o Fechou por Quanto não é):**
- não é portal de anúncios nem buscador de imóveis à venda;
- não é avaliador automático com laudo (não emite valor de um imóvel específico);
- não é ferramenta para o público final no MVP: não tem cadastro aberto nem cobrança;
- não cobre a cidade inteira nem casas, lojas ou salas no MVP, só apartamentos residenciais nos 10 bairros.

---

## 2. Personas e cenários de uso

| Persona | Contexto | Momento mais difícil |
|---|---|---|
| Responsável de produto (admin) | Abre o painel algumas vezes por semana para ver a cobertura e resolver a fila de revisão | Um prédio com plantas diferentes e anúncios contraditórios. O painel precisa mostrar as evidências lado a lado para decidir em menos de 1 minuto |
| Agente de IA (cliente MCP) | Recebe uma pergunta do tipo "quanto vale o m² no prédio da Rua Caiubi, 324?" e chama as ferramentas | Endereço digitado de forma diferente do cadastro, ou prédio sem nenhuma venda recente. O MCP precisa achar o prédio e dizer com honestidade o que não sabe |

---

## 3. Escopo do MVP

### Dentro

| # | Item |
|---|---|
| D1 | Ingestão do ITBI da cidade de São Paulo (planilhas anuais/mensais), de 2021 até o mês mais recente publicado, filtrada para os 10 bairros |
| D2 | Ingestão da base do IPTU (GeoSampa, emissão geral mais recente) filtrada para os 10 bairros |
| D3 | Montagem automática de prédios, unidades e plantas a partir do IPTU |
| D4 | Atribuição de bairro às guias, com inferência por CEP e por quadra |
| D5 | Consolidação de vendas (apartamento + vagas vendidas em guias separadas) |
| D6 | Coleta de páginas públicas de condomínio e de anúncios (Lopes, QuintoAndar, Loft) via Firecrawl, só com os campos mínimos |
| D7 | Calibração automática da área privativa por planta, com selo de confiança |
| D8 | Fatores de referência por bairro, década e tipo de vaga, para estimar prédios sem anúncio |
| D9 | Detecção de casos para revisão (fator incoerente, anúncio ambíguo, venda fora da curva) |
| D10 | Servidor MCP somente leitura com 5 ferramentas (seção 13.2) |
| D11 | Painel web de conferência para um perfil admin (seção 10) |
| D12 | Indicador de cobertura por bairro: % das vendas com área "calibrada" ou "confirmada" |
| D13 | Coleta de editais de leilão (páginas e PDFs de edital, laudo e matrícula) dos 10 bairros, extraindo só área privativa, área total, vagas, matrícula, unidade e valor de avaliação, como gabarito oficial gratuito da área (épico 8.5.1) |

### Fora

| Item | Destino | Motivo / dependência |
|---|---|---|
| Dados do cartório (ONR, matrícula online) | Adiado (28.2) | Tem custo por consulta; decisão de orçamento pendente (pergunta P1) |
| Modelo estatístico (regressão) do fator | Adiado para v2 (28.3) | O MVP usa mediana por grupo (regra 11.10); o modelo precisa de massa de prédios calibrados primeiro |
| Outras cidades e bairros | Adiado (28.4) | Primeiro validar cobertura ≥ 70% nos 10 bairros |
| Venda/cobrança do MCP | Adiado (28.5) | Depende da validação da tese. O acesso externo gratuito, com cadastro e limites, entrou no 8.10 |
| Casas, lojas, salas comerciais, terrenos | Descartado no MVP | Foco em apartamento residencial; as guias ficam armazenadas, mas não são analisadas |
| Confirmação por moradores/síndicos | Descartado | Não é automatizável (princípio 2) |
| Raspagem ampla de portais (ZAP, VivaReal, OLX) | Descartado | Risco jurídico e de bloqueio; o MVP usa coleta mínima por endereço (seção 20) |
| Guardar o PDF do edital ou da matrícula | Descartado | Os documentos trazem nomes e dados pessoais de proprietários e devedores; só os campos extraídos ficam (seção 20) |

---

## 4. Arquitetura

### 4.1 Visão geral

```
GitHub Actions (cron)                        Supabase (Postgres + Auth + Storage)
┌─────────────────────────────┐              ┌──────────────────────────────────┐
│ packages/ingestao (Node/TS) │── service ──▶│ tabelas da seção 7               │
│  itbi · iptu · anuncios ·   │    role      │ funções e triggers (seção 7.4)   │
│  calibracao · cobertura     │              │ Storage: arquivos brutos          │
└─────────────────────────────┘              └───────────────▲──────────────────┘
           │ Firecrawl API (busca + extração)                │
           ▼                                                  │
   lopes / quintoandar / loft · sites de leilão               │
           │ PDFs de edital/laudo/matrícula                   │
           ▼                                                  │
   Claude API (leitura do PDF, só em memória)                 │
                                                              │
Vercel ┌──────────────────────────────────────────────────────┴─┐
       │ apps/web (Next.js)                                      │
       │  /(painel)  painel de conferência (Supabase Auth)       │
       │  /api/mcp   servidor MCP (mcp-handler) + chave de API   │
       └─────────────────────────────────────────────────────────┘
```

### 4.2 Stack e decisões

| Decisão | Escolha | Por quê | Alternativa descartada |
|---|---|---|---|
| Linguagem | TypeScript em tudo (ingestão, painel, MCP) | Decisão do usuário: uma linguagem só | Python para ETL (mais natural para dados, mas duas linguagens) |
| Runtime da ingestão | Node.js 20+ executado com `tsx`, em **GitHub Actions** agendado | Arquivos de 50–300 MB e processamento de minutos; Actions não tem o limite de tempo das funções serverless | Vercel Functions ou Supabase Edge Functions (limites de tempo e memória) |
| Leitura de XLSX | `exceljs` no modo streaming (`stream.xlsx.WorkbookReader`) | A planilha do ITBI tem ~230 mil linhas e ~47 MB; ler tudo em memória é arriscado | SheetJS carregando o arquivo inteiro |
| Leitura de CSV do IPTU | `csv-parse` em stream, filtrando por CEP antes de gravar | A base inteira tem milhões de linhas; só os 10 bairros interessam | Carregar tudo no banco e filtrar depois (estouraria o plano gratuito) |
| Banco | Supabase (Postgres 15+), projeto próprio | Stack padrão do usuário; RLS, Auth e Storage num lugar só | — |
| Painel + MCP | Um app Next.js (App Router) na Vercel | Um deploy só; o usuário já hospeda apps pagos na Vercel | Dois apps separados |
| MCP | `mcp-handler@^2` + `@modelcontextprotocol/server@^2` + `zod@^4` em `app/api/mcp/route.ts` | mcp-handler 2.x serve o protocolo stateless de 2026-07-28 e o Streamable HTTP de 2025 num único handler, sem Redis | `mcp-handler` 1.x / SDK 1.x |
| Coleta de anúncios | **Firecrawl** (`/search` + `/scrape` com extração por schema JSON) | O usuário já usa Firecrawl e tem referência própria; a extração estruturada evita escrever um parser por site | Playwright próprio (mais manutenção, mais bloqueio) |
| Leitura de PDFs de leilão | **Claude API** (Messages com documento PDF, modelo Sonnet), em memória, com o schema da 13.4 | Editais e matrículas costumam ser PDFs escaneados; o modelo lê imagem e texto sem OCR separado. O PDF é descartado depois da extração | OCR próprio (Tesseract) + regex: frágil com matrículas carimbadas ou manuscritas |
| UI do painel | Tailwind + shadcn/ui | Componentes de tabela e formulário prontos | — |
| Projeto de referência | Prelo (servidor MCP próprio do usuário) | Reaproveitar o padrão de ferramentas MCP de consulta | — |

**Premissas a validar (marcadas também na seção 23):**
- **PV1:** o GitHub Actions consegue baixar arquivos de `prefeitura.sp.gov.br` e do GeoSampa (no ambiente de análise, o acesso direto foi bloqueado por proxy, o que não vale para o Actions).
- **PV2:** a base do IPTU está disponível para download sem interação manual. O caminho documentado é o GeoSampa: menu "download de arquivos", depois "cadastro" e "IPTU". Se a URL não for estável, vale o caminho alternativo do épico 8.2 (upload manual para o Storage).
- **PV4:** os sites de leilão da allowlist (assunção A10) aceitam busca e leitura pelo Firecrawl e publicam os PDFs com acesso direto, sem login. Os que exigirem login ficam fora.
- **PV3:** os nomes exatos das colunas do IPTU vêm do `Dicionario_dados_IPTU.xlsx` publicado nos metadados do GeoSampa. Os nomes usados neste spec são os esperados e precisam ser conferidos no épico 8.2.

### 4.3 Onde o código vive e roda

- Repositório GitHub `m2-real` (monorepo, ver 18.3).
- Banco: projeto Supabase `m2-real`.
- Painel e MCP: projeto Vercel apontando para `apps/web`.
- Ingestão: workflows em `.github/workflows/`, com segredos no GitHub Actions.

### 4.4 Agendamento

| Rotina | Quando | O que faz |
|---|---|---|
| `ingestao-itbi` | Dia 8 de cada mês, 06:10 (America/Sao_Paulo), e manual | Baixa a planilha do ano corrente; se mudou (hash), reprocessa o ano |
| `ingestao-iptu` | 15 de fevereiro, anual, e manual | Carrega a emissão geral do ano |
| `coleta-anuncios` | Toda segunda-feira, 05:40, e manual | Coleta para até 150 prédios priorizados (regra 11.13) |
| `coleta-leiloes` | Toda quarta-feira, 05:40, e manual | Busca editais para até 100 prédios priorizados e para as guias de arrematação/consolidação fiduciária (regra 11.19) |
| `calibracao` | Ao fim de cada rotina acima | Recalcula plantas, fatores de referência, vendas consolidadas e cobertura |

---

## 5. Perfis de usuário e matriz de permissões

Dois perfis: **admin** (pessoa, no painel) e **cliente MCP** (pessoa que conecta um assistente ao MCP: entra com Google pelo OAuth, seção 6.5, ou usa uma chave de API criada pelo admin). O pipeline usa a credencial de serviço do Supabase e não é perfil de usuário.

| Ação | Admin (painel) | Cliente MCP | Pipeline (service role) |
|---|---|---|---|
| Ver prédios, plantas, unidades, vendas, anúncios | ✅ todos os 10 bairros | ✅ só pelas 5 ferramentas da 13.2, somente leitura | ✅ |
| Confirmar área privativa de uma planta (revisão manual) | ✅ qualquer planta | ❌ | ❌ (o pipeline nunca sobrescreve um selo `confirmada`, regra 11.11) |
| Casar ou descasar anúncio com prédio/planta | ✅ qualquer anúncio | ❌ | ✅ automático |
| Casar ou descasar edital de leilão com prédio/unidade | ✅ qualquer edital | ❌ | ✅ automático |
| Marcar planta como especial (cobertura/duplex/unificada) | ✅ | ❌ | ✅ sugestão automática |
| Marcar venda como outlier ou desfazer | ✅ | ❌ | ✅ automático |
| Disparar execução manual de ingestão | ✅ via botão que aciona o workflow do GitHub | ❌ | — |
| Criar/revogar chave de API do MCP | ✅ | ❌ | ❌ |
| Criar a própria conta de cliente e conectar um assistente (OAuth, 6.5) | — | ✅ com Google, sujeito à regra 11.18 | ❌ |
| Bloquear/desbloquear conta de cliente | ✅ | ❌ | ❌ |
| Criar outro admin | ❌ no painel (só por seed/SQL, seção 6) | ❌ | ❌ |
| Excluir dados | ❌ (sem exclusão pela interface; seção 7.5) | ❌ | ✅ só substituição de execução (regra 11.1) |

**Primeiro admin:** criado por seed (seção 6.2).

---

## 6. Autenticação e identidade

### 6.1 Painel
- Login por **e-mail e senha** no Supabase Auth. Sem autocadastro: o cadastro público fica desativado no projeto Supabase.
- Só entra quem tem linha em `perfis` com `papel = 'admin'` e `ativo = true`. Usuário autenticado sem perfil ativo vê "Acesso não autorizado" e é desconectado.
- Sessão padrão do Supabase (JWT com refresh); logout no rodapé do menu lateral.
- **Recuperação de senha:** fluxo padrão de e-mail do Supabase ("esqueci a senha"), habilitado.

### 6.2 Primeiro admin (seed)
1. O usuário cria a conta no dashboard do Supabase (Authentication → Add user).
2. Roda `supabase/seed/primeiro_admin.sql` com o e-mail, que insere a linha em `perfis` com `papel = 'admin'`.

Não existe tela para criar admin no MVP.

### 6.3 Cliente MCP
- Chamadas a `/api/mcp` (e `/mcp`) exigem o cabeçalho `Authorization: Bearer <credencial>`. Credencial é o token OAuth `fpq_mcp_…` (6.5), com os limites da regra 11.19, ou a chave de API do painel, sem limite.
- Sem credencial válida: 401 com `WWW-Authenticate: Bearer resource_metadata="<site>/.well-known/oauth-protected-resource"`, que faz o cliente MCP abrir o OAuth sozinho. No limite: 429 com `Retry-After`.
- A chave é gerada no painel (tela "Chaves de API"), mostrada **uma única vez**, e guardada no banco só como hash SHA-256 (`chaves_api.hash_chave`).
- Chave revogada ou inexistente recebe 401 com a mensagem da seção 15.
- A validação roda no servidor (rota do Next.js), que depois consulta o banco com a credencial de serviço. **A credencial de serviço nunca vai para o cliente** (guardrail, seção 18.1).

### 6.4 Políticas de acesso no banco (RLS)

RLS ligado em todas as tabelas. Função auxiliar `eh_admin()` (SECURITY DEFINER, `search_path` fixo) que devolve verdadeiro se `auth.uid()` tem perfil admin ativo.

| Tabela | Leitura | Escrita | Políticas |
|---|---|---|---|
| `bairros`, `predios`, `unidades`, `plantas`, `transacoes`, `vendas_consolidadas`, `anuncios`, `editais_leilao`, `calibracoes`, `fatores_referencia`, `execucoes_ingestao`, `cobertura_bairros` | admin | admin só via funções de revisão (7.4); pipeline via service role (ignora RLS) | `<tabela>_leitura_admin` (select using `eh_admin()`) |
| `plantas`, `anuncios`, `editais_leilao`, `vendas_consolidadas` | admin | admin: update **só** pelas funções `confirmar_area_planta`, `casar_anuncio`, `casar_edital`, `marcar_outlier` | `<tabela>_leitura_admin`; sem política de update direta |
| `perfis` | o próprio usuário lê a própria linha | ninguém pela API | `perfis_leitura_propria` |
| `chaves_api` | admin | admin (insert/update de `ativa`) | `chaves_api_leitura_admin`, `chaves_api_escrita_admin` |
| `clientes`, `oauth_clientes`, `oauth_codigos`, `tokens_mcp`, `uso_mcp` (8.10) | ninguém pela API; admin lê as contas por `clientes_mcp()` | só o servidor (service role) pelas funções `entra_cliente`, `cria_codigo_oauth`, `troca_codigo_oauth`, `usa_token_mcp`; admin bloqueia por `bloqueia_cliente` | RLS ligado, sem política |

### 6.5 OAuth do MCP e contas de cliente (épico 8.10)
Mesmo desenho do Assina, seguindo a especificação de autorização do MCP. Todos os endereços vêm de `NEXT_PUBLIC_SITE_URL`.
1. **Descoberta.** `GET /.well-known/oauth-protected-resource[/mcp]` (RFC 9728) e `GET /.well-known/oauth-authorization-server` (RFC 8414): só `authorization_code`, só PKCE `S256`, cliente público.
2. **Login com Google.** Escopos `openid email`, PKCE e `state`. O `id_token` é validado (assinatura, aud, iss, exp, `email_verified`). A conta de cliente (`clientes`) guarda só o `sub` do Google e o e-mail. Ela fica fora do Supabase Auth: o painel continua só para admin (6.1). Sessão do cliente: cookie HttpOnly assinado (`SESSION_SECRET`), usado só nas telas do OAuth.
3. **Registro de cliente** (RFC 7591), `POST /oauth/registrar`: 1 a 5 `redirect_uris`, https ou http em localhost.
4. **Consentimento**, `/oauth/autorizar`: mostra o nome do cliente, o host de volta, a conta e o que ele pode e não pode fazer. Pedido inválido mostra erro e nunca redireciona. "Permitir" grava um código de 10 min (só o hash).
5. **Token**, `POST /oauth/token`: troca atômica conferindo cliente, `redirect_uri` e PKCE, e devolve `{access_token, token_type: "Bearer"}`. Não há `expires_in` nem refresh token: o token vale até ser revogado ou a conta ser bloqueada. Código reapresentado revoga o token que gerou (RFC 9700).
6. Páginas públicas `/privacidade` e `/termos`, exigidas pela tela de consentimento do Google.

---

## 7. Modelo de dados

Convenção: tabelas, colunas, enums, funções, triggers e políticas em **português**, `snake_case`. Todas as tabelas têm `criado_em timestamptz not null default now()`; as que mudam têm `atualizado_em timestamptz not null default now()`, mantido pelo trigger `atualizar_atualizado_em`.

### 7.1 Enums

| Enum | Valores | Significado |
|---|---|---|
| `fonte_dado` | `itbi`, `iptu`, `anuncio`, `pagina_condominio`, `edital_leilao`, `revisao_manual`, `fator_referencia` | De onde veio um dado |
| `status_execucao` | `em_andamento`, `concluida`, `falhou`, `substituida` | Ciclo de uma execução de ingestão (seção 12) |
| `tipo_unidade` | `apartamento`, `vaga`, `outro` | Classificação da unidade pelo uso do IPTU (regra 11.3) |
| `selo_area` | `confirmada`, `calibrada`, `indicativa`, `estimada`, `sem_dado` | Confiança da área privativa (regra 11.9) |
| `status_casamento` | `casado_planta`, `casado_predio`, `ambiguo`, `sem_predio`, `descartado` | Situação do vínculo de um anúncio (regra 11.8) |
| `finalidade_anuncio` | `venda`, `aluguel` | Tipo do anúncio |
| `origem_bairro` | `campo`, `cep`, `quadra`, `iptu` | Como o bairro da guia foi definido (regra 11.2) |
| `papel_usuario` | `admin` | Perfil do painel |
| `motivo_revisao` | `fator_incoerente`, `anuncios_divergentes`, `anuncio_ambiguo`, `planta_especial`, `venda_fora_da_curva`, `edital_divergente` | Por que algo foi para a fila |
| `status_casamento_edital` | `casado_unidade`, `casado_predio`, `sem_predio`, `descartado` | Situação do vínculo de um edital (regra 11.20) |

### 7.2 Tabelas

**`bairros`**: os 10 bairros cobertos.

| Coluna | Tipo | Nulo | Default | Observação |
|---|---|---|---|---|
| `id` | smallint | não | identity | pk |
| `nome` | text | não | | "Perdizes"; unique |
| `slug` | text | não | | "perdizes"; unique, `^[a-z0-9-]+$` |
| `prefixos_cep` | text[] | não | | CEPs aceitos (regra 11.2) |
| `padroes_nome` | text[] | não | | regex de grafias aceitas no campo bairro da guia |
| `ativo` | boolean | não | true | |

**`execucoes_ingestao`**: uma linha por execução de rotina.

| Coluna | Tipo | Nulo | Default | Observação |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | pk |
| `fonte` | fonte_dado | não | | `itbi`, `iptu`, `anuncio`, `pagina_condominio` ou `edital_leilao` |
| `rotina` | text | não | | `ingestao-itbi`, `ingestao-iptu`, `coleta-anuncios`, `coleta-leiloes`, `calibracao` |
| `referencia` | text | sim | | ano do ITBI ("2026"), exercício do IPTU ("2026"); nulo nas coletas e na calibração |
| `arquivo_url` | text | sim | | URL de origem; nulo na calibração |
| `arquivo_hash` | text | sim | | SHA-256 do arquivo baixado; nulo na calibração e na coleta |
| `caminho_storage` | text | sim | | onde o bruto ficou guardado; nulo quando não há arquivo |
| `status` | status_execucao | não | `em_andamento` | |
| `linhas_lidas` | integer | não | 0 | |
| `linhas_gravadas` | integer | não | 0 | |
| `linhas_descartadas` | integer | não | 0 | |
| `mensagem_erro` | text | sim | | só quando `falhou` |
| `iniciada_em` | timestamptz | não | now() | |
| `concluida_em` | timestamptz | sim | | nula enquanto em andamento |

**`predios`**: um condomínio residencial vertical, montado a partir do IPTU.

| Coluna | Tipo | Nulo | Default | Observação |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | pk |
| `chave_predio` | text | não | | `setor-quadra-condominio` (regra 11.4); unique |
| `setor` | char(3) | não | | do SQL |
| `quadra` | char(3) | não | | do SQL |
| `numero_condominio` | text | não | | do IPTU |
| `bairro_id` | smallint | não | | fk `bairros.id` |
| `logradouro` | text | não | | normalizado (regra 11.5) |
| `numero` | integer | sim | | nulo se o IPTU não tiver número |
| `cep` | char(8) | não | | |
| `ano_construcao` | smallint | sim | | nulo se ausente no IPTU |
| `qtd_pavimentos` | smallint | sim | | nulo se ausente |
| `padrao_iptu` | text | sim | | descrição do padrão |
| `total_unidades_residenciais` | integer | não | 0 | |
| `vagas_cadastro_proprio` | boolean | não | false | regra 11.6 |
| `fator_predio` | numeric(5,3) | sim | | mediana dos fatores das plantas com selo ≥ indicativa; nulo sem calibração |
| `prioridade_coleta` | integer | não | 0 | regra 11.13 |
| `ultima_coleta_em` | timestamptz | sim | | nula se nunca coletado |
| `ultima_coleta_leilao_em` | timestamptz | sim | | nula se nunca buscado em leilões (regra 11.19) |
| `exercicio_iptu` | smallint | não | | ano da emissão geral que gerou o registro |

**`unidades`**: uma linha por número de cadastro do IPTU (SQL) dentro de um prédio.

| Coluna | Tipo | Nulo | Default | Observação |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | pk |
| `sql` | char(11) | não | | número do contribuinte, zero à esquerda; unique |
| `predio_id` | uuid | não | | fk `predios.id` |
| `planta_id` | uuid | sim | | fk `plantas.id`; nulo para vagas e outros usos |
| `tipo_unidade` | tipo_unidade | não | | regra 11.3 |
| `complemento` | text | sim | | "APTO 72"; nulo se ausente |
| `uso_iptu` | text | não | | descrição do uso |
| `area_construida` | numeric(10,2) | não | | m², IPTU |
| `fracao_ideal` | numeric(8,6) | sim | | nula se ausente |
| `andar_inferido` | smallint | sim | | extraído do complemento (regra 11.7); nulo se não der |

**`plantas`**: grupo de unidades de mesmo tamanho dentro de um prédio.

| Coluna | Tipo | Nulo | Default | Observação |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | pk |
| `predio_id` | uuid | não | | fk `predios.id` |
| `area_iptu_referencia` | numeric(10,2) | não | | mediana da área construída das unidades do grupo |
| `qtd_unidades` | integer | não | | |
| `area_privativa` | numeric(8,2) | sim | | nula enquanto `selo = 'sem_dado'` |
| `vagas_inclusas` | smallint | sim | | vagas somadas à área do IPTU quando o prédio não tem vaga com cadastro próprio; nulo se desconhecido |
| `quartos` | smallint | sim | | dos anúncios; nulo se desconhecido |
| `fator` | numeric(5,3) | sim | | `area_privativa / area_iptu_referencia` |
| `selo` | selo_area | não | `sem_dado` | regra 11.9 |
| `fonte_area` | fonte_dado | sim | | nula com `sem_dado` |
| `faixa_erro_pct` | numeric(5,1) | sim | | só no selo `estimada` |
| `especial` | boolean | não | false | cobertura, duplex ou unificada (regra 11.12) |
| `revisao_pendente` | boolean | não | false | |
| `motivo_revisao` | motivo_revisao | sim | | nulo quando não há revisão pendente |

**`transacoes`**: uma linha por guia de ITBI dos 10 bairros (todas as naturezas e usos).

| Coluna | Tipo | Nulo | Default | Observação |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | pk |
| `hash_linha` | text | não | | SHA-256 das colunas originais; unique (idempotência) |
| `execucao_id` | uuid | não | | fk `execucoes_ingestao.id` |
| `sql` | char(11) | não | | |
| `unidade_id` | uuid | sim | | fk `unidades.id`; nulo se o SQL não existe no IPTU carregado (unidade nova, regra 11.14) |
| `predio_id` | uuid | sim | | fk `predios.id`; nulo pelo mesmo motivo |
| `bairro_id` | smallint | não | | fk `bairros.id` |
| `origem_bairro` | origem_bairro | não | | regra 11.2 |
| `logradouro` | text | não | | como veio na guia |
| `numero` | integer | sim | | |
| `complemento` | text | sim | | |
| `cep` | char(8) | sim | | |
| `natureza` | text | não | | "1.Compra e venda" etc. |
| `eh_compra_venda` | boolean | não | | natureza começa com "1." |
| `data_transacao` | date | não | | |
| `mes_referencia` | date | não | | primeiro dia do mês de pagamento do imposto (aba da planilha) |
| `valor_declarado` | numeric(14,2) | não | | |
| `valor_venal_referencia` | numeric(14,2) | sim | | proporcional |
| `base_calculo` | numeric(14,2) | sim | | |
| `proporcao_transmitida` | numeric(6,4) | sim | | |
| `tipo_financiamento` | text | sim | | |
| `valor_financiado` | numeric(14,2) | não | 0 | |
| `cartorio` | text | sim | | |
| `matricula` | text | sim | | |
| `uso_iptu_guia` | text | sim | | |
| `area_construida_guia` | numeric(10,2) | sim | | |
| `fracao_ideal_guia` | numeric(8,6) | sim | | |
| `unidade_sem_cadastro_proprio` | boolean | não | false | regra 11.14 |

**`vendas_consolidadas`**: uma venda de apartamento (com as vagas vendidas junto). Tabela recalculada inteira a cada calibração.

| Coluna | Tipo | Nulo | Default | Observação |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | pk |
| `transacao_apartamento_id` | uuid | não | | fk `transacoes.id`; unique |
| `transacoes_vagas_ids` | uuid[] | não | `'{}'` | guias de vaga agregadas (regra 11.15) |
| `predio_id` | uuid | não | | fk |
| `unidade_id` | uuid | não | | fk |
| `planta_id` | uuid | sim | | fk; nulo se a unidade não tem planta |
| `data_transacao` | date | não | | |
| `valor_apartamento` | numeric(14,2) | não | | |
| `valor_vagas` | numeric(14,2) | não | 0 | |
| `valor_total` | numeric(14,2) | não | | apartamento + vagas |
| `qtd_vagas_separadas` | smallint | não | 0 | |
| `vagas_inclusas_area` | smallint | sim | | copiado da planta |
| `area_privativa` | numeric(8,2) | sim | | da planta; nulo com `sem_dado` |
| `selo_area` | selo_area | não | | da planta |
| `m2_privativo` | numeric(10,2) | sim | | `valor_total / area_privativa`; nulo sem área |
| `m2_iptu` | numeric(10,2) | não | | `valor_apartamento / area_construida da unidade` |
| `fora_da_curva` | boolean | não | false | regra 11.16 |
| `marcado_manual` | boolean | não | false | admin forçou ou desfez o "fora da curva" |

**`anuncios`**: página de condomínio ou anúncio coletado, só com os campos mínimos.

| Coluna | Tipo | Nulo | Default | Observação |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | pk |
| `url` | text | não | | unique |
| `dominio` | text | não | | `lopes.com.br`, `quintoandar.com.br`, `loft.com.br` |
| `fonte` | fonte_dado | não | | `anuncio` ou `pagina_condominio` |
| `execucao_id` | uuid | não | | fk |
| `logradouro_extraido` | text | sim | | |
| `numero_extraido` | integer | sim | | |
| `nome_condominio` | text | sim | | |
| `finalidade` | finalidade_anuncio | sim | | nulo em página de condomínio |
| `area_privativa` | numeric(8,2) | sim | | área útil/privativa declarada |
| `area_privativa_min` | numeric(8,2) | sim | | página de condomínio com faixa ("70 a 89 m²") |
| `area_privativa_max` | numeric(8,2) | sim | | idem |
| `quartos` | smallint | sim | | |
| `vagas` | smallint | sim | | |
| `andar` | smallint | sim | | |
| `preco_pedido` | numeric(14,2) | sim | | venda ou aluguel |
| `predio_id` | uuid | sim | | fk; nulo se não casou |
| `planta_id` | uuid | sim | | fk; nulo se não casou com planta |
| `status_casamento` | status_casamento | não | `sem_predio` | regra 11.8 |
| `confianca_casamento` | numeric(4,3) | sim | | 0–1 |
| `casado_manual` | boolean | não | false | admin definiu o vínculo; o pipeline não altera (regra 11.11) |
| `coletado_em` | timestamptz | não | now() | |

**`editais_leilao`**: edital de leilão (judicial ou extrajudicial) de uma unidade dos 10 bairros, só com os campos extraídos. O PDF não é guardado.

| Coluna | Tipo | Nulo | Default | Observação |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | pk |
| `url` | text | não | | página do lote; unique |
| `url_documento` | text | sim | | link do PDF lido (edital, laudo ou matrícula); nulo se os dados vieram da página |
| `dominio` | text | não | | site de leilão |
| `execucao_id` | uuid | não | | fk |
| `logradouro_extraido` | text | sim | | |
| `numero_extraido` | integer | sim | | |
| `complemento_extraido` | text | sim | | "apto 52" |
| `matricula` | text | sim | | número da matrícula, só dígitos |
| `cartorio` | text | sim | | "10º Cartório de Registro de Imóveis" |
| `area_privativa` | numeric(8,2) | sim | | área privativa/útil declarada no documento |
| `area_comum` | numeric(8,2) | sim | | |
| `area_total` | numeric(8,2) | sim | | |
| `fracao_ideal` | numeric(8,6) | sim | | |
| `vagas` | smallint | sim | | |
| `vagas_vinculadas_area` | boolean | sim | | verdadeiro se o documento diz que as vagas estão incluídas na área da unidade (vaga indeterminada ou sem matrícula própria); nulo se não diz |
| `valor_avaliacao` | numeric(14,2) | sim | | |
| `data_leilao` | date | sim | | primeira praça |
| `origem_documento` | text | não | | `pagina`, `edital`, `laudo` ou `matricula` |
| `predio_id` | uuid | sim | | fk; nulo se não casou |
| `unidade_id` | uuid | sim | | fk; nulo se só casou com o prédio |
| `status_casamento` | status_casamento_edital | não | `sem_predio` | regra 11.20 |
| `casado_manual` | boolean | não | false | admin definiu o vínculo; o pipeline não altera |
| `coletado_em` | timestamptz | não | now() | |

**`calibracoes`**: histórico de toda mudança de área de uma planta (auditoria).

| Coluna | Tipo | Nulo | Default | Observação |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | pk |
| `planta_id` | uuid | não | | fk |
| `area_privativa` | numeric(8,2) | sim | | nula se a calibração apagou a área |
| `vagas_inclusas` | smallint | sim | | |
| `fator` | numeric(5,3) | sim | | |
| `selo` | selo_area | não | | |
| `fonte` | fonte_dado | não | | |
| `anuncios_ids` | uuid[] | não | `'{}'` | anúncios usados como evidência |
| `editais_ids` | uuid[] | não | `'{}'` | editais usados como evidência |
| `observacao` | text | sim | | obrigatória na revisão manual |
| `autor` | text | não | | `pipeline` ou e-mail do admin |

**`fatores_referencia`**: fator típico por grupo, para estimar prédios sem anúncio (regra 11.10).

| Coluna | Tipo | Nulo | Default | Observação |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | pk |
| `bairro_id` | smallint | sim | | nulo = grupo da cidade toda (os 10 bairros) |
| `decada_construcao` | smallint | sim | | 1960, 1970…; nulo = todas |
| `vagas_cadastro_proprio` | boolean | não | | |
| `fator_mediano` | numeric(5,3) | não | | |
| `fator_p25` | numeric(5,3) | não | | |
| `fator_p75` | numeric(5,3) | não | | |
| `qtd_plantas` | integer | não | | quantas plantas calibradas formam o grupo |
| `calculado_em` | timestamptz | não | now() | |

Unique (`bairro_id`, `decada_construcao`, `vagas_cadastro_proprio`), com `nulls not distinct`.

**`cobertura_bairros`**: foto mensal do indicador de cobertura (D12).

| Coluna | Tipo | Nulo | Default | Observação |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | pk |
| `bairro_id` | smallint | não | | fk |
| `calculado_em` | timestamptz | não | now() | |
| `vendas_24m` | integer | não | | vendas consolidadas dos últimos 24 meses |
| `vendas_confirmada` | integer | não | | |
| `vendas_calibrada` | integer | não | | |
| `vendas_indicativa` | integer | não | | |
| `vendas_estimada` | integer | não | | |
| `vendas_sem_dado` | integer | não | | |
| `pct_cobertura` | numeric(5,1) | não | | (confirmada + calibrada) / vendas_24m × 100 |

**`perfis`**

| Coluna | Tipo | Nulo | Default | Observação |
|---|---|---|---|---|
| `id` | uuid | não | | pk, fk `auth.users.id` |
| `email` | text | não | | |
| `papel` | papel_usuario | não | `admin` | |
| `ativo` | boolean | não | true | |

**`chaves_api`**

| Coluna | Tipo | Nulo | Default | Observação |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | pk |
| `nome` | text | não | | "Claude pessoal" |
| `prefixo` | char(8) | não | | primeiros 8 caracteres, para identificar na tela |
| `hash_chave` | text | não | | SHA-256; unique |
| `ativa` | boolean | não | true | |
| `ultimo_uso_em` | timestamptz | sim | | nulo se nunca usada |
| `criada_por` | uuid | não | | fk `perfis.id` |

### 7.3 Relacionamentos

```
bairros 1 ── N predios 1 ── N unidades N ── 1 plantas N ── 1 predios
bairros 1 ── N transacoes N ── 0..1 unidades ; transacoes N ── 0..1 predios
vendas_consolidadas N ── 1 predios / unidades / plantas(0..1) ; 1 ── 1 transacoes (apartamento)
anuncios N ── 0..1 predios ; anuncios N ── 0..1 plantas
editais_leilao N ── 0..1 predios ; editais_leilao N ── 0..1 unidades
plantas 1 ── N calibracoes
execucoes_ingestao 1 ── N transacoes ; 1 ── N anuncios ; 1 ── N editais_leilao
bairros 1 ── N fatores_referencia (bairro_id nulo = geral) ; bairros 1 ── N cobertura_bairros
perfis 1 ── N chaves_api
```

Índices: `transacoes(sql)`, `transacoes(predio_id, data_transacao)`, `transacoes(bairro_id, data_transacao)`, `unidades(predio_id)`, `unidades(planta_id)`, `plantas(predio_id)`, `vendas_consolidadas(predio_id, data_transacao)`, `vendas_consolidadas(planta_id)`, `anuncios(predio_id)`, `editais_leilao(predio_id)`, `editais_leilao(matricula)`, `predios(bairro_id)`, `predios(logradouro, numero)`, e índice trigram (`pg_trgm`) em `predios.logradouro` para a busca de endereço do MCP (regra 11.5).

### 7.4 Lógica no banco

| Nome | Tipo | Onde atua | O que faz |
|---|---|---|---|
| `atualizar_atualizado_em` | trigger (before update) | todas as tabelas com `atualizado_em` | Grava `now()` em `atualizado_em` |
| `eh_admin()` | função SECURITY DEFINER | políticas | Devolve se `auth.uid()` tem perfil admin ativo |
| `confirmar_area_planta(planta_id, area_privativa, vagas_inclusas, observacao)` | função SECURITY DEFINER | `plantas`, `calibracoes` | Exige `eh_admin()` e observação não vazia; grava área, fator e selo `confirmada` com fonte `revisao_manual`; limpa a revisão; insere em `calibracoes` |
| `casar_anuncio(anuncio_id, predio_id, planta_id)` | função SECURITY DEFINER | `anuncios` | Exige `eh_admin()`; grava o vínculo com `casado_manual = true` e status `casado_planta`, `casado_predio` ou `descartado` |
| `casar_edital(edital_id, predio_id, unidade_id)` | função SECURITY DEFINER | `editais_leilao` | Exige `eh_admin()`; grava o vínculo com `casado_manual = true` e status `casado_unidade`, `casado_predio` ou `descartado` |
| `marcar_outlier(venda_id, fora_da_curva)` | função SECURITY DEFINER | `vendas_consolidadas` | Exige `eh_admin()`; grava `fora_da_curva` e `marcado_manual = true` |
| `buscar_predio_por_endereco(texto)` | função | `predios` | Normaliza o texto (regra 11.5) e devolve até 5 prédios por similaridade trigram + número exato |

As rotinas pesadas (montar plantas, consolidar vendas, calibrar, calcular cobertura) rodam **no código da ingestão** (`packages/ingestao/src/calibracao/`), não no banco, para ficarem testáveis com Vitest.

### 7.5 Exclusão e versionamento

- **Sem exclusão pela interface.** Nada é apagado no painel nem pelo MCP.
- **Reprocessamento:** ao recarregar um ano do ITBI, a execução nova insere por `hash_linha` (on conflict do nothing). As guias da execução anterior que não aparecem mais no arquivo novo são apagadas, e a execução anterior fica `substituida` (regra 11.1). É a única exclusão física do sistema e é feita pelo pipeline.
- `vendas_consolidadas`, `fatores_referencia` e `cobertura_bairros` (exceto o histórico) são recalculados pelo pipeline. Linhas com `marcado_manual = true` são preservadas.
- **Migrations** versionadas em `supabase/migrations/`; uma migration aplicada nunca é editada (guardrail 18.1).

### 7.6 Seed

- Os 10 bairros em `bairros`, com os prefixos de CEP e padrões de nome da tabela 11.2.
- Primeiro admin (6.2).

### 7.7 Trade-offs declarados

- `vendas_consolidadas` é tabela recalculada, não view: a consolidação (regra 11.15) é complexa demais para view e precisa ser consultada rápido pelo MCP. O custo é ficar defasada entre calibrações, o que é aceitável, porque os dados mudam uma vez por mês.
- `transacoes_vagas_ids` é array, não tabela de ligação: simplifica a leitura, e uma venda raramente tem mais de 3 vagas. A consequência é não conseguir uma FK de integridade nesses ids.

---

## 8. Épicos e critérios de aceite

Ordem de implementação: 8.0 → 8.9.

### 8.0 Guardrails e esqueleto do repositório
**Objetivo:** repositório pronto, com os guardrails do Anexo B ativos antes de qualquer feature.
- [ ] Monorepo criado com a estrutura da 18.3; `npm run typecheck`, `npm test` e `npm run build` rodam e passam (vazios).
- [ ] Arquivos do Anexo B criados, scripts com permissão de execução.
- [ ] Cada hook testado uma vez provocando a violação, com a saída de bloqueio colada no PR.
- [ ] `CLAUDE.md`, `README.md` e `.env.example` criados.

### 8.1 Banco, políticas e seed
**Objetivo:** schema da seção 7 aplicado, com RLS.
- [ ] Todas as tabelas, enums, índices, funções e triggers da seção 7 criados por migrations.
- [ ] Teste de RLS: um usuário autenticado sem perfil recebe 0 linhas em `predios`; um admin recebe as linhas; `anon` recebe 0 linhas.
- [ ] `confirmar_area_planta` chamada por não-admin gera erro; por admin com observação vazia gera erro.
- [ ] Advisors do Supabase (security + performance) sem alerta crítico.
- [ ] Seed dos 10 bairros aplicado.

### 8.2 Ingestão do IPTU e montagem de prédios
**Objetivo:** estrutura de prédios, unidades e plantas dos 10 bairros.

Fluxo: localizar o arquivo da emissão geral → baixar (ou ler do Storage, se enviado manualmente para `brutos/iptu/<ano>.csv`) → gravar o bruto no Storage → ler em stream → filtrar por prefixo de CEP dos 10 bairros → montar prédios e unidades (regras 11.3, 11.4, 11.6, 11.7) → agrupar plantas (regra 11.7) → registrar a execução.
- [ ] Nomes de colunas conferidos contra o `Dicionario_dados_IPTU.xlsx` e registrados em `packages/ingestao/src/iptu/colunas.ts` (resolve PV3).
- [ ] Prédios de teste existem com os valores esperados: Rua Joaquim Antunes, 577 (Pinheiros), com unidades de apartamento de área construída ≈ 132 m² e vagas com cadastro próprio (`vagas_cadastro_proprio = true`); Rua Caiubi, 324 (Perdizes), com unidades de área ≈ 169 m² e `vagas_cadastro_proprio = false`.
- [ ] Rodar duas vezes o mesmo arquivo não duplica nenhuma linha.
- [ ] Nenhuma coluna de nome de contribuinte ou de dado pessoal é gravada (seção 20).
- [ ] Se o download falhar, a execução fica `falhou` com mensagem, e a rotina aceita o arquivo pelo caminho do Storage.

### 8.3 Ingestão do ITBI
**Objetivo:** guias de 2021 até o mês mais recente nos 10 bairros.

Fluxo: abrir a página de dados do ITBI da Fazenda → listar os links .xlsx → para cada ano (2021+), baixar → calcular o hash → pular se for igual ao da última execução concluída daquele ano → ler em stream as 12 abas mensais (ignorar LEGENDA, EXPLICAÇÕES e tabelas auxiliares) → atribuir bairro (regra 11.2) → descartar guias fora dos 10 bairros → gravar (regra 11.1) → ligar a `unidades`/`predios` pelo SQL → marcar unidade sem cadastro próprio (regra 11.14).
- [ ] Planilha de 2025: 13.289 ± 2% guias nos 10 bairros, 11.355 ± 2% de compra e venda (valores medidos na análise de 20/11/2026).
- [ ] Guias da Joaquim Antunes, 577 em 2025: 6 (3 apartamentos e 3 vagas), com os valores da tabela de teste T1 (seção 22).
- [ ] Planilha de mesmo hash não gera nova execução de gravação (a execução registra "sem mudança" e conclui com 0 linhas gravadas).
- [ ] Abas com 28 ou 29 colunas são lidas pelo nome do cabeçalho, não pela posição.

### 8.4 Consolidação de vendas
**Objetivo:** cada venda de apartamento com suas vagas.
- [ ] Joaquim Antunes, 577, apto 11, 14/11/2025: `valor_total = 1.630.000`, `valor_vagas = 240.000`, `qtd_vagas_separadas = 1`.
- [ ] Caiubi, 324, AP 24, 29/08/2025: `valor_total = 762.600`, `qtd_vagas_separadas = 0`.
- [ ] Nenhuma guia de vaga é agregada a duas vendas.
- [ ] Guias com `unidade_sem_cadastro_proprio = true` não geram venda consolidada.

### 8.5 Coleta de anúncios e páginas de condomínio
**Objetivo:** evidências de área privativa por prédio.

Fluxo: escolher até 150 prédios por prioridade (regra 11.13) → para cada um, buscar no Firecrawl `"<logradouro>, <número>" <bairro> São Paulo` restrito aos domínios da allowlist → para até 5 resultados por prédio, fazer `/scrape` com extração pelo schema da 13.3 → normalizar e gravar em `anuncios` → casar com prédio e planta (regra 11.8).
- [ ] Para a Joaquim Antunes, 577, ao menos uma página coletada com área privativa 94 m² (± 2) casada com o prédio.
- [ ] Nenhum campo além dos da tabela `anuncios` é gravado (teste confere as chaves do objeto antes do insert).
- [ ] Só domínios da allowlist são acessados (teste unitário do filtro).
- [ ] A execução respeita o limite de créditos por rodada (variável `FIRECRAWL_MAX_CREDITOS_EXECUCAO`) e termina como `concluida`, com o total usado, quando o atinge.
- [ ] Prédio coletado tem `ultima_coleta_em` atualizado e não é recoletado antes de 90 dias.

### 8.5.1 Coleta de editais de leilão
**Objetivo:** gabarito oficial e gratuito da área privativa, a partir de editais, laudos e matrículas publicados em leilões. Implementar depois do 8.5 e antes do 8.6.

Fluxo:
1. Montar a lista de alvos (regra 11.19).
2. Para cada alvo, buscar no Firecrawl `"<logradouro>, <número>" leilão São Paulo`, restrito aos domínios da allowlist de leilão.
3. Para até 3 resultados por alvo, fazer `/scrape` da página do lote com o schema da 13.3 estendido (tipo `edital_leilao`).
4. Se a página não trouxer área privativa e houver link de PDF (edital, laudo ou matrícula), baixar o PDF **em memória** e enviar à Claude API com o schema da 13.4.
5. Descartar o PDF.
6. Gravar só os campos de `editais_leilao`.
7. Casar com prédio e unidade (regra 11.20).

Critérios de aceite:
- [ ] Teste de extração com o laudo público do apto 52 da Rua Canário, 906 (Indianópolis, fora dos 10 bairros, usado só como fixture de extração): área privativa = 184,32 m² e vagas = 2.
- [ ] Nenhum nome, CPF, CNPJ, estado civil ou endereço de pessoa chega ao insert: um teste confere as chaves do objeto, e outro, com PDF de exemplo, verifica que a resposta da API passa pelo filtro de campos.
- [ ] Nenhum PDF é gravado em disco nem no Storage (teste do módulo: o buffer não é persistido).
- [ ] Edital cuja matrícula bate com a `matricula` de uma guia do ITBI da mesma unidade casa com `casado_unidade`.
- [ ] Limites por execução respeitados: `LEILAO_MAX_ALVOS_EXECUCAO` (padrão 100) e `CLAUDE_MAX_DOCUMENTOS_EXECUCAO` (padrão 150).
- [ ] Execução registrada em `execucoes_ingestao` com `rotina = 'coleta-leiloes'` e `fonte = 'edital_leilao'`.

### 8.6 Calibração e fatores de referência
**Objetivo:** área privativa e selo em cada planta.
- [ ] Joaquim Antunes, 577: a planta de ≈132 m² recebe `area_privativa = 94` (± 2), `fator ≈ 0,71`, selo `calibrada` se houver ≥ 2 evidências concordantes ou `indicativa` com 1.
- [ ] Plantas sem evidência recebem selo `estimada`, com o fator do grupo mais específico com ≥ 8 plantas (regra 11.10) e faixa de erro preenchida.
- [ ] Prédio com fatores de plantas divergindo mais que o limite da regra 11.12 entra na fila com `fator_incoerente`.
- [ ] Planta `confirmada` não é alterada por nenhuma execução (teste explícito).
- [ ] Planta com edital casado (unidade da planta) recebe selo `confirmada` com fonte `edital_leilao` e a área do edital (regra 11.9).
- [ ] Edital cuja área diverge mais de 5% da área calibrada por anúncios gera revisão `edital_divergente`, e vale a área do edital.
- [ ] Toda mudança de área gera linha em `calibracoes`.
- [ ] `cobertura_bairros` recebe uma linha por bairro ao fim da calibração.

### 8.7 Painel: autenticação, visão geral e prédios
- [ ] Login, logout e recuperação de senha funcionando; usuário sem perfil vê "Acesso não autorizado".
- [ ] Visão geral mostra, por bairro: vendas dos últimos 24 meses, % de cobertura e distribuição por selo, iguais à última linha de `cobertura_bairros`.
- [ ] Lista de prédios filtra por bairro, selo, "com revisão pendente" e busca por endereço.
- [ ] Ficha do prédio mostra plantas (área IPTU, área privativa, fator, selo, vagas), vendas consolidadas (com m² privativo e selo), anúncios casados (com link), editais casados (com link) e o histórico de calibração.
- [ ] Estados vazio, carregando e erro em todas as telas.

### 8.8 Painel: revisão e operação
- [ ] Fila de revisão lista plantas e vendas pendentes, agrupadas por motivo, ordenadas pelo volume de vendas do prédio.
- [ ] "Confirmar área" chama `confirmar_area_planta`; sem observação, o botão fica desabilitado.
- [ ] Anúncios ambíguos ou sem prédio podem ser casados ou descartados manualmente (`casar_anuncio`); editais sem vínculo também (`casar_edital`).
- [ ] Tela de execuções lista as últimas 50, com status e contagens; o botão "Executar agora" dispara o workflow pelo GitHub API (`workflow_dispatch`).
- [ ] Tela de chaves de API cria a chave (mostrada uma vez), lista pelo prefixo e revoga.

### 8.9 Servidor MCP
- [ ] `/api/mcp` responde às 5 ferramentas da 13.2 com os schemas definidos.
- [ ] Sem chave ou com chave revogada: 401.
- [ ] `buscar_predio("rua caiubi 324")` devolve o prédio da Caiubi, 324 em primeiro lugar.
- [ ] `vendas_predio` da Joaquim Antunes, 577 devolve as 3 vendas de 2025 com `valor_total`, `m2_privativo` e `selo_area`.
- [ ] Toda resposta com m² traz o selo e a área usada (princípio 1).
- [ ] Teste de cliente com `node scripts/test-client.mjs` contra o deploy de preview passa.

### 8.10 MCP com OAuth e cadastro aberto
- [ ] `/mcp` sem credencial responde 401 com `resource_metadata`, e os metadados da 6.5 respondem.
- [ ] Registro de cliente, consentimento e troca de código funcionam com PKCE; pedido inválido não redireciona; código reusado revoga o token.
- [ ] Login com Google cria a conta de cliente com só `sub` e e-mail; limite diário de contas novas (11.18).
- [ ] Token OAuth acessa as 5 ferramentas; acima do limite (11.19), 429 com `Retry-After`; conta bloqueada no painel perde o acesso na hora.
- [ ] A chave de API do painel continua valendo (`scripts/test-client.mjs` passa).
- [ ] Conectar no Claude.ai só com a URL `https://fechouporquanto.com.br/mcp` e chamar `buscar_predio`.

---

## 9. Fluxos principais ponta a ponta

**9.1 Ciclo mensal (caminho feliz)**
1. Dia 8: `ingestao-itbi` baixa a planilha do ano; o hash mudou; grava as guias novas.
2. `calibracao` consolida as vendas, recalcula selos e fatores e grava a cobertura.
3. Na segunda seguinte, `coleta-anuncios` prioriza os prédios com vendas novas e selo fraco; na quarta, `coleta-leiloes` procura editais desses prédios e das guias de arrematação.
4. `calibracao` roda de novo; plantas sobem de `estimada` para `indicativa`/`calibrada`, e as que ganharam edital vão para `confirmada`.
5. O admin abre a fila de revisão e resolve os casos marcados.

**9.2 Exceções**
- Planilha não mudou: a execução conclui com 0 gravadas; a calibração não roda.
- Download falha: execução `falhou`, e o painel mostra o erro na tela de execuções. Nada é apagado.
- Guia com SQL inexistente no IPTU (unidade nova): grava com `unidade_id` nulo; quando o IPTU do ano seguinte trouxer o SQL, a calibração liga a guia à unidade.
- Prédio sem anúncio nenhum: fica `estimada` pelo fator de referência, com faixa de erro.
- Pergunta ao MCP sobre endereço fora dos 10 bairros: resposta de "fora da cobertura" (seção 15), não erro.

---

## 10. Inventário de telas

Todas são do perfil **[Admin]**.

| Tela | Mostra | Filtros | Ações (leitura / escrita) | Lê | Escreve |
|---|---|---|---|---|---|
| [Admin] Login | e-mail, senha, "esqueci a senha" | — | entrar | `perfis` | — |
| [Admin] Visão geral | card por bairro: vendas 24m, % cobertura, barra por selo; data da última execução de cada rotina | — | leitura | `cobertura_bairros`, `execucoes_ingestao` | — |
| [Admin] Prédios | tabela: endereço, bairro, ano, nº unidades, nº plantas, pior selo, vendas 24m, revisão pendente | bairro, selo, revisão pendente, busca por endereço | abrir ficha | `predios`, `plantas`, `vendas_consolidadas` | — |
| [Admin] Ficha do prédio | cabeçalho (endereço, ano, pavimentos, padrão, vagas com cadastro próprio, fator do prédio); abas Plantas, Vendas, Anúncios, Editais, Histórico | período nas vendas | confirmar área da planta; marcar planta especial; marcar/desmarcar venda fora da curva; casar/descartar anúncio ou edital | `predios`, `plantas`, `unidades`, `vendas_consolidadas`, `anuncios`, `editais_leilao`, `calibracoes` | via `confirmar_area_planta`, `casar_anuncio`, `casar_edital`, `marcar_outlier` |
| [Admin] Fila de revisão | itens pendentes agrupados por motivo, com as evidências resumidas | bairro, motivo | abrir ficha na aba certa | `plantas`, `vendas_consolidadas`, `anuncios` | — |
| [Admin] Evidências sem vínculo | duas abas: Anúncios (`ambiguo` e `sem_predio`) e Editais (`sem_predio` e `casado_predio`), com endereço extraído, área e link | domínio, status | casar com prédio/planta ou prédio/unidade; descartar | `anuncios`, `editais_leilao`, `predios`, `plantas`, `unidades` | via `casar_anuncio`, `casar_edital` |
| [Admin] Execuções | últimas 50 execuções: rotina, referência, status, contagens, duração, erro | rotina, status | "Executar agora" por rotina | `execucoes_ingestao` | GitHub API (servidor) |
| [Admin] Chaves de API | lista: nome, prefixo, criada em, último uso, ativa; seção "Contas conectadas" (8.10): e-mail, criada em, último uso, chamadas 24 h, conexões, situação | — | criar; revogar; bloquear/desbloquear conta | `chaves_api`, `clientes_mcp()` | `chaves_api`, `bloqueia_cliente` |
| [Cliente MCP] Entrar | "Entrar com Google" e mensagens de erro (8.10) | — | entrar | — | `clientes` (servidor) |
| [Cliente MCP] Autorizar conexão | nome do cliente, o que pode e não pode, host de volta, conta | — | permitir; cancelar; usar outra conta | `oauth_clientes` | `oauth_codigos` (servidor) |
| [Público] Privacidade e Termos | texto legal (8.10) | — | — | — | — |

---

## 11. Regras de negócio

| # | Regra | Detalhe | Onde |
|---|---|---|---|
| 11.1 | Idempotência e substituição do ITBI | Cada guia tem `hash_linha` = SHA-256 das 28 colunas originais concatenadas com `|`. Insert com on conflict do nothing. Depois de gravar o ano, apagar as guias daquele ano cuja execução é anterior e cujo hash não apareceu no arquivo novo; marcar a execução anterior como `substituida` | ingestão |
| 11.2 | Bairro da guia | Ordem: (1) campo bairro normalizado (maiúsculas, sem acento, espaços simples) bate com um dos `padroes_nome` → `campo`; (2) senão, o SQL existe em `unidades` → bairro do prédio → `iptu`; (3) senão, voto por CEP de 8 dígitos entre guias do mesmo ano com bairro conhecido, aceito se o vencedor tem ≥ 60% dos votos e ≥ 2 votos → `cep`; (4) senão, voto por setor+quadra (6 primeiros dígitos do SQL), mesmo critério → `quadra`. Em todos os casos o CEP da guia precisa começar com um dos `prefixos_cep` do bairro; se não começar, a guia é descartada | ingestão |
| 11.3 | Tipo de unidade | Uso IPTU começando com "APARTAMENTO EM CONDOMÍNIO" → `apartamento`; contendo "GARAGEM" → `vaga`; demais → `outro` | ingestão |
| 11.4 | Prédio | Unidades do IPTU com o mesmo setor, quadra e número de condomínio formam um prédio; `chave_predio = setor-quadra-condominio`. Só viram prédio os grupos com ≥ 4 unidades `apartamento` | ingestão |
| 11.5 | Normalização de endereço | Maiúsculas, sem acento, abreviações padronizadas (R→RUA, AV→AVENIDA, AL→ALAMEDA, PCA→PRACA, DR→DOUTOR, PROF→PROFESSOR, CEL→CORONEL, MIN→MINISTRO, CAP→CAPITAO, SEN→SENADOR, VER→VEREADOR), sem pontuação. Busca: similaridade trigram ≥ 0,4 no logradouro e número exato; sem número, devolve os 5 mais similares | banco + MCP |
| 11.6 | Vagas com cadastro próprio | `predios.vagas_cadastro_proprio = true` se o prédio tem ≥ 1 unidade `vaga` | ingestão |
| 11.7 | Plantas | Dentro do prédio, ordenar as unidades `apartamento` pela área construída; abrir um grupo novo quando a área se afasta mais de 3% da mediana do grupo corrente. `andar_inferido` = dígitos do complemento sem os 2 últimos ("APTO 72" → 7; "AP 24" → 2; "APTO 1201" → 12); nulo se o complemento não tem número | ingestão |
| 11.8 | Casamento anúncio → prédio → planta | Prédio: logradouro normalizado com similaridade ≥ 0,6 e número exato, ou nome do condomínio igual ao de outra página já casada no mesmo endereço → `casado_predio`. Planta: estimar a área IPTU esperada = área do anúncio ÷ fator (do prédio se houver, senão o de referência do grupo); a planta cuja `area_iptu_referencia` está a até 12% dessa estimativa é escolhida. Se só uma planta se qualifica → `casado_planta`; mais de uma → `ambiguo`; nenhuma → `casado_predio`. Prédio com uma planta só: casa direto. Página de condomínio com faixa (min–max) casa a menor área com a menor planta e a maior com a maior, se o número de plantas for 2; senão `casado_predio` | ingestão |
| 11.9 | Selo da área privativa | `confirmada`: revisão manual com observação, **ou** edital de leilão com `status_casamento = casado_unidade` e área privativa extraída (a área da planta passa a ser a do edital; com 2+ editais na mesma planta, a mediana, desde que concordem a 3%; se não concordarem, revisão `edital_divergente`). `calibrada`: ≥ 2 evidências (anúncios ou páginas) casadas com a planta, de URLs distintas, cujas áreas ficam a até 3% da mediana delas. `indicativa`: 1 evidência, ou ≥ 2 que não concordam a 3% mas concordam a 8% (a área é a mediana). `estimada`: sem evidência; área = área IPTU × fator de referência. `sem_dado`: sem evidência e sem fator de referência com ≥ 8 plantas | ingestão |
| 11.10 | Fator de referência | Calculado sobre plantas `calibrada`/`confirmada`, não especiais. Grupos, do mais específico ao mais geral: (bairro, década, vagas_cadastro_proprio) → (década, vagas_cadastro_proprio) → (vagas_cadastro_proprio). Usa o grupo mais específico com ≥ 8 plantas. `faixa_erro_pct` = (p75 − p25) / mediana × 100 / 2 | ingestão |
| 11.11 | Precedência humana | O pipeline nunca altera planta com selo `confirmada` e fonte `revisao_manual`, edital com `casado_manual = true`, anúncio com `casado_manual = true` ou venda com `marcado_manual = true` | ingestão |
| 11.12 | Coerência no prédio e plantas especiais | Em prédio com ≥ 2 plantas com selo ≥ indicativa, cada fator deve ficar a até 10% do `fator_predio`; fora disso → `revisao_pendente` com `fator_incoerente`. A planta de maior área com `qtd_unidades ≤ 2` e área ≥ 1,4 × a da planta seguinte é marcada `especial` (provável cobertura) e vai para a revisão com `planta_especial` | ingestão |
| 11.13 | Prioridade de coleta | `prioridade_coleta` = vendas de compra e venda dos últimos 24 meses × peso do pior selo das plantas (`sem_dado` 4, `estimada` 3, `indicativa` 2, `calibrada`/`confirmada` 0). Coletar os 150 de maior prioridade com `ultima_coleta_em` nula ou mais antiga que 90 dias. Prioridade 0 não é coletado | ingestão |
| 11.14 | Unidade sem cadastro próprio | Guia com fração ideal ≥ 1 (ou nula) e complemento que indica unidade (regex `\b(AP|APTO|APART|UNID|TORRE|T\s?\d|BL|CJ|SALA)\b`) → `unidade_sem_cadastro_proprio = true`. Não entra em vendas consolidadas nem em medianas | ingestão |
| 11.15 | Consolidação de vagas | Para cada guia de compra e venda de unidade `apartamento`: agregar as guias de compra e venda de unidades `vaga` do mesmo prédio, com a mesma `data_transacao`, ainda não agregadas, até no máximo 3. Se houver mais vagas que apartamentos vendidos no mesmo prédio e data, distribuir pela proximidade da matrícula (menor diferença numérica). Vagas sem apartamento ficam fora | ingestão |
| 11.16 | Venda fora da curva | Com ≥ 3 vendas do prédio nos 36 meses: fora se `m2_privativo` < 0,6 × ou > 1,6 × a mediana do prédio. Com menos: usar a mediana do bairro no mesmo selo. Vendas com `valor_declarado` < 0,5 × o valor venal de referência também são marcadas. Ficam fora das medianas devolvidas pelo MCP, mas aparecem na lista de vendas com a marca | ingestão |
| 11.18 | Limite de contas novas | No máximo 50 contas de cliente criadas nas últimas 24 h. Acima disso, o login mostra a mensagem da seção 15. Quem já tem conta entra sempre; conta bloqueada não entra | OAuth (8.10) |
| 11.19 | Limite de uso do MCP | Por token OAuth: até 30 chamadas no minuto corrente e 1.000 nas últimas 24 h. A chamada recusada não conta e recebe 429 com o tempo de espera. Chaves do painel não têm limite | MCP (8.10) |
| 11.17 | Medianas do MCP | m² mediano de prédio ou bairro = mediana de `m2_privativo` das vendas de compra e venda não fora da curva, com selo ≥ `estimada`, na janela pedida (padrão 24 meses). Sempre devolver junto: n de vendas, distribuição por selo e se há vagas inclusas na área | MCP |
| 11.19 | Alvos da coleta de leilões | (a) Prédios com guia do ITBI de natureza "4.Arrematação" ou "17.Resolução da alienação fiduciária" nos últimos 36 meses; (b) os 100 prédios de maior `prioridade_coleta` (regra 11.13) sem nenhuma planta `confirmada`. Cada prédio é buscado no máximo uma vez a cada 180 dias (`ultima_coleta_leilao_em`) | ingestão |
| 11.20 | Casamento edital → prédio → unidade | Prédio: mesmo critério de endereço da regra 11.8. Unidade, por ordem de força: (1) `matricula` igual à de uma guia do ITBI de uma unidade do prédio → `casado_unidade`; (2) complemento normalizado igual ao de uma unidade do prédio ("APTO 52" = "AP 52" = "APARTAMENTO 52") → `casado_unidade`; (3) senão → `casado_predio`, sem efeito na área (vai para a lista de evidências sem vínculo). Edital de prédio fora dos 10 bairros é descartado | ingestão |
| 11.18 | O que não é automático | A **descontar o valor das vagas inclusas** no preço não é feito no MVP: o m² é devolvido com a informação `vagas_inclusas_area` e o agente decide. Também não há correção monetária dos preços antigos | — |

**Tabela 11.2: bairros, CEPs e grafias aceitas**

| Bairro | Prefixos de CEP | Padrões aceitos no campo bairro |
|---|---|---|
| Perdizes | 050, 0125 | `^PERDIZES$` |
| Pompeia | 050 | `^(VILA \|VL\.? \|V\. )?POMPEIA$` |
| Pinheiros | 054 | `^PINHEIROS$` |
| Vila Madalena | 054 | `^(VILA\|VL\.?) MADALENA$` |
| Alto de Pinheiros | 054 | `^ALTO (DE \|DOS )?PINHEIROS$` |
| Alto da Lapa | 050, 054 | `^ALTO DA LAPA$` |
| Higienópolis | 012, 013 | `^HIGIENOPOLIS$` |
| Jardins | 014 | `^(JARDIM\|JD\.?) (PAULISTA\|AMERICA\|EUROPA\|PAULISTANO)$` |
| Cerqueira César | 013, 014, 0540 | `^CERQUEIRA CE[SZ]AR$` |
| Itaim Bibi | 045 | `^(ITAIM ?BIBI\|ITAIM\|VL\.? ITAIM\|VILA ITAIM)$` |

---

## 12. Máquinas de estado e tratamento de erro

**`execucoes_ingestao.status`**

| De | Para | Quando |
|---|---|---|
| (nova) | `em_andamento` | início da rotina |
| `em_andamento` | `concluida` | fim sem erro (inclusive "sem mudança") |
| `em_andamento` | `falhou` | erro não recuperado; `mensagem_erro` preenchida; as gravações daquela execução ficam (inserts idempotentes), mas a substituição (11.1) **não** roda |
| `concluida` | `substituida` | outra execução do mesmo ano/fonte concluiu depois |
| `falhou` / `substituida` | qualquer | proibido |

Execução `em_andamento` há mais de 6 horas é marcada `falhou` ("tempo esgotado") pela rotina seguinte.

**`anuncios.status_casamento`**: `sem_predio` → `casado_predio` → `casado_planta` | `ambiguo`; qualquer → `descartado` (só manual). O pipeline pode reclassificar enquanto `casado_manual = false`.

**Erros de coleta (Firecrawl):** 429 ou 5xx → até 3 tentativas com espera de 10, 30 e 90 s; depois, pular o prédio sem atualizar `ultima_coleta_em`. Página sem nenhum campo de área → não grava.

---

## 13. Contratos de API e tipos

### 13.1 Rotas de servidor do painel

| Rota | Método | Valida | Faz |
|---|---|---|---|
| `/api/execucoes/disparar` | POST `{rotina}` | sessão de admin; rotina na lista da 4.4 | chama `workflow_dispatch` do GitHub com `GITHUB_TOKEN_DISPATCH` (servidor) |
| `/api/chaves` | POST `{nome}` | sessão de admin; nome com 3–60 caracteres | gera 32 bytes aleatórios em base64url, grava o hash e o prefixo e devolve a chave uma vez |
| `/api/chaves/[id]/revogar` | POST | sessão de admin | `ativa = false` |

### 13.2 Ferramentas do MCP (`/api/mcp`, somente leitura)

| Ferramenta | Entrada (zod) | Saída |
|---|---|---|
| `buscar_predio` | `{ endereco: string (3–200) }` | até 5 `{ predio_id, endereco, bairro, ano_construcao, total_unidades, similaridade }`; vazio + mensagem "fora da cobertura" se nada casar |
| `ficha_predio` | `{ predio_id: uuid }` | prédio + plantas `{ area_iptu, area_privativa, fator, selo, fonte_area, faixa_erro_pct, vagas_inclusas, quartos, qtd_unidades, especial }` + `vagas_cadastro_proprio` |
| `vendas_predio` | `{ predio_id: uuid, meses?: int 1–120 = 36 }` | lista `{ data, unidade, valor_total, valor_apartamento, valor_vagas, area_privativa, selo_area, m2_privativo, m2_iptu, vagas_inclusas_area, fora_da_curva }` + mediana (regra 11.17) |
| `m2_bairro` | `{ bairro: enum dos 10 slugs, meses?: int 1–60 = 24, quartos?: int }` | `{ mediana_m2_privativo, p25, p75, n_vendas, distribuicao_selos, pct_cobertura }` |
| `comparaveis` | `{ predio_id: uuid, area_privativa?: number, meses?: int = 24, limite?: int 1–30 = 10 }` | vendas do mesmo bairro com área privativa ±20% da informada (ou da planta mais comum do prédio), década de construção ±1, ordenadas por mesma rua, depois mais recentes; mesmos campos de `vendas_predio` |

Todas as respostas incluem `fonte: "ITBI Prefeitura de SP + IPTU GeoSampa + calibração Fechou por Quanto"` e `atualizado_em` (última calibração concluída).

### 13.3 Schema de extração do Firecrawl

```json
{
  "type": "object",
  "properties": {
    "tipo_pagina": { "type": "string", "enum": ["anuncio", "pagina_condominio", "outro"] },
    "logradouro": { "type": "string" },
    "numero": { "type": "integer" },
    "nome_condominio": { "type": "string" },
    "finalidade": { "type": "string", "enum": ["venda", "aluguel"] },
    "area_privativa_m2": { "type": "number", "description": "área útil ou privativa; nunca área total" },
    "area_privativa_min_m2": { "type": "number" },
    "area_privativa_max_m2": { "type": "number" },
    "quartos": { "type": "integer" },
    "vagas": { "type": "integer" },
    "andar": { "type": "integer" },
    "preco": { "type": "number" }
  }
}
```

Na coleta de leilões, `tipo_pagina` aceita também o valor `edital_leilao`, e o schema ganha `complemento`, `matricula`, `area_total_m2`, `valor_avaliacao`, `data_leilao` e `links_documentos` (lista de URLs de PDF).

Páginas com `tipo_pagina = "outro"` são descartadas. Se o texto traz "área total" e "área privativa/útil", só a privativa/útil é aceita. Isso vai no prompt da extração e é verificado por teste com uma página de exemplo salva.

---

### 13.4 Schema de extração de PDF (Claude API)

O prompt instrui a extrair **apenas** os campos abaixo e a não transcrever nomes, documentos de pessoas ou qualquer outro trecho. A resposta passa por um filtro que descarta chaves fora da lista antes do insert.

```json
{
  "type": "object",
  "properties": {
    "origem_documento": { "type": "string", "enum": ["edital", "laudo", "matricula", "outro"] },
    "logradouro": { "type": "string" },
    "numero": { "type": "integer" },
    "complemento": { "type": "string" },
    "matricula": { "type": "string" },
    "cartorio": { "type": "string" },
    "area_privativa_m2": { "type": "number" },
    "area_comum_m2": { "type": "number" },
    "area_total_m2": { "type": "number" },
    "fracao_ideal": { "type": "number" },
    "vagas": { "type": "integer" },
    "vagas_vinculadas_area": { "type": "boolean" },
    "valor_avaliacao": { "type": "number" },
    "data_leilao": { "type": "string", "format": "date" }
  },
  "required": ["origem_documento"]
}
```

Documento com `origem_documento = "outro"` ou sem nenhuma área é descartado.

---

## 15. Copy e tom de voz

Português claro, sem jargão. Mensagens fixas:

| Situação | Texto |
|---|---|
| MCP sem chave/chave inválida | "Chave de API inválida ou revogada." |
| MCP fora da cobertura | "Este endereço não está na base do Fechou por Quanto, que hoje cobre Perdizes, Pinheiros, Pompeia, Vila Madalena, Alto de Pinheiros, Alto da Lapa, Higienópolis, Jardins, Cerqueira César e Itaim Bibi." |
| MCP prédio sem vendas no período | "Nenhuma venda registrada neste prédio no período. Use a ferramenta comparaveis para ver vendas parecidas no bairro." |
| Painel sem perfil | "Acesso não autorizado. Fale com o administrador do Fechou por Quanto." |
| Lista vazia de revisão | "Nada para revisar agora." |
| Chave criada | "Copie a chave agora. Ela não será mostrada de novo." |
| MCP no limite de uso (11.19) | "Limite de uso atingido. Tente de novo em N segundos." (ou "N minutos" a partir de 2 min) |
| Login: falha no Google | "Não foi possível entrar com o Google. Tente de novo." |
| Login: cadastros pausados (11.18) | "Os cadastros novos estão pausados por hoje. Tente de novo amanhã." |
| Login: conta bloqueada | "Esta conta está bloqueada. Fale com o administrador do Fechou por Quanto." |
| Consentimento | "<cliente> quer acessar o Fechou por Quanto"; "Poderá: buscar prédios e consultar vendas, fichas, comparáveis e o m² dos bairros cobertos."; "Não poderá: alterar dados nem ver qualquer informação pessoal." |
| Pedido OAuth inválido | "Pedido de conexão inválido. Volte ao seu assistente e comece a conexão de novo." |

Rótulos dos selos no painel e no MCP: Confirmada, Calibrada, Indicativa, Estimada, Sem dado.

---

## 16. Direção visual

- **Navegação: menu lateral estilo App Store Connect.** Grupos com título em negrito escuro e caixa normal (nunca MAIÚSCULAS): **Base** (Visão geral, Prédios), **Qualidade** (Fila de revisão, Evidências sem vínculo), **Operação** (Execuções, Chaves de API). Itens indentados sob o grupo, sem marcador. Traço fino (hairline) entre os grupos. Um item ativo por vez, com o texto na cor primária e uma pílula clara da mesma cor ao fundo. No rodapé, o e-mail do usuário, "Sair" e um selo discreto de ambiente (dev/prod).
- **Cor primária:** azul (`#0071E3`). **Cores semânticas, só para selos:** Confirmada verde escuro (com a fonte indicada: "revisão" ou "edital"), Calibrada verde, Indicativa âmbar, Estimada cinza-azulado, Sem dado cinza claro. Nenhuma outra coisa usa essas cores.
- Fundo branco, texto quase preto (`#1D1D1F`), hairlines em vez de bordas pesadas, cantos arredondados suaves, espaçamento generoso. Tipografia: Inter.
- Tabelas densas para listas (Prédios, Vendas), cards só na Visão geral.
- Valores em reais e m² com separador brasileiro (R$ 1.630.000; 94 m²; R$ 17.340/m²).
- Sem marca da empresa nem logotipo próprio no MVP (produto interno).
- **Livre para o agente:** ícones, gráficos da visão geral (barra empilhada simples por selo), modo escuro (opcional).

---

## 17. Requisitos não-funcionais

| Item | Alvo |
|---|---|
| Ingestão de um ano do ITBI | ≤ 15 min no GitHub Actions (runner padrão) |
| Ingestão do IPTU | ≤ 45 min |
| Calibração completa | ≤ 10 min |
| Resposta do MCP | p95 ≤ 1,5 s por ferramenta |
| Painel: abrir ficha do prédio | ≤ 2 s |
| Volume esperado | ~6 mil prédios, ~150 mil unidades, ~80 mil guias (2021–2026), ~10 mil anúncios/ano, algumas centenas de editais/ano |
| Armazenamento | caber no plano Supabase Pro (8 GB); os brutos ficam no Storage com retenção de 2 versões por fonte/ano |
| Custo Firecrawl | teto por execução em `FIRECRAWL_MAX_CREDITOS_EXECUCAO` (padrão 600) |
| Custo Claude API (leilões) | teto de documentos por execução em `CLAUDE_MAX_DOCUMENTOS_EXECUCAO` (padrão 150) |
| Navegadores | Chrome, Safari e Edge, versões atuais; desktop (≥ 1280 px); celular só leitura |
| Idioma | pt-BR |
| Acessibilidade | contraste AA; foco visível; selos com texto, não só cor |

---

## 18. Convenções de código, documentação e estrutura do repositório

### 18.1 Guardrails executáveis

| Regra | Origem | Mecanismo |
|---|---|---|
| Credencial de serviço do Supabase, token do GitHub e chave do Firecrawl nunca em código de cliente do painel | 6.3, 20 | Hook `guard-secrets.sh` |
| Migration versionada não se edita | 7.5 | Hook `guard-migrations.sh` |
| Em correção de bug, teste não se edita | 22.1 | Hook `guard-tests.sh` (modo `.claude/fix-mode`) |
| Advisors do Supabase após cada migration | 20 | Hook `remind-advisors.sh` |
| A coleta só grava os campos permitidos de anúncio e de edital, e nenhum PDF é gravado | 0.4, 20 | Hook `guard-coleta.sh` (em `packages/ingestao/src/anuncios/` e `leiloes/`: bloqueia campos de foto, contato, corretor, descrição, nome, CPF/CNPJ e devedor, e escrita de arquivo) |
| Critérios de aceite, matriz de permissões, regras 11.x | 5, 8, 11 | `REVIEW.md` + subagente `verifier` |
| Convenções de idioma e comentários | 18.2 | `CLAUDE.md` |

### 18.2 Convenções
- **Idioma:** banco em português `snake_case`; código, variáveis e arquivos em inglês. Os tipos gerados do banco (`packages/db/src/types.ts`, via `supabase gen types`) mantêm os nomes em português.
- **Comentários obrigatórios:** toda função, rotina, rota, trigger e política com cabeçalho em português (o que faz, o que recebe, o que devolve, regra do spec com número). Lógica não óbvia com comentário inline citando a regra (`// regra 11.15: distribui vagas pela matrícula mais próxima`).
- **Números do spec no código:** limites (3%, 12%, 60%, 8 plantas, 150 prédios, 90 dias…) ficam em `packages/ingestao/src/config/regras.ts`, um por constante, com o número da regra no comentário. Nenhum número mágico espalhado.

### 18.3 Estrutura
```
m2-real/
  apps/web/                    Next.js (painel + /api/mcp)
    src/app/(painel)/...       telas da seção 10
    src/app/api/mcp/route.ts   servidor MCP
    src/app/api/...            rotas da 13.1
    src/server/                acesso ao banco com service role (só servidor)
    src/features/<tela>/       componentes + hooks + tipos por tela
  packages/ingestao/src/
    itbi/  iptu/  anuncios/  leiloes/  calibracao/  bairros/  config/  shared/
    cli.ts                     ponto de entrada: tsx src/cli.ts <rotina>
  packages/db/                 tipos gerados e cliente
  supabase/migrations/  supabase/seed/
  .github/workflows/           ingestao-itbi.yml, ingestao-iptu.yml, coleta-anuncios.yml, coleta-leiloes.yml, ci.yml
  plans/                       planos aprovados por épico
  CLAUDE.md  README.md  REVIEW.md  DOCUMENTACAO-TECNICA.md  schema.sql
```

### 18.4 Variáveis de ambiente

| Variável | Onde | Pública? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web | sim |
| `SUPABASE_SERVICE_ROLE_KEY` | web (servidor), Actions | **secreta** |
| `GITHUB_TOKEN_DISPATCH`, `GITHUB_REPO` | web (servidor) | **secreta** / não |
| `FIRECRAWL_API_KEY` | Actions | **secreta** |
| `FIRECRAWL_MAX_CREDITOS_EXECUCAO` | Actions | não |
| `ANTHROPIC_API_KEY` | Actions | **secreta** |
| `CLAUDE_MAX_DOCUMENTOS_EXECUCAO`, `LEILAO_MAX_ALVOS_EXECUCAO` | Actions | não |
| `LEILAO_DOMINIOS` | Actions | não (allowlist, assunção A10) |
| `ITBI_PAGINA_URL` | Actions | não (padrão: página da Fazenda) |
| `IPTU_ARQUIVO_URL` | Actions | não (opcional; vazio = ler do Storage) |
| reservadas: `ONR_API_KEY` (28.2) | — | secreta |

### 18.5 Documentação viva
- `schema.sql` na raiz, gerado do banco (`supabase db dump --schema-only`) a cada migration.
- `README.md`: setup local, variáveis, como rodar migrations e cada rotina (`npm run ingestao -- itbi 2025`).
- `CLAUDE.md` (cabe numa página): convenções, mapa da arquitetura, comandos com exemplo de saída saudável, pegadinhas. Quando o agente errar a mesma coisa duas vezes, a correção entra em "Pegadinhas". Pegadinhas iniciais:
  - vaga é vendida em guia separada (11.15);
  - a área da guia é a do IPTU, não a privativa;
  - as abas do ITBI têm 28 ou 29 colunas: ler pelo nome do cabeçalho;
  - 40% das guias vêm sem bairro (11.2).
- `DOCUMENTACAO-TECNICA.md` (seção 19), atualizada no mesmo commit de qualquer mudança de schema, regra ou tela.

---

## 19. Documento de documentação técnica

Ao fim da implementação, o agente gera `DOCUMENTACAO-TECNICA.md` em português, descrevendo o sistema **como ficou**, nesta ordem:
1. Modelo de dados explicado: cada tabela, o que cada coluna significa no negócio e os valores dos enums.
2. Relacionamentos, com cardinalidade em linguagem de negócio ("um prédio tem várias plantas; cada apartamento pertence a uma planta").
3. Regras no banco: nome exato de cada trigger, função e política, tabela, quando dispara e o que faz.
4. Mapa tela → tabelas (lidas, escritas, funções usadas), e ferramenta MCP → tabelas.
5. Lógica das funcionalidades por tela e de cada rotina de ingestão: o que valida, grava e calcula, onde, e o que aparece em caso de erro.
6. Divergências em relação ao spec, com o porquê.

Regra: toda mudança de schema, regra ou tela atualiza este documento no mesmo commit.

---

## 20. Privacidade, segurança e conformidade

- **Dados pessoais:** o ITBI publicado não traz nomes. A base do IPTU pode trazer nome do contribuinte, que **não é lido nem gravado** (a coluna é ignorada no parser, com teste). Dos anúncios não se guardam corretor, telefone, e-mail, fotos nem descrição. Com isso, o sistema não trata dado pessoal identificável; a matrícula e o SQL são dados do imóvel.
- **Editais de leilão:** editais, laudos e matrículas trazem nomes, CPF e situação de dívida de pessoas. O PDF é lido só em memória, enviado à Claude API para extrair os campos da 13.4 e descartado. Nada além desses campos é gravado; o link fica como referência. A extração pede explicitamente para não transcrever dados de pessoas, e um filtro de chaves garante isso antes do insert (hook `guard-coleta.sh` e teste do 8.5.1). Conferir os termos de uso de dados da API comercial da Anthropic antes de ir para produção.
- **Uso de páginas de terceiros:** coleta pontual por endereço, nos três domínios da allowlist, com limite por execução, respeitando o `robots.txt` (o Firecrawl respeita por padrão; não desligar), sem burlar bloqueio nem login. Guarda-se o link da origem. Se algum domínio pedir para parar, ele sai da allowlist (variável de configuração).
- **Licença dos dados públicos:** os dados do IPTU no GeoSampa são publicados em formato aberto sob licença livre (Decreto 56.701/2015). O ITBI é publicado pela Secretaria da Fazenda. Citar as duas fontes em toda resposta do MCP (13.2).
- **Segredos:** credencial de serviço, token do GitHub, chave do Firecrawl e chave da Claude API só no servidor (Vercel, rotas) e nos segredos do Actions. Hook `guard-secrets.sh`.
- **RLS** em todas as tabelas (6.4); o MCP lê pelo servidor depois de validar a chave.
- **Supabase:** rodar `get_advisors` (security e performance) depois de cada DDL; nenhum alerta crítico pendente.
- **Retenção:** brutos no Storage, 2 versões por fonte/ano; anúncios com mais de 3 anos são apagados pelo pipeline (a calibração que eles geraram fica em `calibracoes`).

---

## 21. Métricas de sucesso

| Métrica | Alvo | Prazo |
|---|---|---|
| Cobertura (vendas dos últimos 24 meses com área `calibrada` ou `confirmada`) em Pinheiros, Itaim Bibi e Jardins | ≥ 70% | 3 meses após o épico 8.6 |
| Cobertura nos 10 bairros, somados | ≥ 55% | 3 meses após o épico 8.6 |
| Erro da área calibrada por anúncios contra o gabarito dos editais de leilão (plantas que têm os dois) | mediana ≤ 3% | a cada calibração |
| Plantas com selo `confirmada` vindo de edital | ≥ 150 nos 10 bairros | 6 meses após o épico 8.5.1 |
| Respostas do MCP que devolvem m² com selo `estimada` ou melhor | ≥ 90% das consultas sobre prédios dos 10 bairros | 3 meses após o épico 8.9 |

Sem telemetria de terceiros no MVP; o próprio `execucoes_ingestao`, o `cobertura_bairros` e o campo `ultimo_uso_em` das chaves bastam.

---

## 22. Estratégia de teste

**Automatizados (Vitest):**
- Regras 11.2, 11.3, 11.5, 11.7, 11.8, 11.9, 11.10, 11.12, 11.14, 11.15, 11.16 com fixtures pequenas.
- **T1, fixture real:** guias de 2025 da Joaquim Antunes, 577 e da Caiubi, 324:

| Prédio | Data | Unidade | Apartamento (R$) | Vaga (R$) | Total esperado (R$) |
|---|---|---|---|---|---|
| Joaquim Antunes, 577 | 15/07/2025 | Apto 72 | 1.256.081,09 | 43.918,91 | 1.300.000,00 |
| Joaquim Antunes, 577 | 30/07/2025 | Apto 14 | 1.130.000,00 | 100.000,00 | 1.230.000,00 |
| Joaquim Antunes, 577 | 14/11/2025 | Apto 11 | 1.390.000,00 | 240.000,00 | 1.630.000,00 |
| Caiubi, 324 | 29/08/2025 | AP 24 | 762.600,00 | — | 762.600,00 |

- **T2, calibração:** planta de 132 m² com 2 anúncios de 94 m² e 95 m² → `calibrada`, área 94,5, fator 0,716. Com um terceiro anúncio de 107 m² (fora de 3%) → continua `calibrada` pela mediana, desde que ≥ 2 concordem.
- RLS: testes SQL com `set role` para `anon`, `authenticated` sem perfil e admin.
- Parser do IPTU: a coluna de nome do contribuinte nunca chega ao insert.
- Coleta: o filtro de domínios e o filtro de campos permitidos.
- Leilões: extração do laudo da Rua Canário, 906 (fixture), filtro de dados pessoais, não persistência do PDF e casamento por matrícula (regra 11.20).

**Manuais:** fluxo do painel (login, revisão, chave), teste do MCP pelo cliente de exemplo e por um Claude conectado.

### 22.1 Loop de verificação
- Comandos únicos (raiz): `npm run typecheck`, `npm test`, `npm run build`. Banco: `npm run db:test` (testes de RLS e funções).
- Nenhum épico é declarado pronto sem colar a saída dos quatro comandos e o relatório do `verifier`.
- Critério por épico: os critérios da seção 8 do épico, cada um com evidência.
- Bug se corrige com teste primeiro: escrever o teste que reproduz o bug, ver falhar, commitar, `touch .claude/fix-mode`, corrigir o código, `rm .claude/fix-mode`.
- UI: com ferramenta de navegador disponível, capturar cada tela e comparar com o design aprovado no Claude Design.
- **Regra de ouro (no `CLAUDE.md`):** se um teste falhar, corrija o código, não o teste; nunca pule nem apague teste que falha.

---

## 23. Riscos e mitigação

| Risco | Impacto | Prob. | Mitigação |
|---|---|---|---|
| PV2: download do IPTU exige interação no GeoSampa | Alto (épico 8.2 parado) | Média | Caminho alternativo de upload manual para `brutos/iptu/<ano>.csv` no Storage; a rotina lê de lá |
| PV1: site da prefeitura bloqueia o IP do GitHub Actions | Alto | Baixa | Retentativas; fallback igual ao do IPTU (upload manual da planilha) |
| Mudança de layout da planilha do ITBI (colunas renomeadas) | Médio | Média | Leitura pelo nome do cabeçalho com mapa de sinônimos; execução falha com mensagem clara se faltar coluna obrigatória |
| Portais bloqueiam ou mudam termos | Alto (calibração para) | Média | Allowlist configurável; limite por execução; sem burlar bloqueio; o fator de referência mantém os prédios estimados |
| Anúncio com área errada (área total no lugar da útil) | Médio | Alta | Regra 11.9 exige concordância de ≥ 2; regra 11.12 de coerência; fila de revisão |
| Prédios antigos com poucos anúncios → cobertura baixa em Perdizes | Médio | Alta | Prioridade de coleta (11.13) por volume de vendas; páginas de condomínio; meta de cobertura por bairro (21) |
| Agrupamento por condomínio do IPTU junta dois prédios do mesmo condomínio com plantas iguais | Baixo | Média | Plantas agrupam por área; se necessário, separar por número do imóvel (pergunta P3) |
| Vagas inclusas distorcem o m² entre prédios | Médio | Alta | `vagas_inclusas_area` devolvido em toda resposta (11.18); desconto de vagas no roadmap |
| Custo do Firecrawl sobe | Baixo | Média | Teto por execução; recoleta só a cada 90 dias |
| Dado pessoal de edital vaza para o banco | Alto (LGPD) | Média | PDF só em memória; schema fechado; filtro de chaves; hook `guard-coleta.sh`; teste com documento real |
| Poucos editais nos prédios antigos priorizados | Médio | Alta | Os editais complementam os anúncios, não os substituem; incluir as guias de arrematação e de consolidação fiduciária como alvos (11.19); medir pela métrica da seção 21 |
| PDF escaneado ilegível ou matrícula com muitas averbações confunde a extração | Médio | Média | Exigir área privativa explícita; edital divergente vai para revisão (11.9); a área de edital só vale casada à unidade |
| Sites de leilão exigem login ou bloqueiam (PV4) | Médio | Média | Allowlist configurável; site com login fica fora |

---

## 24. Assunções declaradas

**Assunção não revisada vira verdade no minuto em que o agente começa a programar.**

| # | Assunção | Por quê | Se discordar |
|---|---|---|---|
| A1 | Nome definitivo "Fechou por Quanto" (domínio principal `fechouporquanto.com.br`). O repositório, as pastas, os pacotes e o banco continuam com `m2-real` / `m2_` | Nome escolhido na v1.2; os identificadores técnicos não mudam para não mexer em banco, deploys e variáveis | Trocar os identificadores técnicos exige migration nova e renomear os projetos Supabase e Vercel |
| A2 | Histórico do ITBI a partir de 2021 | 5 anos dão vendas suficientes por prédio sem pesar no banco | Dá para voltar a 2006; aumenta volume e tempo |
| A3 | Só apartamentos residenciais entram nas análises | Foco da tese | As outras guias já ficam gravadas |
| A4 | Coleta em 3 domínios: Lopes, QuintoAndar e Loft | Foram os que apareceram com páginas de condomínio e área útil nos testes | Acrescente domínios na allowlist |
| A5 | Firecrawl para busca e extração | Já usado pelo usuário | Trocar exige reescrever `anuncios/` |
| A6 | Limiares: 3% (planta e concordância), 8% (indicativa), 12% (casamento), 10% (coerência), 8 plantas (grupo de fator), 0,6–1,6 (fora da curva) | Tirados da análise dos dois prédios e de bom senso; ajustáveis em `config/regras.ts` | Ajustar depois de ver a fila de revisão real |
| A7 | Prédio = mesmo setor + quadra + número de condomínio, com ≥ 4 apartamentos | É como o IPTU agrupa condomínios; ≥ 4 tira casas geminadas | Ver P3 |
| A8 | Admin no painel; clientes MCP entram com Google pelo OAuth (revista em 23/11/2026, épico 8.10) | A chave manual impedia qualquer pessoa de instalar o MCP sozinha | Planos pagos continuam no 28.5 |
| A10 | Allowlist inicial de leilões: `venda-imoveis.caixa.gov.br`, `portalzuk.com.br`, `megaleiloes.com.br`, `sodresantoro.com.br`, `frazaoleiloes.com.br`, `biasileiloes.com.br`, `lancejudicial.com.br` | Leiloeiros conhecidos com atuação em São Paulo; não conferi se todos publicam PDFs sem login | Ajuste em `LEILAO_DOMINIOS` depois do primeiro teste |
| A11 | Edital casado à unidade vale como `confirmada` | É documento oficial (matrícula ou laudo); fica abaixo só da revisão manual | Se preferir um selo próprio ("oficial"), é um valor novo no enum `selo_area` |
| A9 | Supabase Pro | O plano gratuito (500 MB) fica apertado com unidades + guias + brutos | Dá para começar no gratuito sem os brutos no Storage |

---

## 25. Perguntas abertas

O agente de código deve **perguntar em vez de assumir** quando cruzar com estes itens.

| # | Pergunta | Quem decide | Até quando |
|---|---|---|---|
| P1 | Entra orçamento para dados do cartório (ONR) como auditoria por amostra ou para preço registrado? | Alexandre | Antes de planejar a v2 |
| P2 | O m² devolvido ao agente deve descontar um valor estimado das vagas inclusas? Se sim, de onde vem o valor da vaga (vendas de vagas separadas do mesmo bairro?) | Alexandre | Antes do épico 8.9 |
| P3 | Condomínios com mais de uma torre e números diferentes devem virar um prédio ou vários? | Alexandre | Durante o épico 8.2, depois de ver os casos reais |
| P4 | O selo `indicativa` (1 evidência) deve entrar no indicador de cobertura? | Alexandre | Antes do épico 8.7 |

---

## 26. Definition of Done

- [ ] Épicos 8.0 a 8.9, incluindo o 8.5.1, com todos os critérios cumpridos, saída dos comandos colada e `verifier` sem item "não cumprido".
- [ ] Banco em português `snake_case`, sem tabela ou coluna fora do padrão.
- [ ] Todas as rotinas, triggers, funções e políticas comentadas com a regra que implementam.
- [ ] Limiares das regras em `config/regras.ts`, sem números mágicos.
- [ ] Advisors do Supabase rodados após a última DDL, sem alerta crítico.
- [ ] Guardrails do Anexo B instalados e cada hook testado uma vez.
- [ ] Os 5 workflows rodando no GitHub Actions, com uma execução concluída de cada.
- [ ] Indicador de cobertura calculado para os 10 bairros.
- [ ] MCP conectado a um Claude e respondendo às 5 ferramentas.
- [ ] `plans/` com o plano aprovado de cada épico, consistente com o código.
- [ ] `DOCUMENTACAO-TECNICA.md` gerado e conferido; `CLAUDE.md` e `README.md` em dia; `schema.sql` atualizado.

---

## 27. Próximos passos operacionais

1. Revisar as seções 24 e 25.
2. Criar o projeto Supabase (Pro) e o repositório `m2-real` no GitHub.
3. Conferir à mão o download do IPTU no GeoSampa (PV2) e anotar a URL.
4. Gerar as telas no Claude Design com `prompt-design-m2-real.md` e salvar em `design/`.
5. Colar o prompt de implementação no Claude Code.
6. Depois do épico 8.3, olhar os números de 2025 contra os da análise (critério do 8.3).

---

## 28. Roadmap: próximas releases

**28.1 Editais de leilão: movido para o MVP na versão 1.1 (épico 8.5.1, regras 11.19 e 11.20).** Texto original preservado: Coletar editais de leilão judicial e bancário dos 10 bairros (os sites publicam a matrícula e às vezes um laudo com área privativa). Extrair área privativa, vagas e endereço por OCR/LLM, casar com a planta e dar selo `confirmada` com fonte própria (`edital_leilao`, novo valor do enum `fonte_dado`). O próprio ITBI aponta os casos: natureza "4.Arrematação". Exemplo encontrado: laudo de um apartamento na Rua Canário, 906, apto 52, com 184,32 m² privativos e 2 vagas.

**28.2 Cartório (ONR).** O Provimento CNJ 195/2025 (art. 343-J do Provimento 149/2023) criou a informação eletrônica de transações registradas, com data, preço, fração, tipo, matrícula e endereço, cobrada por transação (o menor valor entre uma pesquisa e 1/20 da certidão digital). Usos: auditoria mensal por amostra (medir o erro da base) e preço registrado para outras cidades. Depende de P1.

**28.3 Modelo do fator.** Substituir a mediana por grupo (11.10) por um modelo com ano, padrão, pavimentos, área do terreno, número de unidades e vagas, treinado nas plantas calibradas, com intervalo de erro por prédio.

**28.4 Expansão geográfica.** Novos bairros de São Paulo (basta incluir na tabela `bairros`) e, depois, Rio de Janeiro (ITBI do Rio via transparência), BH e Porto Alegre.

**28.5 Produto externo.** Planos por chave de API com preço fixo e página pública. (Perfis de cliente e limites de uso gratuitos foram antecipados no 8.10.)

**28.6 Preço pedido x preço fechado.** Usar os anúncios de venda coletados para medir, por prédio, a diferença entre o preço pedido e o fechado.

**28.7 Desconto de vagas.** Depende de P2.

---

## 29. Protocolo de mudanças incrementais

1. Commit de checkpoint antes de qualquer mudança.
2. Não colar o spec inteiro de novo: só o trecho novo ou um spec adicional da feature.
3. Escrever a instrução como diff: o projeto existe e funciona.
4. Dizer nominalmente o que **não** muda.
5. Pedir o plano em plan mode (arquivos, ordem, testes), aprovar e commitar em `plans/<feature>.md`. Bug: o plano começa pelo teste que reproduz a falha.
6. Revisar o `git diff` contra o plano; reverter o que passou do escopo.
7. Atualizar `DOCUMENTACAO-TECNICA.md` (e `CLAUDE.md`, se for o caso) no mesmo commit.

Modelo de prompt:
```
O Fechou por Quanto já está implementado e funcionando (ver spec.md e DOCUMENTACAO-TECNICA.md).
Quero esta mudança: <descrição ou trecho do spec adicional>.
Não altere: <telas/rotinas/tabelas que não mudam>.
Antes de codar, entre em plan mode, me mostre o plano (arquivos, ordem, testes) e,
depois de aprovado, salve em plans/<feature>.md. Rode typecheck, test, build e db:test,
cole as saídas, acione o verifier e atualize a DOCUMENTACAO-TECNICA.md no mesmo commit.
```

---

## Anexo: Fontes (consultadas em 20/11/2026)

- Prefeitura de São Paulo, Secretaria da Fazenda: Dados das Transações Imobiliárias com recolhimento de ITBI. https://prefeitura.sp.gov.br/fazenda/w/acesso_a_informacao/31501
- GeoSampa, metadados do IPTU (TPCL / IPTU-EG, atualização anual, dicionário de dados). https://metadados.geosampa.prefeitura.sp.gov.br/geonetwork/srv/api/records/b971efa1-aad5-42f3-ad28-18f1f4efe270
- Gestão Urbana SP: base do IPTU em formato aberto no GeoSampa. https://gestaourbana.prefeitura.sp.gov.br/noticias/prefeitura-disponibiliza-base-do-iptu-em-formato-aberto-no-geosampa/
- Decreto 56.701/2015 (disponibilização do cadastro fiscal). https://prefeitura.sp.gov.br/web/licenciamento/w/disponibiliza%C3%A7%C3%A3o-do-cadastro-fiscal
- Vercel `mcp-handler` 2.x. https://github.com/vercel/mcp-handler e https://vercel.com/changelog/latest-mcp-spec-now-supported-in-mcp-handler
- Provimento CNJ 149/2023, art. 343-J (incluído pelo Provimento CNJ 195/2025). https://www.legjur.com/legislacao/art/out_2026020900001492023-343-J
- Lopes, página do Condomínio Edifício Mondrian (R. Joaquim Antunes, 577). https://www.lopes.com.br/condominios/sp/sao-paulo/pinheiros/REC37887/condominio-edificio-mondrian-r-joaquim-antunes-577
- Bel Radar Pro (referência de mercado). https://bel.vc/belradar-pro
- Análise própria da planilha "GUIAS DE ITBI PAGAS (28012026)" (2025), 20/11/2026.

---

## Anexo B: Kit de guardrails do Claude Code

### `.claude/settings.json`
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/guard-secrets.sh" },
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/guard-migrations.sh" },
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/guard-tests.sh" },
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/guard-coleta.sh" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/remind-advisors.sh" }
        ]
      }
    ]
  }
}
```

### `.claude/hooks/guard-secrets.sh`
```bash
#!/bin/bash
# Bloqueia credencial privilegiada em código que roda no navegador (painel).
# Implementa as seções 6.3 e 20: service role, token do GitHub e chave do Firecrawl só no servidor.
command -v jq >/dev/null || { echo "Guardrail inativo: jq não está instalado. Instale o jq (brew install jq) antes de continuar." >&2; exit 2; }
input=$(cat)
path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
content=$(echo "$input" | jq -r '.tool_input.content // .tool_input.new_string // empty')

# Código de cliente do painel: telas e features. src/server/ e src/app/api/ são servidor e ficam liberados.
case "$path" in
  */apps/web/src/app/\(painel\)/*|*/apps/web/src/features/*|*/apps/web/src/components/*) ;;
  *) exit 0 ;;
esac

if echo "$content" | grep -qE 'SUPABASE_SERVICE_ROLE_KEY|service_role|GITHUB_TOKEN_DISPATCH|FIRECRAWL_API_KEY|ANTHROPIC_API_KEY'; then
  echo "Bloqueado: credencial privilegiada em código de cliente (seções 6.3 e 20). Mova a operação para apps/web/src/server/ ou para uma rota em src/app/api/ e chame-a do cliente." >&2
  exit 2
fi
# Arquivo de cliente marcado com 'use client' não pode importar o acesso de servidor.
if echo "$content" | grep -q "use client" && echo "$content" | grep -qE "from ['\"].*server/"; then
  echo "Bloqueado: componente 'use client' importando src/server/ (seção 20). Use uma rota de API ou server action." >&2
  exit 2
fi
exit 0
```

### `.claude/hooks/guard-migrations.sh`
```bash
#!/bin/bash
# Impede editar migration já versionada; mudança de schema vira migration nova (seção 7.5).
command -v jq >/dev/null || { echo "Guardrail inativo: jq não está instalado. Instale o jq (brew install jq) antes de continuar." >&2; exit 2; }
input=$(cat)
path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
case "$path" in
  */supabase/migrations/*) ;;
  *) exit 0 ;;
esac
rel="${path#"$CLAUDE_PROJECT_DIR"/}"
if git -C "$CLAUDE_PROJECT_DIR" ls-files --error-unmatch "$rel" >/dev/null 2>&1; then
  echo "Bloqueado: $rel já está versionada. Não se edita migration aplicada; crie uma nova migration com a alteração (seção 7.5)." >&2
  exit 2
fi
exit 0
```

### `.claude/hooks/guard-tests.sh`
```bash
#!/bin/bash
# Em correção de bug (arquivo .claude/fix-mode presente), impede editar testes (seção 22.1).
[ -f "$CLAUDE_PROJECT_DIR/.claude/fix-mode" ] || exit 0
command -v jq >/dev/null || { echo "Guardrail inativo: jq não está instalado. Instale o jq (brew install jq) antes de continuar." >&2; exit 2; }
input=$(cat)
path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
case "$path" in
  *.test.ts|*.test.tsx|*.spec.ts|*/__tests__/*|*/tests/*|*/supabase/tests/*|*/fixtures/*)
    echo "Bloqueado: modo de correção ativo (.claude/fix-mode). Corrija o código, não o teste (seção 22.1). Se o teste estiver errado de fato, pare e explique ao humano." >&2
    exit 2 ;;
esac
exit 0
```

### `.claude/hooks/guard-coleta.sh`
```bash
#!/bin/bash
# Garante a coleta mínima de anúncios e editais (princípio 4 e seção 20): nenhum campo pessoal ou de conteúdo, nenhum PDF gravado.
command -v jq >/dev/null || { echo "Guardrail inativo: jq não está instalado. Instale o jq (brew install jq) antes de continuar." >&2; exit 2; }
input=$(cat)
path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
content=$(echo "$input" | jq -r '.tool_input.content // .tool_input.new_string // empty')
case "$path" in
  */packages/ingestao/src/anuncios/*|*/packages/ingestao/src/leiloes/*) ;;
  *) exit 0 ;;
esac
# Ignora arquivos de teste, que podem citar os termos para provar que são filtrados.
case "$path" in *.test.ts) exit 0 ;; esac
if echo "$content" | grep -qiE '\b(foto|fotos|imagem|imagens|telefone|whatsapp|email|e-mail|corretor|creci|descricao|description|photos|phone|nome_proprietario|nome_devedor|cpf|cnpj|devedor|executado|proprietario|estado_civil)\b'; then
  echo "Bloqueado: a coleta só pode gravar os campos das tabelas anuncios e editais_leilao (seção 7.2, princípio 4 e seção 20). Remova campos de foto, contato, corretor, descrição ou dados de pessoas." >&2
  exit 2
fi
# PDF de leilão só em memória (seção 20).
if echo "$content" | grep -qE 'writeFile|createWriteStream|\.upload\('; then
  echo "Bloqueado: documentos de leilão não podem ser gravados em disco nem no Storage (seção 20). Processe o PDF em memória e descarte." >&2
  exit 2
fi
exit 0
```

### `.claude/hooks/remind-advisors.sh`
```bash
#!/bin/bash
# Depois de escrever uma migration, lembra de rodar os advisors do Supabase (seção 20).
command -v jq >/dev/null || { echo "Guardrail inativo: jq não está instalado. Instale o jq (brew install jq) antes de continuar." >&2; exit 2; }
input=$(cat)
path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
case "$path" in
  */supabase/migrations/*)
    echo "Migration escrita. Depois de aplicá-la, rode get_advisors (security e performance), resolva alertas críticos e regenere o schema.sql (seções 18.5 e 20)." >&2
    exit 2 ;;
esac
exit 0
```

### `.claude/agents/verifier.md`
```markdown
---
name: verifier
description: Confere em contexto limpo se o épico implementado cumpre os critérios de aceite do spec do Fechou por Quanto. Use ao terminar cada épico, antes de declarar pronto.
tools: Bash, Read, Grep
---
Você verifica; não corrige nada.

1. Leia no spec.md a seção 8.X do épico indicado, a matriz de permissões (seção 5), as políticas (6.4) e as regras da seção 11 que o épico toca.
2. Leia o plano em plans/ correspondente e o git diff do épico.
3. Rode npm run typecheck, npm test, npm run build e npm run db:test e guarde a saída.
4. Para cada critério de aceite, responda: cumprido / não cumprido / não verificável, sempre com evidência (saída de comando ou arquivo:linha).
5. Confira se os limiares usados no código vêm de packages/ingestao/src/config/regras.ts e batem com a seção 11.
6. Para telas e rotas tocadas, confira se só o admin acessa (seção 5) e se nenhuma credencial privilegiada chega ao cliente.
7. Liste divergências entre o diff e o plano.

Termine com uma linha: PRONTO ou NÃO PRONTO, e os itens que impedem.
```

### `REVIEW.md`
```markdown
# Instruções de revisão (Fechou por Quanto)

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
```
