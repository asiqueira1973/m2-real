# Documentação técnica — Fechou por Quanto

**Atualizado em:** 23/11/2026 · **Spec:** versão 1.3 · **Regra da seção 19:** toda mudança de schema, regra de negócio ou tela atualiza este documento **no mesmo commit**.

Este documento descreve o sistema **como ficou** ao fim dos épicos 8.0 a 8.10 (`main` depois do PR #3). Fontes: `schema.sql`, as 16 migrations de `supabase/migrations/`, `packages/ingestao/src/**`, `apps/web/src/**`, `.github/workflows/*.yml` e os planos em `plans/`.

Visão rápida das peças:

| Peça | Onde | O que faz |
|---|---|---|
| Banco | Supabase (Postgres) — local (Docker) e o projeto remoto **BANCO DE TESTE** | 19 tabelas `m2_*`, 10 enums, 29 funções, 13 triggers, 16 políticas RLS |
| Ingestão | `packages/ingestao/src/`, entrada em `cli.ts` | Rotinas `ingestao-iptu`, `ingestao-itbi`, `coleta-anuncios`, `coleta-leiloes`, `calibracao` e a `vigia` |
| Automação | `.github/workflows/` | Agenda as rotinas no GitHub Actions; CI |
| Painel | `apps/web/src/app/(auth)` e `(painel)` | Telas do admin (Next.js 16), leitura com a sessão do usuário (RLS) |
| MCP | `apps/web/src/app/api/mcp/route.ts` → `src/server/mcp/` | 5 ferramentas somente leitura para agentes, com token OAuth ou chave de API |
| OAuth do MCP | `apps/web/src/app/{.well-known,oauth,api/auth/google}` → `src/server/{oauth,auth}/` | Cadastro aberto com login Google, consentimento e token `fpq_mcp_…` (épico 8.10) |
| Páginas públicas | `apps/web/src/app/(publico)/{privacidade,termos}` | Textos legais exigidos pela tela de consentimento do Google |
| Brutos | Storage do Supabase (`m2_brutos`, local) ou Cloudflare R2 (`m2-brutos`, Actions/produção) | Arquivos de origem do IPTU e do ITBI, 2 versões por ano |

Nomenclatura: todo objeto do banco tem o prefixo `m2_` (divergência declarada, seção 6). Colunas e valores de enum seguem o spec. O nome visível do produto é **Fechou por Quanto**; identificadores técnicos continuam `m2-real` / `m2_`.

---

## 1. Modelo de dados

Convenções que valem para todas as tabelas, e por isso não se repetem abaixo:
- `criado_em timestamptz not null default now()` em todas.
- `atualizado_em timestamptz not null default now()` nas que mudam, mantido pelo trigger `m2_<tabela>_atualizado_em`. Não têm `atualizado_em`: as duas só de inserção (`m2_calibracoes` e `m2_cobertura_bairros`) e quatro tabelas do OAuth (`m2_oauth_clientes`, `m2_oauth_codigos`, `m2_tokens_mcp`, `m2_uso_mcp`), que só mudam por colunas de evento (`usado_em`, `revogado_em`, `ultimo_uso_em`, `chamadas`). O pgTAP `010_estrutura` confere `criado_em` em toda tabela `m2_` e o trigger em toda tabela com `atualizado_em`.
- `id uuid default gen_random_uuid()` como chave primária, exceto `m2_bairros` (smallint identity), `m2_perfis` (o id do usuário do Auth), `m2_oauth_codigos` (o hash do código) e `m2_uso_mcp` (chave composta `token_id` + `janela`).

### 1.1 Enums

| Enum | Valores | Significado |
|---|---|---|
| `m2_fonte_dado` | `itbi`, `iptu`, `anuncio`, `pagina_condominio`, `edital_leilao`, `revisao_manual`, `fator_referencia`, `calibracao` | De onde veio um dado (execução, área da planta, histórico). `calibracao` só é usado em `m2_execucoes_ingestao.fonte` (acréscimo do 8.4) |
| `m2_status_execucao` | `em_andamento`, `concluida`, `falhou`, `substituida` | Ciclo de vida de uma execução de rotina (seção 12) |
| `m2_tipo_unidade` | `apartamento`, `vaga`, `outro` | Classificação da unidade pelo uso do IPTU (regra 11.3) |
| `m2_selo_area` | `confirmada`, `calibrada`, `indicativa`, `estimada`, `sem_dado` | Confiança da área privativa (regra 11.9). Ordem do pior para o melhor usada no sistema: `sem_dado` < `estimada` < `indicativa` < `calibrada` < `confirmada`. Rótulos exibidos (seção 15): Confirmada, Calibrada, Indicativa, Estimada, Sem dado |
| `m2_status_casamento` | `casado_planta`, `casado_predio`, `ambiguo`, `sem_predio`, `descartado` | Vínculo de um anúncio (regra 11.8). `descartado` só por ação do admin |
| `m2_status_casamento_edital` | `casado_unidade`, `casado_predio`, `sem_predio`, `descartado` | Vínculo de um edital de leilão (regra 11.20). `descartado` só por ação do admin |
| `m2_finalidade_anuncio` | `venda`, `aluguel` | Finalidade do anúncio |
| `m2_origem_bairro` | `campo`, `cep`, `quadra`, `iptu` | Como o bairro da guia do ITBI foi definido (regra 11.2) |
| `m2_papel_usuario` | `admin` | Papel no painel (só existe um) |
| `m2_motivo_revisao` | `fator_incoerente`, `anuncios_divergentes`, `anuncio_ambiguo`, `planta_especial`, `venda_fora_da_curva`, `edital_divergente` | Por que um item está na fila de revisão. `anuncio_ambiguo` existe no enum mas a calibração não o grava (o anúncio ambíguo aparece em "Evidências sem vínculo"); `venda_fora_da_curva` não é gravado em planta, é o motivo que a fila atribui às vendas fora da curva |

### 1.2 Tabelas

#### `m2_bairros` — os 10 bairros cobertos
Seed em `supabase/seed.sql` (tabela 11.2), idempotente por `slug`.

| Coluna | Tipo | Significado |
|---|---|---|
| `id` | smallint identity | Identificador do bairro |
| `nome` | text, unique | Nome de exibição ("Perdizes") |
| `slug` | text, unique, check `^[a-z0-9-]+$` | Identificador em URL e no MCP ("perdizes") |
| `prefixos_cep` | text[] | Prefixos de CEP aceitos para o bairro (regra 11.2). Ex.: Perdizes `050`, `0125` |
| `padroes_nome` | text[] | Regex aplicadas ao campo bairro já normalizado (regra 11.2) |
| `ativo` | boolean, default true | Bairro em uso (a montagem do IPTU e a atribuição de bairro do ITBI leem só os ativos) |

Bairros e prefixos: Perdizes (050, 0125), Pompeia (050), Pinheiros (054), Vila Madalena (054), Alto de Pinheiros (054), Alto da Lapa (050, 054), Higienópolis (012, 013), Jardins (014), Cerqueira César (013, 014, 0540), Itaim Bibi (045).

#### `m2_perfis` — quem entra no painel
| Coluna | Tipo | Significado |
|---|---|---|
| `id` | uuid, pk, fk `auth.users` on delete cascade | O usuário do Supabase Auth |
| `email` | text | E-mail (usado como `autor` nas confirmações manuais) |
| `papel` | `m2_papel_usuario`, default `admin` | Papel |
| `ativo` | boolean, default true | Só perfil admin **ativo** entra (seção 6.1) |

Criado por `supabase/seed/primeiro_admin.sql` (o usuário precisa existir no Auth antes). Não há tela de gestão de usuários.

#### `m2_execucoes_ingestao` — uma linha por execução de rotina
| Coluna | Tipo | Significado |
|---|---|---|
| `fonte` | `m2_fonte_dado` | `iptu` (ingestao-iptu), `itbi` (ingestao-itbi), `anuncio` (coleta-anuncios), `edital_leilao` (coleta-leiloes), `calibracao` (calibracao) |
| `rotina` | text | Nome da rotina da seção 4.4 |
| `referencia` | text, nulo | Ano do ITBI ou exercício do IPTU ("2026"); nulo nas coletas e na calibração |
| `arquivo_url` | text, nulo | URL de origem do arquivo (ITBI baixado da página, IPTU por URL); nulo em carga de arquivo local ou do armazém |
| `arquivo_hash` | text, nulo | SHA-256 do arquivo (ITBI e IPTU). No ITBI, hash igual ao da última execução concluída do ano = "sem mudança" |
| `caminho_storage` | text, nulo | Caminho do bruto no armazém (`itbi/2025.xlsx`, `iptu/2026.zip`) |
| `status` | `m2_status_execucao`, default `em_andamento` | Situação (seção 12) |
| `linhas_lidas` / `linhas_gravadas` / `linhas_descartadas` | integer, default 0 | Contagens; o significado por rotina está na seção 5.10 |
| `mensagem_erro` | text, nulo | Mensagem quando `falhou` (até 2.000 caracteres); "tempo esgotado" quando expirou |
| `iniciada_em` | timestamptz | Início |
| `concluida_em` | timestamptz, nulo | Fim (também preenchido quando falha) |

#### `m2_predios` — condomínio residencial vertical, montado do IPTU
| Coluna | Tipo | Significado |
|---|---|---|
| `chave_predio` | text, unique | `setor-quadra-condominio` (regra 11.4), ex. `015-014-01-9`. O número de condomínio pode ter hífen |
| `setor`, `quadra` | char(3) | Os 3 + 3 primeiros dígitos do SQL |
| `numero_condominio` | text | Número de condomínio do IPTU, como veio |
| `bairro_id` | smallint, fk | Bairro do prédio (decidido pela lógica da 11.2 adaptada ao IPTU; seção 5.11) |
| `logradouro` | text | Logradouro normalizado (regra 11.5), o mais frequente entre os apartamentos |
| `numero` | integer, nulo | Número do imóvel mais frequente entre os apartamentos (exibição) |
| `numeros_imovel` | integer[], default `{}` | Todos os números de imóvel das unidades do condomínio (P3); a busca de endereço acha o prédio por qualquer um |
| `cep` | char(8) | CEP mais frequente dos apartamentos |
| `ano_construcao` | smallint, nulo | Ano (corrigido) mais frequente dos apartamentos |
| `qtd_pavimentos` | smallint, nulo | Maior número de pavimentos informado |
| `padrao_iptu` | text, nulo | Descrição do padrão de construção mais frequente |
| `total_unidades_residenciais` | integer, default 0 | Quantidade de apartamentos |
| `vagas_cadastro_proprio` | boolean, default false | Verdadeiro se o prédio tem ao menos uma unidade `vaga` (regra 11.6): a vaga é vendida em guia separada e não está na área do apartamento |
| `fator_predio` | numeric(5,3), nulo | Mediana dos fatores das plantas `indicativa`/`calibrada`/`confirmada`; nulo sem calibração |
| `prioridade_coleta` | integer, default 0 | Prioridade da coleta de anúncios (regra 11.13), recalculada a cada coleta |
| `ultima_coleta_em` | timestamptz, nulo | Última coleta de anúncios concluída para o prédio |
| `ultima_coleta_leilao_em` | timestamptz, nulo | Última busca em sites de leilão (regra 11.19) |
| `exercicio_iptu` | smallint | Exercício do IPTU que gerou o registro (o maior das unidades) |

#### `m2_plantas` — grupo de apartamentos de mesmo tamanho dentro de um prédio
| Coluna | Tipo | Significado |
|---|---|---|
| `predio_id` | uuid, fk | Prédio |
| `area_iptu_referencia` | numeric(10,2) | Mediana da área construída (IPTU) das unidades do grupo (regra 11.7) |
| `qtd_unidades` | integer | Quantos apartamentos têm essa planta |
| `area_privativa` | numeric(8,2), nulo | Área privativa (útil) calibrada; nula com `sem_dado` |
| `vagas_inclusas` | smallint, nulo | Vagas somadas à área do IPTU (0 quando o prédio tem vaga com cadastro próprio; senão das evidências; nulo se desconhecido) |
| `quartos` | smallint, nulo | Mediana dos quartos dos anúncios casados |
| `fator` | numeric(5,3), nulo | `area_privativa / area_iptu_referencia` |
| `selo` | `m2_selo_area`, default `sem_dado` | Confiança da área (regra 11.9) |
| `fonte_area` | `m2_fonte_dado`, nulo | De onde veio a área: `anuncio`, `pagina_condominio`, `edital_leilao`, `revisao_manual` ou `fator_referencia` |
| `faixa_erro_pct` | numeric(5,1), nulo | Faixa de erro em %, só no selo `estimada` (regra 11.10) |
| `especial` | boolean, default false | Provável cobertura, duplex ou unificada (regra 11.12) |
| `revisao_pendente` | boolean, default false | Planta na fila de revisão |
| `motivo_revisao` | `m2_motivo_revisao`, nulo | Um motivo por planta |

#### `m2_unidades` — uma linha por SQL (cadastro do IPTU) dentro de um prédio
| Coluna | Tipo | Significado |
|---|---|---|
| `sql` | char(11), unique | Número do contribuinte com zeros à esquerda |
| `predio_id` | uuid, fk | Prédio |
| `planta_id` | uuid, fk, nulo | Planta (só apartamentos; nulo para vagas e outros usos) |
| `tipo_unidade` | `m2_tipo_unidade` | Regra 11.3 |
| `complemento` | text, nulo | "APTO 72" |
| `uso_iptu` | text | Descrição do uso no IPTU |
| `area_construida` | numeric(10,2) | Área construída do IPTU (não é a privativa) |
| `fracao_ideal` | numeric(8,6), nulo | Fração ideal |
| `andar_inferido` | smallint, nulo | Andar tirado do complemento (regra 11.7, ver 5.11) |

#### `m2_transacoes` — uma guia de ITBI dos 10 bairros (todas as naturezas e usos)
| Coluna | Tipo | Significado |
|---|---|---|
| `hash_linha` | text, unique | SHA-256 dos valores originais da linha, unidos por `\|` (regra 11.1, idempotência) |
| `execucao_id` | uuid, fk | Execução que **gravou** a guia (uma guia "sem mudança" continua apontando para a carga original) |
| `sql` | char(11) | SQL da guia |
| `unidade_id`, `predio_id` | uuid, fk, nulos | Unidade e prédio do IPTU com o mesmo SQL; nulos se o SQL não existe no IPTU carregado (ligação tardia, seção 9.2) |
| `bairro_id` | smallint, fk | Bairro (regra 11.2) |
| `origem_bairro` | `m2_origem_bairro` | Passo da 11.2 que decidiu o bairro |
| `logradouro`, `numero`, `complemento`, `cep` | — | Endereço como veio na guia (CEP com 8 dígitos) |
| `natureza` | text | "1.Compra e venda" etc. |
| `eh_compra_venda` | boolean | Natureza começa com "1." |
| `data_transacao` | date | Data da transação |
| `mes_referencia` | date | 1º dia do mês da aba da planilha (mês de pagamento) |
| `valor_declarado` | numeric(14,2) | Valor declarado pelo contribuinte |
| `valor_venal_referencia` | numeric(14,2), nulo | Valor venal de referência **proporcional** |
| `base_calculo` | numeric(14,2), nulo | Base de cálculo adotada |
| `proporcao_transmitida` | numeric(6,4), nulo | Fração transmitida (a planilha traz %, gravada como fração: 100% → 1,0000) |
| `tipo_financiamento`, `valor_financiado` | text / numeric (default 0) | Financiamento |
| `cartorio`, `matricula` | text, nulos | Cartório e matrícula (só dígitos, sem zeros à esquerda) |
| `uso_iptu_guia` | text, nulo | **Descrição** do uso do IPTU na guia (não o código) |
| `area_construida_guia` | numeric(10,2), nulo | Área do IPTU informada na guia (construída, não privativa) |
| `fracao_ideal_guia` | numeric(8,6), nulo | Fração ideal da guia |
| `unidade_sem_cadastro_proprio` | boolean, default false | Regra 11.14: guia de unidade dentro de um SQL de lote inteiro; fica fora das vendas consolidadas |

#### `m2_vendas_consolidadas` — venda de apartamento com as vagas vendidas junto
Recalculada inteira a cada calibração (as linhas com `marcado_manual` são preservadas).

| Coluna | Tipo | Significado |
|---|---|---|
| `transacao_apartamento_id` | uuid, fk, unique | Guia do apartamento |
| `transacoes_vagas_ids` | uuid[], default `{}` | Guias de vaga agregadas (regra 11.15), sem FK (trade-off 7.7) |
| `predio_id`, `unidade_id` | uuid, fk | Prédio e unidade |
| `planta_id` | uuid, fk, nulo | Planta da unidade |
| `data_transacao` | date | Data da venda |
| `valor_apartamento` | numeric(14,2) | Valor declarado da guia do apartamento |
| `valor_vagas` | numeric(14,2), default 0 | Soma das guias de vaga agregadas |
| `valor_total` | numeric(14,2) | Apartamento + vagas |
| `qtd_vagas_separadas` | smallint, default 0 | Vagas agregadas (até 3) |
| `vagas_inclusas_area` | smallint, nulo | Copiado da planta: vagas já dentro da área |
| `area_privativa` | numeric(8,2), nulo | Área privativa da planta; nula com `sem_dado` |
| `selo_area` | `m2_selo_area` | Selo da planta no momento do cálculo (`sem_dado` se a unidade não tem planta) |
| `m2_privativo` | numeric(10,2), nulo | `valor_total / area_privativa` |
| `m2_iptu` | numeric(10,2) | `valor_apartamento / area_construida` da unidade |
| `fora_da_curva` | boolean, default false | Regra 11.16 |
| `marcado_manual` | boolean, default false | O admin forçou ou desfez o "fora da curva"; o pipeline mantém o valor do admin |

#### `m2_anuncios` — anúncio ou página de condomínio, só com os campos mínimos
| Coluna | Tipo | Significado |
|---|---|---|
| `url` | text, unique | Página coletada (recoleta atualiza a linha) |
| `dominio` | text | Domínio da allowlist (`lopes.com.br`, `quintoandar.com.br`, `loft.com.br`) |
| `fonte` | `m2_fonte_dado` | `anuncio` ou `pagina_condominio` |
| `execucao_id` | uuid, fk | Execução que gravou |
| `logradouro_extraido`, `numero_extraido`, `nome_condominio` | — | Endereço e nome extraídos |
| `finalidade` | `m2_finalidade_anuncio`, nulo | Venda ou aluguel |
| `area_privativa` | numeric(8,2), nulo | Área útil/privativa declarada (nunca a total) |
| `area_privativa_min` / `_max` | numeric(8,2), nulos | Faixa da página de condomínio ("70 a 89 m²") |
| `quartos`, `vagas`, `andar` | smallint, nulos | Atributos declarados |
| `preco_pedido` | numeric(14,2), nulo | Preço pedido |
| `predio_id` / `planta_id` | uuid, fk, nulos | Vínculo (regra 11.8) |
| `status_casamento` | `m2_status_casamento`, default `sem_predio` | Situação do vínculo |
| `confianca_casamento` | numeric(4,3), nulo | Similaridade do endereço (0–1); nula no vínculo manual |
| `casado_manual` | boolean, default false | O admin definiu o vínculo; o pipeline não altera mais a linha (regra 11.11) |
| `coletado_em` | timestamptz | Momento da coleta |

#### `m2_editais_leilao` — edital de leilão, só campos extraídos (o PDF não é guardado)
| Coluna | Tipo | Significado |
|---|---|---|
| `url` | text, unique | Página do lote |
| `url_documento` | text, nulo | PDF lido (edital, laudo ou matrícula); nulo se os dados vieram só da página |
| `dominio` | text | Site de leilão da allowlist |
| `execucao_id` | uuid, fk | Execução que gravou |
| `logradouro_extraido`, `numero_extraido`, `complemento_extraido` | — | Endereço da unidade |
| `matricula`, `cartorio` | text, nulos | Matrícula (dígitos) e cartório |
| `area_privativa`, `area_comum`, `area_total` | numeric(8,2), nulos | Áreas declaradas. A total menor que a privativa vira nula (coerência) |
| `fracao_ideal` | numeric(8,6), nulo | Fração ideal |
| `vagas` | smallint, nulo | Vagas |
| `vagas_vinculadas_area` | boolean, nulo | O documento diz que as vagas estão na área da unidade |
| `valor_avaliacao` | numeric(14,2), nulo | Valor de avaliação |
| `data_leilao` | date, nulo | 1ª praça |
| `origem_documento` | text | `pagina`, `edital`, `laudo` ou `matricula` |
| `predio_id` / `unidade_id` | uuid, fk, nulos | Vínculo (regra 11.20) |
| `status_casamento` | `m2_status_casamento_edital`, default `sem_predio` | Situação do vínculo |
| `casado_manual` | boolean, default false | O admin definiu o vínculo (regra 11.11) |
| `coletado_em` | timestamptz | Momento da coleta |

#### `m2_calibracoes` — histórico de toda mudança de área de uma planta (só inserção)
| Coluna | Tipo | Significado |
|---|---|---|
| `planta_id` | uuid, fk | Planta |
| `area_privativa`, `vagas_inclusas`, `fator` | nulos | Estado gravado (área nula quando a calibração apagou a área) |
| `selo` | `m2_selo_area` | Selo resultante |
| `fonte` | `m2_fonte_dado` | Fonte da área (quando a área é apagada, a fonte anterior da planta) |
| `anuncios_ids`, `editais_ids` | uuid[], default `{}` | Evidências usadas |
| `observacao` | text, nulo | Obrigatória na revisão manual |
| `autor` | text | `pipeline` ou e-mail do admin |

#### `m2_fatores_referencia` — fator típico por grupo (regra 11.10)
Substituída inteira a cada calibração. Unique (`bairro_id`, `decada_construcao`, `vagas_cadastro_proprio`) com `nulls not distinct`.

| Coluna | Tipo | Significado |
|---|---|---|
| `bairro_id` | smallint, fk, nulo | Bairro; nulo = os 10 bairros |
| `decada_construcao` | smallint, nulo | 1970, 1980…; nulo = todas |
| `vagas_cadastro_proprio` | boolean | Grupo de prédios com ou sem vaga com cadastro próprio |
| `fator_mediano`, `fator_p25`, `fator_p75` | numeric(5,3) | Mediana e quartis (interpolação linear) dos fatores |
| `qtd_plantas` | integer | Plantas `calibrada`/`confirmada` não especiais no grupo (só se grava com ≥ 8) |
| `calculado_em` | timestamptz | Momento do cálculo |

#### `m2_cobertura_bairros` — foto do indicador de cobertura (D12), só inserção
Uma linha por bairro a cada calibração.

| Coluna | Tipo | Significado |
|---|---|---|
| `bairro_id` | smallint, fk | Bairro |
| `calculado_em` | timestamptz | Momento da foto |
| `vendas_24m` | integer | Vendas consolidadas dos últimos 24 meses |
| `vendas_confirmada` … `vendas_sem_dado` | integer | Essas vendas por selo |
| `pct_cobertura` | numeric(5,1) | `(confirmada + calibrada) / vendas_24m × 100` (indicativa não entra, P4); 0 sem vendas |

#### `m2_chaves_api` — chaves do cliente MCP
| Coluna | Tipo | Significado |
|---|---|---|
| `nome` | text | Nome dado pelo admin (3 a 60 caracteres) |
| `prefixo` | char(8) | Primeiros 8 caracteres da chave, para reconhecê-la na lista |
| `hash_chave` | text, unique | SHA-256 da chave; a chave em si nunca é guardada |
| `ativa` | boolean, default true | Falso depois de revogada |
| `ultimo_uso_em` | timestamptz, nulo | Último uso no MCP |
| `criada_por` | uuid, fk `m2_perfis` | Admin que criou |

#### Tabelas do OAuth do MCP (épico 8.10; migrations `20261123100000` e `20261123110000`)
As cinco ficam fora do alcance do `anon` e do `authenticated` (RLS ligado, sem política, `revoke all`). Só o servidor escreve e lê, pela service role e pelas funções da seção 3.3.

#### `m2_clientes` — conta de cliente MCP (quem entrou com Google)
| Coluna | Tipo | Significado |
|---|---|---|
| `google_sub` | text, unique | Identificador estável da conta Google (`sub` do `id_token`) |
| `email` | text | E-mail verificado do Google, em minúsculas; atualizado a cada entrada se mudou |
| `bloqueado_em` | timestamptz, nulo | Preenchido quando o admin bloqueia: a conta não entra, não autoriza e os tokens dela param na hora |

Não guarda nome nem foto (princípio 4). Fica fora do Supabase Auth: o painel continua só para admin.

#### `m2_oauth_clientes` — app que se registrou sozinho (RFC 7591)
| Coluna | Tipo | Significado |
|---|---|---|
| `nome` | text | `client_name` informado (até 100 caracteres; padrão "Cliente MCP"). Aparece na tela de consentimento |
| `redirect_uris` | text[] | 1 a 5 endereços de volta aceitos (https, ou http em localhost/127.0.0.1) |

É o app (Claude, outro assistente), não a pessoa. Registro sem uso por 30 dias é apagado pela própria função de registro.

#### `m2_oauth_codigos` — código de autorização de uso único
| Coluna | Tipo | Significado |
|---|---|---|
| `codigo_hash` | text, pk | SHA-256 do código; o código em si só vai no redirect |
| `oauth_cliente_id` | uuid, fk on delete cascade | App que pediu |
| `cliente_id` | uuid, fk on delete cascade | Conta que permitiu |
| `redirect_uri` | text | Endereço de volta do pedido (a troca exige o mesmo) |
| `code_challenge` | text | Desafio PKCE S256 (43 caracteres base64url) |
| `expira_em` | timestamptz | Criação + 10 min (`OAUTH_CODIGO_SEGUNDOS`) |
| `usado_em` | timestamptz, nulo | Quando foi trocado por token |
| `token_id` | uuid, fk on delete set null, nulo | Token que o código gerou; revogado se o código voltar (RFC 9700) |

#### `m2_tokens_mcp` — token de acesso `fpq_mcp_…`
| Coluna | Tipo | Significado |
|---|---|---|
| `cliente_id` | uuid, fk on delete cascade | Dono do token |
| `oauth_cliente_id` | uuid, fk on delete set null, nulo | App que recebeu o token |
| `prefixo` | text | `fpq_mcp_` + 8 caracteres, para reconhecer o token |
| `hash_token` | text, unique | SHA-256 do token; o token em si nunca é guardado |
| `revogado_em` | timestamptz, nulo | Preenchido no reuso de código. Não há tela que revogue token um a um: o admin bloqueia a conta |
| `ultimo_uso_em` | timestamptz, nulo | Última chamada aceita |

O token não expira e não há refresh token (6.5, passo 5).

#### `m2_uso_mcp` — contagem de chamadas por token e por minuto (regra 11.22)
| Coluna | Tipo | Significado |
|---|---|---|
| `token_id` | uuid, fk on delete cascade, parte da pk | Token |
| `janela` | timestamptz, parte da pk | Início do minuto (`date_trunc('minute')`) |
| `chamadas` | integer, default 0 | Chamadas aceitas naquele minuto |

Linhas com mais de 2 dias são apagadas pela própria função de uso.

---

## 2. Relacionamentos

| Relação | Cardinalidade em linguagem de negócio | FK |
|---|---|---|
| Bairro → prédios | Um bairro tem vários prédios; cada prédio está em um bairro | `m2_predios.bairro_id` |
| Prédio → plantas | Um prédio tem várias plantas; cada planta é de um prédio | `m2_plantas.predio_id` |
| Prédio → unidades | Um prédio tem várias unidades (apartamentos, vagas, outros); cada unidade é de um prédio | `m2_unidades.predio_id` |
| Planta → unidades | Cada apartamento pertence a uma planta; vagas e outros usos não têm planta; uma planta agrupa vários apartamentos | `m2_unidades.planta_id` (nulo) |
| Bairro → guias | Um bairro tem várias guias do ITBI; cada guia tem um bairro | `m2_transacoes.bairro_id` |
| Unidade/prédio → guias | Uma unidade pode ter várias guias ao longo do tempo; uma guia aponta para no máximo uma unidade e um prédio (nenhum, se o SQL não está no IPTU) | `m2_transacoes.unidade_id`, `predio_id` |
| Execução → guias, anúncios, editais | Uma execução grava várias guias, anúncios ou editais; cada um registra a execução que o gravou | `execucao_id` |
| Guia → venda | Cada venda consolidada nasce de exatamente uma guia de apartamento; uma guia de apartamento gera no máximo uma venda. Uma venda agrega de 0 a 3 guias de vaga (array, sem FK); cada guia de vaga entra em no máximo uma venda | `transacao_apartamento_id` (unique); `transacoes_vagas_ids` |
| Prédio/unidade/planta → vendas | Um prédio, uma unidade e uma planta têm várias vendas; cada venda é de um prédio e uma unidade e, quase sempre, de uma planta | `predio_id`, `unidade_id`, `planta_id` (nulo) |
| Prédio/planta → anúncios | Um prédio tem vários anúncios; um anúncio aponta para no máximo um prédio e no máximo uma planta | `m2_anuncios.predio_id`, `planta_id` |
| Prédio/unidade → editais | Um prédio tem vários editais; um edital aponta para no máximo um prédio e no máximo uma unidade (a planta vem da unidade) | `m2_editais_leilao.predio_id`, `unidade_id` |
| Planta → calibrações | Uma planta tem um histórico de várias calibrações; cada calibração é de uma planta | `m2_calibracoes.planta_id` |
| Bairro → fatores de referência | Um bairro tem vários grupos de fator (por década e vaga); os grupos com `bairro_id` nulo valem para os 10 bairros | `m2_fatores_referencia.bairro_id` (nulo) |
| Bairro → cobertura | Um bairro tem uma foto de cobertura por calibração | `m2_cobertura_bairros.bairro_id` |
| Usuário → perfil → chaves | Cada usuário do Auth tem no máximo um perfil (apagado junto com o usuário); um admin cria várias chaves | `m2_perfis.id` → `auth.users`; `m2_chaves_api.criada_por` |
| Conta de cliente → tokens | Uma conta Google tem vários tokens (um por conexão autorizada); cada token é de uma conta. Apagar a conta apaga os tokens | `m2_tokens_mcp.cliente_id` |
| App OAuth → tokens | Um app registrado recebe vários tokens; o token guarda o app que o recebeu (vira nulo se o app for apagado) | `m2_tokens_mcp.oauth_cliente_id` |
| App e conta → códigos | Cada código é de um app e de uma conta; um app e uma conta têm vários códigos ao longo do tempo | `m2_oauth_codigos.oauth_cliente_id`, `cliente_id` |
| Código → token | Cada código gera no máximo um token; cada token nasce de um código | `m2_oauth_codigos.token_id` |
| Token → uso | Um token tem uma linha de contagem por minuto em que foi usado | `m2_uso_mcp.token_id` |

Contas de cliente (`m2_clientes`) e admins (`m2_perfis`) não se relacionam: são identidades separadas.

Ligações que **não** são FK: `transacoes_vagas_ids` (array) e `m2_calibracoes.anuncios_ids`/`editais_ids` (arrays de auditoria).

---

## 3. Regras no banco

### 3.1 Extensões e Storage
- `pg_trgm` e `unaccent` no schema `extensions` (migration `20261121120000`).
- Bucket privado `m2_brutos` (migration `20261121130000`), sem políticas em `storage.objects` para `anon`/`authenticated`: só a service role lê e grava. Guarda os brutos do IPTU e do ITBI no ambiente local; nas Actions os brutos vão para o R2 (seção 6).

### 3.2 Triggers

| Trigger | Tabela | Quando | O que faz |
|---|---|---|---|
| `m2_bairros_atualizado_em`, `m2_perfis_atualizado_em`, `m2_execucoes_ingestao_atualizado_em`, `m2_predios_atualizado_em`, `m2_plantas_atualizado_em`, `m2_unidades_atualizado_em`, `m2_transacoes_atualizado_em`, `m2_vendas_consolidadas_atualizado_em`, `m2_anuncios_atualizado_em`, `m2_editais_leilao_atualizado_em`, `m2_fatores_referencia_atualizado_em`, `m2_chaves_api_atualizado_em`, `m2_clientes_atualizado_em` (8.10) | a tabela do nome | `before update`, por linha | Executa `m2_atualizar_atualizado_em()`, que grava `now()` em `atualizado_em` |

### 3.3 Funções

Todas com `search_path = ''` e nomes qualificados. "Quem executa": `authenticated` = sessão do painel (com RLS); `service_role` = pipeline e servidor do MCP. Nenhuma é executável por `anon`.

**Escrita do admin (SECURITY DEFINER; exigem `m2_eh_admin()`, senão erro 42501). São o único caminho de escrita do admin nessas tabelas.**

| Função | Tabelas | O que faz | Erros |
|---|---|---|---|
| `m2_confirmar_area_planta(planta_id, area_privativa, vagas_inclusas, observacao)` | `m2_plantas`, `m2_calibracoes`, lê `m2_perfis` | Revisão manual (11.9, 11.11): grava área, vagas, `fator = round(área / area_iptu_referencia, 3)`, selo `confirmada`, fonte `revisao_manual`, `faixa_erro_pct` nula, limpa `revisao_pendente`/`motivo_revisao`; insere em `m2_calibracoes` com a observação e `autor` = e-mail do admin. Devolve a planta | 22023 observação vazia ou área ≤ 0; P0002 planta inexistente |
| `m2_casar_anuncio(anuncio_id, predio_id, planta_id)` | `m2_anuncios` | Vínculo manual (11.8, 11.11): prédio nulo → `descartado`; com planta (que precisa ser do prédio) → `casado_planta`; só prédio → `casado_predio`. Grava `casado_manual = true` e zera `confianca_casamento` | 22023 planta sem prédio ou de outro prédio; P0002 |
| `m2_casar_edital(edital_id, predio_id, unidade_id)` | `m2_editais_leilao` | Igual para editais (11.20): `descartado`, `casado_unidade` (a unidade precisa ser do prédio) ou `casado_predio`; `casado_manual = true` | 22023; P0002 |
| `m2_marcar_outlier(venda_id, fora_da_curva)` | `m2_vendas_consolidadas` | Grava `fora_da_curva` e `marcado_manual = true` (11.16, 11.11) | 22023 valor nulo; P0002 |
| `m2_marcar_planta_especial(planta_id, especial)` | `m2_plantas` | Grava `especial`; se a planta estava na fila por `planta_especial`, a revisão é resolvida (11.12) | 22023; P0002 |

**Apoio ao acesso e à busca**

| Função | Quem executa | O que faz |
|---|---|---|
| `m2_eh_admin()` | authenticated, service_role (SECURITY DEFINER, stable) | Verdadeiro se `auth.uid()` tem linha em `m2_perfis` com papel `admin` e `ativo`. Usada por todas as políticas de leitura e pelas funções de escrita |
| `m2_normalizar_endereco(texto)` | authenticated, service_role (immutable) | Regra 11.5: sem acento, maiúsculas, pontuação vira espaço, espaços simples, abreviações R/AV/AL/PCA/DR/PROF/CEL/MIN/CAP/SEN/VER expandidas como palavra inteira. Espelhada em TS em `shared/endereco.ts` |
| `m2_buscar_predio_por_endereco(texto, limiar_similaridade = 0.4, limite = 5)` | authenticated, service_role (INVOKER, stable) | Regra 11.5: normaliza; com vírgula, o número é o 1º grupo de dígitos depois dela; sem vírgula, o último grupo de dígitos. Com número: prédio com `numero` igual **ou** número em `numeros_imovel`, e similaridade trigram do logradouro ≥ limiar. Sem número: só o limiar. Devolve até `limite` prédios (id, endereço, bairro, slug, ano, total de unidades, similaridade), do mais similar |

**Leituras do painel e do MCP (SECURITY INVOKER: o RLS vale; sem admin, vêm vazias)**

| Função | Quem executa | O que faz |
|---|---|---|
| `m2_listar_predios(bairro, selo, so_revisao, busca, janela_meses, limite, deslocamento)` | authenticated, service_role | Tela Prédios: prédio, bairro, ano, unidades, nº de plantas, **pior selo** (ordem da 11.13), vendas na janela, se alguma planta tem revisão pendente e o total do filtro. Busca: texto normalizado (11.5) sem dígitos, por "contém" no logradouro, mais o número em `numero`/`numeros_imovel`. Filtro de selo é pelo pior selo. Ordem: vendas na janela desc., logradouro, número. Limite 1–100 (padrão 50) |
| `m2_cobertura_atual()` | authenticated, service_role | A última foto de `m2_cobertura_bairros` de cada bairro, com o nome |
| `m2_ultimas_execucoes()` | authenticated, service_role | A execução mais recente de cada rotina, qualquer status |
| `m2_fila_revisao(bairro, motivo, janela_meses, limite, deslocamento)` | authenticated, service_role | Fila de revisão: plantas com `revisao_pendente` (motivo da planta) e vendas `fora_da_curva` não `marcado_manual` (motivo `venda_fora_da_curva`). Para as plantas, devolve as áreas dos anúncios `casado_planta` e dos editais `casado_unidade` das unidades da planta, **em ordem crescente de área** (migration `20261122230000`). Numera os itens por motivo, ordenados pelas vendas do prédio na janela; `limite` (1–100, padrão 20) e `deslocamento` valem **por motivo**; cada linha traz o total do motivo |
| `m2_mediana_bairro(bairro_slug, janela_meses, quartos)` | só service_role | Regra 11.17 para o MCP `m2_bairro`: vendas do bairro na janela, não fora da curva, com `m2_privativo` e selo ≥ `estimada` (e, se `quartos` vier, só plantas com esses quartos). Devolve nome do bairro, mediana, p25, p75 (`percentile_cont`, arredondados), n, distribuição por selo (jsonb) e quantas têm vagas inclusas. Nenhuma linha se o slug não existe |

**Funções do pipeline (só `service_role`; recebem listas no corpo do RPC para não estourar a URL)**

| Função | Tabelas | O que faz |
|---|---|---|
| `m2_unidades_por_sql(sqls)` | `m2_unidades`, `m2_predios` | Para cada SQL que existe no IPTU: unidade, prédio e bairro do prédio (11.2 passo 2) |
| `m2_itbi_substituir_ano(ano, execucao_id, hashes)` | `m2_transacoes`, `m2_vendas_consolidadas`, `m2_execucoes_ingestao` | Regra 11.1, ao fim de uma carga que gravou: apaga as guias do ano (`mes_referencia`) de outras execuções cujo hash não veio no arquivo novo, e antes as vendas consolidadas delas; marca `substituida` as execuções `concluida` anteriores de `ingestao-itbi` daquele ano. Devolve quantas guias apagou |
| `m2_ligar_transacoes_unidades()` | `m2_transacoes`, `m2_unidades` | Seção 9.2: preenche `unidade_id`/`predio_id` das guias sem unidade cujo SQL agora existe |
| `m2_vendas_remover_obsoletas(manter)` | `m2_vendas_consolidadas` | Apaga as vendas cuja guia de apartamento não está em `manter`, **exceto** `marcado_manual` (11.11) |
| `m2_atualizar_prioridades(ids, prioridades)` | `m2_predios` | Grava `prioridade_coleta` (11.13) só onde mudou |
| `m2_aplicar_calibracao_plantas(plantas, historico)` | `m2_plantas`, `m2_calibracoes` | Grava o estado calibrado só das plantas cujo estado difere do pedido e **nunca** de planta `confirmada` + `revisao_manual` (11.11); insere histórico (autor `pipeline`) só das plantas que de fato atualizou (idempotente, migration `20261122160100`) |
| `m2_atualizar_fator_predio(ids, fatores)` | `m2_predios` | Grava `fator_predio` só onde mudou |
| `m2_substituir_fatores_referencia(linhas)` | `m2_fatores_referencia` | Apaga tudo e insere os grupos novos, numa transação |

**OAuth do MCP e contas de cliente (épico 8.10; SECURITY DEFINER; limites passados pelo servidor a partir de `regras.ts`)**

| Função | Quem executa | Tabelas | O que faz |
|---|---|---|---|
| `m2_registra_cliente_oauth(nome, redirect_uris, limite_hora, dias_sem_uso)` | só service_role | `m2_oauth_clientes`, lê `m2_oauth_codigos` e `m2_tokens_mcp` | 6.5, passo 3. Com trava consultiva, apaga apps com mais de `dias_sem_uso` (30) dias que nunca geraram código nem token; se na última hora já houve `limite_hora` (200) registros, devolve nulo; senão grava e devolve o id |
| `m2_entra_cliente(sub, email, limite_novos_dia)` | só service_role | `m2_clientes` | Regra 11.21. Conta existente: bloqueada → `bloqueada`; senão atualiza o e-mail se mudou → `existente`. Conta nova: com trava consultiva, se já há `limite_novos_dia` (50) contas criadas nas últimas 24 h → `pausado` (id nulo); senão cria → `nova`. Devolve `(cliente_id, situacao)` |
| `m2_cria_codigo_oauth(codigo_hash, oauth_cliente_id, cliente_id, redirect_uri, code_challenge, validade_s)` | só service_role | `m2_oauth_codigos`, lê `m2_oauth_clientes` e `m2_clientes` | 6.5, passo 4. Confere app existente (`invalid_client`), `redirect_uri` exatamente um dos registrados e desafio S256 de 43 caracteres (`invalid_request`), conta não bloqueada (`access_denied`); apaga códigos vencidos há mais de 1 dia; grava o código com validade de `validade_s` (600) s |
| `m2_troca_codigo_oauth(codigo_hash, oauth_cliente_id, redirect_uri, challenge_do_verifier, token_hash, token_prefixo)` | só service_role | `m2_oauth_codigos`, `m2_tokens_mcp`, lê `m2_clientes` | 6.5, passo 5. Trava a linha do código (`for update`). Código já usado: revoga o token que ele gerou e devolve nulo. Vencido, de outro app, outro `redirect_uri`, PKCE diferente ou conta bloqueada: nulo. Senão cria o token, marca o código como usado e devolve o id da conta. Nunca lança exceção (para a revogação do reuso ficar gravada) |
| `m2_usa_token_mcp(hash, por_minuto, por_dia)` | só service_role | `m2_tokens_mcp`, `m2_clientes`, `m2_uso_mcp` | 6.3 e regra 11.22, numa ida ao banco. Token inexistente, revogado ou de conta bloqueada: nenhuma linha. Com trava consultiva por token, soma as chamadas do minuto corrente e das últimas 24 h; no limite do dia (1.000) ou do minuto (30) devolve `permitido = false` e `espera_s` (até a janela mais antiga sair das 24 h, ou até o próximo minuto), sem contar a chamada. Senão conta a chamada, grava `ultimo_uso_em` e apaga janelas do token com mais de 2 dias. Devolve `(token_id, permitido, espera_s)` |
| `m2_clientes_mcp(limite, deslocamento)` | authenticated, service_role | `m2_clientes`, `m2_tokens_mcp`, `m2_uso_mcp` | Tela Chaves de API, "Contas conectadas". Só com `m2_eh_admin()` (senão vazia). Uma página das contas, das mais recentes, com e-mail, criação, bloqueio, último uso (máximo dos tokens), chamadas nas últimas 24 h, tokens não revogados e o `total` de contas. Substituiu a versão sem paginação (migration `20261123110000`) |
| `m2_bloqueia_cliente(cliente_id, bloquear)` | authenticated, service_role | `m2_clientes` | Seção 5. Sem admin, lança `acesso_negado` (SQLSTATE P0001, diferente do 42501 das outras funções de escrita). Bloquear grava `bloqueado_em` (mantém a data se já estava bloqueada); desbloquear limpa. Id inexistente não dá erro |

Exclusões físicas que existem: guias e vendas em `m2_itbi_substituir_ano`; vendas obsoletas em `m2_vendas_remover_obsoletas`; o conteúdo de `m2_fatores_referencia` na substituição; no OAuth, apps sem uso há 30 dias (`m2_registra_cliente_oauth`), códigos vencidos há mais de 1 dia (`m2_cria_codigo_oauth`) e contagens com mais de 2 dias (`m2_usa_token_mcp`). Nada é apagado pelo painel nem pelo MCP.

### 3.4 Políticas (RLS ligado em todas as 19 tabelas)

| Política | Tabela | Comando / papel | Regra |
|---|---|---|---|
| `m2_<tabela>_leitura_admin` (12 políticas: `m2_bairros`, `m2_execucoes_ingestao`, `m2_predios`, `m2_plantas`, `m2_unidades`, `m2_transacoes`, `m2_vendas_consolidadas`, `m2_anuncios`, `m2_editais_leilao`, `m2_calibracoes`, `m2_fatores_referencia`, `m2_cobertura_bairros`) | a do nome | SELECT, authenticated | `(select m2_eh_admin())` |
| `m2_perfis_leitura_propria` | `m2_perfis` | SELECT, authenticated | `id = (select auth.uid())`: cada um lê só a própria linha |
| `m2_chaves_api_leitura_admin` | `m2_chaves_api` | SELECT, authenticated | admin |
| `m2_chaves_api_insercao_admin` | `m2_chaves_api` | INSERT, authenticated | admin e `criada_por = auth.uid()` |
| `m2_chaves_api_atualizacao_admin` | `m2_chaves_api` | UPDATE, authenticated | admin (using e with check) |

Não há política de insert/update/delete nas outras tabelas: o admin escreve só pelas funções SECURITY DEFINER; o pipeline usa a service role (ignora RLS). `anon` não tem política (recebe 0 linhas). As cinco tabelas do OAuth (`m2_clientes`, `m2_oauth_clientes`, `m2_oauth_codigos`, `m2_tokens_mcp`, `m2_uso_mcp`) têm RLS ligado e **nenhuma** política: nem o admin as lê direto; ele vê as contas por `m2_clientes_mcp()`.

### 3.5 Grants (defesa em profundidade)
- `anon` e `authenticated`: só `SELECT` nas tabelas `m2_*` do modelo original (o RLS decide as linhas).
- `authenticated` em `m2_chaves_api`: `INSERT (nome, prefixo, hash_chave, criada_por)` e `UPDATE (ativa)`.
- Tabelas do OAuth: `revoke all` de `anon` e `authenticated`.
- Funções do OAuth: `execute` só para `service_role`, menos `m2_clientes_mcp` e `m2_bloqueia_cliente`, que também o `authenticated` executa (e que conferem `m2_eh_admin()` por dentro).
- `m2_atualizar_atualizado_em()` não é executável por ninguém além do dono (é função de trigger).

### 3.6 Índices
Os da seção 7.3 com prefixo (`m2_transacoes_sql_idx`, `m2_transacoes_predio_data_idx`, `m2_transacoes_bairro_data_idx`, `m2_unidades_predio_idx`, `m2_unidades_planta_idx`, `m2_plantas_predio_idx`, `m2_vendas_consolidadas_predio_data_idx`, `m2_vendas_consolidadas_planta_idx`, `m2_anuncios_predio_idx`, `m2_editais_leilao_predio_idx`, `m2_editais_leilao_matricula_idx`, `m2_predios_bairro_idx`, `m2_predios_logradouro_numero_idx`, GIN trigram `m2_predios_logradouro_trgm_idx`), mais índices em FKs (execução, unidade, planta, criada_por, bairro/data da cobertura) e `m2_vendas_consolidadas_data_idx` (8.9). No 8.10: `m2_clientes_criado_em_idx` e `m2_oauth_clientes_criado_em_idx` (limites por janela de tempo), `m2_oauth_codigos_expira_idx`, `m2_uso_mcp_janela_idx` e índices nas FKs de códigos e tokens.

---

## 4. Mapas

### 4.1 Tela → tabelas e funções
As telas do admin leem com a **sessão do admin** (chave anon + JWT; RLS); nenhuma delas usa a service role. As telas do cliente MCP (`/oauth/*`) rodam no servidor com a service role, porque as tabelas do OAuth não têm política.

| Tela (rota) | Lê | Escreve / funções |
|---|---|---|
| Login (`/login`), Esqueci a senha (`/esqueci-senha`), Redefinir senha (`/redefinir-senha`), `/auth/confirmar`, `/auth/sair` | Supabase Auth | Supabase Auth (`signInWithPassword`, `resetPasswordForEmail`, `verifyOtp`/`exchangeCodeForSession`, `updateUser`, `signOut`) |
| Layout do painel (todas as telas) | `m2_perfis` (própria linha) | — |
| Visão geral (`/`) | `m2_cobertura_atual()` (`m2_cobertura_bairros`, `m2_bairros`), `m2_ultimas_execucoes()` (`m2_execucoes_ingestao`) | — |
| Prédios (`/predios`) | `m2_bairros`; `m2_listar_predios()` (`m2_predios`, `m2_bairros`, `m2_plantas`, `m2_vendas_consolidadas`) | — |
| Ficha do prédio (`/predios/[id]`) | `m2_predios` + `m2_bairros`; `m2_plantas` + `m2_calibracoes`; `m2_vendas_consolidadas` + `m2_unidades` + `m2_plantas`; `m2_anuncios`; `m2_editais_leilao` + `m2_unidades`; `m2_unidades` (apartamentos) | `m2_confirmar_area_planta`, `m2_marcar_planta_especial`, `m2_marcar_outlier`, `m2_casar_anuncio`, `m2_casar_edital` |
| Fila de revisão (`/revisao`) | `m2_bairros`; `m2_fila_revisao()` (`m2_plantas`, `m2_anuncios`, `m2_editais_leilao`, `m2_unidades`, `m2_vendas_consolidadas`, `m2_predios`, `m2_bairros`) | — (abre a ficha) |
| Evidências sem vínculo (`/evidencias`) | `m2_anuncios` ou `m2_editais_leilao`; no "Vincular": `m2_buscar_predio_por_endereco()`, `m2_plantas`, `m2_unidades` | `m2_casar_anuncio`, `m2_casar_edital` |
| Execuções (`/execucoes`) | `m2_execucoes_ingestao` (50); saúde: `m2_execucoes_ingestao` (200) e `m2_cobertura_bairros` (40) | `POST /api/execucoes/disparar` → GitHub `workflow_dispatch` |
| Chaves de API (`/chaves`) | `m2_chaves_api` (sem o hash, até 200); "Contas conectadas": `m2_clientes_mcp(50, deslocamento)` (`m2_clientes`, `m2_tokens_mcp`, `m2_uso_mcp`) | `POST /api/chaves` (insert), `POST /api/chaves/[id]/revogar` (update `ativa`), `POST /api/clientes/[id]/bloquear` (`m2_bloqueia_cliente`) |
| [Cliente MCP] Entrar (`/oauth/entrar`) | — | Link para `GET /api/auth/google` (que grava `m2_clientes` via `m2_entra_cliente` no retorno) |
| [Cliente MCP] Autorizar conexão (`/oauth/autorizar`) | `m2_oauth_clientes` (pelo `client_id`), `m2_clientes` (conta da sessão) | Formulário para `POST /oauth/autorizar/decidir` (`m2_cria_codigo_oauth` → `m2_oauth_codigos`) |
| [Público] Privacidade (`/privacidade`) e Termos (`/termos`) | — (texto fixo) | — |

### 4.2 Rotas de servidor (painel e OAuth)

| Rota | Valida | Tabelas / serviço | Respostas |
|---|---|---|---|
| `POST /api/execucoes/disparar {rotina}` | admin (`requireAdmin`); rotina em `ROTINAS` | GitHub API com `GITHUB_TOKEN_DISPATCH`/`GITHUB_REPO` (só servidor, `src/server/github.ts`) | 204; 400 "Rotina inválida."; 401/403/500; 502 com a mensagem do GitHub |
| `POST /api/chaves {nome}` | admin; nome 3–60 | insert em `m2_chaves_api` (sessão, RLS) | 201 `{chave, prefixo}` com `no-store`; 400; 401/403; 500 |
| `POST /api/chaves/[id]/revogar` | admin; id uuid | update `ativa = false` (sessão, RLS) | 204; 404 (id malformado ou inexistente); 401/403; 500 |
| `POST /api/clientes/[id]/bloquear {bloquear}` | admin; id uuid; `bloquear` booleano | `m2_bloqueia_cliente` com a sessão | 204; 400 "Envie {bloquear: true\|false}."; 404 "Conta não encontrada." (id malformado); 401/403; 500 "Não foi possível alterar a conta." |
| `/api/mcp` e `/mcp` (rewrite) | token OAuth ou chave Bearer | ver 4.3 | ver 5.8 |

Rotas do OAuth do MCP (fora do proxy do painel; todas com `cache-control: no-store` e CORS aberto nas respostas JSON):

| Rota | Valida | Tabelas / serviço | Respostas |
|---|---|---|---|
| `GET /.well-known/oauth-protected-resource` e `…/mcp` | — | — | `{resource: <site>/mcp, authorization_servers: [<site>], bearer_methods_supported: ["header"]}` |
| `GET /.well-known/oauth-authorization-server` | — | — | Emissor, endpoints de autorização, token e registro; só `code`, `authorization_code`, `S256` e cliente público (`none`) |
| `POST /oauth/registrar` (JSON) | `redirect_uris` 1–5, cada uma aceitável (https, ou http em localhost/127.0.0.1, até 500 caracteres, sem fragmento nem credenciais); `client_name` 1–100 opcional | `m2_registra_cliente_oauth` | 201 com `client_id`; 400 `invalid_client_metadata` ou `invalid_redirect_uri`; 429 `temporarily_unavailable`; 500 `server_error` |
| `GET /api/auth/google?volta=` | `volta` saneada (só `/oauth/autorizar?…`, senão `/oauth/entrar`) | Google (URL de consentimento) | 302 para o Google com cookie `m2_login_google` (state, verifier PKCE e volta; 10 min; caminho `/api/auth/google`); sem as variáveis do Google, 302 para `/oauth/entrar?erro=falha` |
| `GET /api/auth/google/callback` | `state` igual ao do cookie | Google (troca do código, chaves públicas), `m2_entra_cliente` | 302 para a volta com o cookie `m2_cliente` (sessão de 30 dias); erros → `/oauth/entrar?erro=falha\|pausado\|bloqueada` |
| `POST /oauth/autorizar/decidir` (form) | `Origin` igual a `NEXT_PUBLIC_SITE_URL`; sessão de cliente; os mesmos parâmetros da tela | `m2_oauth_clientes`, `m2_cria_codigo_oauth` | 303 para o `redirect_uri` com `code` e `state` (Permitir) ou `error=access_denied` (Cancelar); 403 `invalid_origin`/`login_required`; 400 com o código do erro; 500 `server_error` |
| `POST /oauth/token` (form ou JSON) | `grant_type = authorization_code`; `code`, `client_id`, `redirect_uri` e `code_verifier` de 43–128 caracteres | `m2_oauth_clientes`, `m2_troca_codigo_oauth` | 200 `{access_token, token_type: "Bearer"}`; 400 `unsupported_grant_type`, `invalid_request` ou `invalid_grant`; 401 `invalid_client`; 500 `server_error` |

### 4.3 Ferramenta MCP → tabelas
O MCP usa a **service role** (só em `src/server/`). Toda chamada lê também a credencial: com token `fpq_mcp_…`, `m2_usa_token_mcp` (`m2_tokens_mcp`, `m2_clientes`, grava `m2_uso_mcp` e `ultimo_uso_em`); com chave do painel, `m2_chaves_api` (confere a chave e grava `ultimo_uso_em`). E lê `m2_execucoes_ingestao` (última calibração concluída → `atualizado_em`; saúde) e `m2_cobertura_bairros` (saúde).

| Ferramenta | Tabelas / funções |
|---|---|
| `buscar_predio` | `m2_buscar_predio_por_endereco()` (`m2_predios`, `m2_bairros`) |
| `ficha_predio` | `m2_predios` + `m2_bairros`, `m2_plantas` |
| `vendas_predio` | `m2_vendas_consolidadas` + `m2_unidades` |
| `m2_bairro` | `m2_mediana_bairro()` (`m2_vendas_consolidadas`, `m2_predios`, `m2_bairros`, `m2_plantas`), `m2_bairros`, `m2_cobertura_bairros` |
| `comparaveis` | `m2_predios`, `m2_plantas`, `m2_vendas_consolidadas` + `m2_predios` + `m2_unidades` |

### 4.4 Rotina → tabelas

| Rotina | Lê | Grava |
|---|---|---|
| `ingestao-iptu` | `m2_bairros`, `m2_plantas`, `m2_execucoes_ingestao`; arquivo local, URL ou armazém de brutos | `m2_predios`, `m2_plantas`, `m2_unidades`, `m2_execucoes_ingestao`; bruto `iptu/<ano>.zip\|csv` |
| `ingestao-itbi` | página da Fazenda, `m2_execucoes_ingestao`, `m2_bairros`, `m2_unidades_por_sql()` | `m2_transacoes`, `m2_itbi_substituir_ano()` (`m2_transacoes`, `m2_vendas_consolidadas`, `m2_execucoes_ingestao`); bruto `itbi/<ano>.xlsx` |
| `coleta-anuncios` | `m2_vendas_consolidadas`, `m2_plantas`, `m2_predios`, `m2_bairros`, `m2_fatores_referencia`, `m2_anuncios`, `m2_buscar_predio_por_endereco()`; Firecrawl | `m2_predios` (`prioridade_coleta` via `m2_atualizar_prioridades`, `ultima_coleta_em`), `m2_anuncios` |
| `coleta-leiloes` | `m2_transacoes`, `m2_plantas`, `m2_predios`, `m2_unidades`, `m2_editais_leilao`, `m2_buscar_predio_por_endereco()`; Firecrawl; Claude API | `m2_editais_leilao`, `m2_predios.ultima_coleta_leilao_em` |
| `calibracao` | `m2_transacoes`, `m2_unidades`, `m2_plantas`, `m2_predios`, `m2_fatores_referencia`, `m2_anuncios`, `m2_editais_leilao`, `m2_vendas_consolidadas`, `m2_bairros` | `m2_transacoes` (ligação), `m2_anuncios` (recasamento), `m2_plantas` + `m2_calibracoes`, `m2_predios.fator_predio`, `m2_fatores_referencia`, `m2_vendas_consolidadas`, `m2_cobertura_bairros` |
| `vigia` | `m2_execucoes_ingestao`, `m2_cobertura_bairros`, `m2_buscar_predio_por_endereco()` | nada |

Todas as rotinas (menos a `vigia`) gravam a própria linha em `m2_execucoes_ingestao`.

---

## 5. Lógica das funcionalidades

### 5.1 Acesso ao painel (seção 6.1)
- **Proxy** (`src/proxy.ts`, a antiga middleware do Next 16): em toda requisição renova a sessão do Supabase, menos estáticos, `/api/mcp`, `/mcp`, `/.well-known/*`, `/oauth/*`, `/api/auth/google*`, `/privacidade` e `/termos` (o MCP e o fluxo do cliente não usam a sessão do painel). Sem usuário: rotas `/api/*` recebem **401** `{"erro":"Sessão expirada. Entre de novo."}`; telas vão para `/login`. Rotas públicas: `/login`, `/esqueci-senha`, `/redefinir-senha`, `/auth/confirmar`, `/auth/sair`.
- **Layout do painel**: a cada requisição faz `getUser()` e lê a própria linha em `m2_perfis`. Decisão (`accessDecision`): sem sessão → `/login`; falha ao ler o perfil → estado de erro, **sem desconectar**; sem perfil admin ativo → `/auth/sair?erro=sem-perfil`, que encerra a sessão e mostra no login "Acesso não autorizado. Fale com o administrador do Fechou por Quanto."; admin → menu lateral (grupos Base, Qualidade, Operação; rodapé com e-mail, "Sair" e selo dev/prod).
- **Rotas e server actions** de escrita chamam `requireAdmin()`: 401 sem sessão, 403 sem perfil, 500 se a leitura do perfil falhar.
- **Estados comuns**: cada tela tem `loading.tsx` (esqueleto) e `error.tsx` ("Não foi possível carregar esta tela.", o código do erro e "Tentar de novo"); há também `app/error.tsx` na raiz.

### 5.2 Login e senha
- **Entrar**: exige e-mail e senha ("Informe e-mail e senha."); erro do Auth → "E-mail ou senha inválidos." (o e-mail continua no campo); sucesso → Visão geral. Não existe autocadastro no painel (`enable_signup = false` no Auth). O cadastro aberto do 8.10 é só de contas de cliente MCP, fora do Supabase Auth (seção 5.9).
- **Esqueci a senha**: exige e-mail; chama `resetPasswordForEmail` com retorno em `/auth/confirmar?proximo=/redefinir-senha`; responde sempre "Se o e-mail estiver cadastrado, você vai receber um link para criar uma senha nova."
- **`/auth/confirmar`**: troca `token_hash` (ou `code` PKCE) por sessão e segue para `proximo` (só caminho interno); link inválido → `/esqueci-senha`.
- **Redefinir**: senha com pelo menos 8 caracteres e confirmação igual; erro → "Não foi possível trocar a senha. Peça um link novo."; sucesso → Visão geral.

### 5.3 Visão geral
Faixa com as 5 rotinas (ITBI, IPTU, Coleta de anúncios, Coleta de leilões, Calibração): data/hora da última execução (fim ou início) e o status, em vermelho se `falhou`; "nunca executada" se não houver. Abaixo, um card por bairro com a última foto de cobertura: % de cobertura em destaque, vendas em 24 meses e barra empilhada por selo com legenda. Sem nenhuma foto: "Nenhuma calibração concluída ainda."

### 5.4 Prédios
Formulário GET (funciona sem JavaScript) com bairro, selo (pior selo), "só com revisão pendente" e busca (até 200 caracteres); filtros e página ficam na URL. Valores inválidos viram "sem filtro". Chama `m2_listar_predios` com janela de 24 meses (`COBERTURA_JANELA_MESES`) e 50 por página. A linha abre a ficha. Vazio: "Nenhum prédio com esses filtros." A busca é por "contém" sobre o texto normalizado (não por similaridade).

### 5.5 Ficha do prédio
- id que não é uuid ou prédio inexistente → "Prédio não encontrado."
- Cabeçalho: endereço (e "também nº …" dos outros `numeros_imovel`), bairro, ano, pavimentos, padrão, unidades, "Vagas com cadastro próprio: sim/não", fator do prédio.
- `?aba=` abre a aba (plantas, vendas, anuncios, editais, historico).
- **Plantas**: área IPTU, área privativa (com ±faixa quando estimada), fator, selo (Confirmada mostra "revisão" ou "edital"), vagas inclusas, quartos, unidades, observações (especial, motivo da revisão). Ações:
  - **Confirmar área**: painel lateral com área privativa, vagas inclusas e observação, e as evidências da planta (anúncios casados à planta e editais casados a unidades dela, com área e link). O botão só habilita com área > 0 e observação (`canConfirm`). A action valida de novo ("Escreva a observação.", "Informe a área privativa.") e chama `m2_confirmar_area_planta`.
  - **Marcar/Desmarcar especial**: `m2_marcar_planta_especial`.
- **Vendas**: período 12/24/36 meses, 5 anos ou todas (padrão 24). Lista data, unidade, total, apartamento, vagas (valor e quantidade), área privativa, selo, m² privativo, m² IPTU e fora da curva, com o botão **Marcar/Desmarcar** (`m2_marcar_outlier`). Resumo: mediana do m² privativo das vendas com m² e não fora da curva, "n de N vendas", e a distribuição por selo dessas vendas (princípio 1). Vazio: "Nenhuma venda registrada neste prédio no período."
- **Anúncios**: domínio com link externo, áreas, atributos, status. Ações: **trocar a planta** (lista das plantas, ou "Só o prédio") e **Descartar** (com confirmação), via `m2_casar_anuncio`. Vazio: "Nenhum anúncio casado com este prédio."
- **Editais**: link da página e do PDF, complemento, matrícula, áreas, vagas, valor, data, status. Ações: **trocar a unidade** (apartamentos do prédio, ou "Só o prédio") e **Descartar**, via `m2_casar_edital`. Vazio: "Nenhum edital de leilão casado com este prédio."
- **Histórico**: as linhas de `m2_calibracoes` de todas as plantas, da mais recente. Vazio: "Nenhuma calibração registrada neste prédio."
- Erros das ações aparecem ao lado do botão: 42501 → "Acesso negado."; 22023 → a mensagem da função; P0002 → "Registro não encontrado."; outro → "Não foi possível salvar. Tente de novo." Depois de cada ação, a ficha, `/revisao`, `/evidencias` e `/predios` são revalidadas.

### 5.6 Qualidade
- **Fila de revisão**: filtros bairro e motivo. Grupos por motivo, cada um com a contagem total e até 20 itens (o filtro de motivo pagina o grupo), ordenados pelas vendas do prédio em 24 meses. Cada item traz o resumo das evidências montado no painel (ex.: "planta de 132 m²: anúncios com 94 e 107 m²; fator … × prédio …"; para venda: "venda de <data> (<unidade>): R$ …, R$ …/m²") e "Abrir ficha" na aba certa (plantas, ou vendas com período "todas"). Vazio: "Nada para revisar agora."
- **Evidências sem vínculo**: abas Anúncios (`ambiguo`, `sem_predio`) e Editais (`sem_predio`, `casado_predio`), até 200 linhas, filtros por domínio e status. **Vincular** abre um painel: busca o prédio por endereço (`m2_buscar_predio_por_endereco`, mínimo 3 caracteres), escolhe a planta ou a unidade (ou "Só o prédio") e chama `m2_casar_anuncio`/`m2_casar_edital`. **Descartar** chama a mesma função com prédio nulo. Vazio: "Nenhuma evidência sem vínculo com esses filtros."

### 5.7 Operação
- **Execuções**: selo de saúde por rotina (`loadHealth` → `avaliarSaude`, o mesmo da `vigia`: ok, atrasada, falhou, travada, volume anômalo, nunca executada, com o motivo) e botão **Executar agora**, que chama `POST /api/execucoes/disparar` e mostra "Pedido enviado ao GitHub. A execução aparece aqui quando começar." ou o erro. Lista as últimas 50 execuções (filtros rotina e status) com início, rotina, referência, status, lidas, gravadas, descartadas, duração e erro. Vazio: "Nenhuma execução com esses filtros." O disparo roda no GitHub Actions, contra o banco configurado lá (BANCO DE TESTE).
- **Chaves de API**: criar (nome 3–60; a chave de 32 bytes em base64url aparece uma vez com "Copie a chave agora. Ela não será mostrada de novo."), lista com nome, prefixo, criada em, último uso e situação, e **Revogar** (com confirmação). O banco guarda só o hash SHA-256. Vazio: "Nenhuma chave criada ainda."
  - **Contas conectadas** (8.10), na mesma tela: e-mail, criada em, último uso, chamadas em 24 h, conexões (tokens não revogados), situação (Ativa ou Bloqueada) e **Bloquear/Desbloquear**. Bloquear pede confirmação ("Bloquear esta conta? Os assistentes conectados por ela deixam de acessar o MCP."); desbloquear não. 50 contas por página (`?pagina=`), com "Anterior", "Próxima" e o total. Vazio: "Nenhuma conta conectada ainda." Erro da ação aparece ao lado do botão.

### 5.8 Servidor MCP (seções 6.3 e 13.2)
- Endereços: `/api/mcp` e `/mcp` (rewrite). Biblioteca `mcp-handler` 2.x, stateless; nome do servidor "Fechou por Quanto"; ferramentas com `readOnlyHint`.
- **Autenticação** (`src/server/mcp/auth.ts`): `Authorization: Bearer <credencial>`, com dois tipos:
  - começa com `fpq_mcp_` → token OAuth: `m2_usa_token_mcp` confere o token, aplica a regra 11.22 (30 por minuto, 1.000 em 24 h), conta a chamada e grava `ultimo_uso_em`. No limite: **429** `{"erro":"Limite de uso atingido. Tente de novo em N segundos."}` ("N minutos" a partir de 120 s) com `Retry-After`;
  - qualquer outro valor → chave do painel: o SHA-256 precisa existir em `m2_chaves_api` com `ativa = true`; sem limite; `ultimo_uso_em` gravado com `after()` (depois da resposta).
  - Sem credencial, credencial desconhecida, token revogado ou conta bloqueada: **401** `{"erro":"Chave de API inválida ou revogada."}` com `WWW-Authenticate: Bearer realm="fechouporquanto", resource_metadata="<site>/.well-known/oauth-protected-resource"`. É esse cabeçalho que faz o cliente MCP abrir o OAuth sozinho. O 401 e o 429 levam os cabeçalhos CORS (`expose-headers: www-authenticate`).
- **Toda resposta** traz `fonte` ("ITBI Prefeitura de SP + IPTU GeoSampa + calibração Fechou por Quanto"), `atualizado_em` (fim da última `calibracao` concluída), `dados_desatualizados` e `motivo_desatualizacao` (O5: `loadHealth`, guardado 5 minutos por instância). Os valores de selo saem com os rótulos da seção 15 em `selo`, `selo_area` e nas chaves de `distribuicao_selos`.
- **Ferramentas**:

| Ferramenta | Entrada | Lógica | Mensagens |
|---|---|---|---|
| `buscar_predio` | `endereco` 3–200 | `m2_buscar_predio_por_endereco` com os padrões (0,4 e 5). Devolve `predio_id, endereco, bairro, ano_construcao, total_unidades, similaridade` | Vazio: "Este endereço não está na base do Fechou por Quanto, que hoje cobre …" |
| `ficha_predio` | `predio_id` uuid | Prédio (endereço, `numeros_imovel`, bairro, ano, pavimentos, padrão, total de unidades, `vagas_cadastro_proprio`, `fator_predio`) e plantas (`area_iptu, area_privativa, fator, selo, fonte_area, faixa_erro_pct, vagas_inclusas, quartos, qtd_unidades, especial`) | "Prédio não encontrado." |
| `vendas_predio` | `predio_id`, `meses` 1–120 (36) | Vendas consolidadas da janela, da mais recente (`data, unidade, valor_total, valor_apartamento, valor_vagas, area_privativa, selo_area, m2_privativo, m2_iptu, vagas_inclusas_area, fora_da_curva`), e `mediana` pela 11.17 calculada no app (`medianSummary`: sem fora da curva, com m², selo ≥ estimada; percentil linear; n, `distribuicao_selos`, `com_vagas_inclusas`) | Sem vendas: "Nenhuma venda registrada neste prédio no período. Use a ferramenta comparaveis para ver vendas parecidas no bairro." |
| `m2_bairro` | `bairro` (enum dos 10 slugs), `meses` 1–60 (24), `quartos` opcional | `m2_mediana_bairro` (11.17 no banco) + `pct_cobertura` da última foto do bairro. Devolve `bairro, mediana_m2_privativo, p25, p75, n_vendas, distribuicao_selos, com_vagas_inclusas, pct_cobertura, meses, quartos` | Slug sem linha: mensagem "fora da cobertura" |
| `comparaveis` | `predio_id`, `area_privativa` opcional, `meses` 1–120 (24), `limite` 1–30 (10) | Área de referência: a informada, ou a área privativa da planta com mais unidades que tenha área. Lê as vendas do mesmo bairro na janela com área ±20%; filtra década de construção ±1 (sem ano do prédio, não filtra), **exclui o próprio prédio**, ordena mesma rua primeiro e depois as mais recentes. Devolve `area_referencia`, `origem_area_referencia` (`informada`/`planta_mais_comum`), as vendas (com `predio_id`, `endereco`, `ano_construcao`) e a mediana | "Prédio não encontrado."; sem área: "O prédio ainda não tem área privativa em nenhuma planta. Informe area_privativa." |

- Falhas de leitura do banco lançam erro (não viram nulo em silêncio). Leituras de vendas são paginadas em 1.000.

### 5.9 OAuth do MCP e contas de cliente (seções 6.3 e 6.5; regras 11.21 e 11.22; épico 8.10)
Código em `src/server/oauth/` (servidor de autorização, pedido, contas e mensagens) e `src/server/auth/` (Google e cookies). Todos os endereços vêm de `NEXT_PUBLIC_SITE_URL`, nunca do Host da requisição. Limiares em `regras.ts` (seção "Épico 8.10").

Fluxo de quem cola `https://fechouporquanto.com.br/mcp` num assistente:
1. **Descoberta.** O assistente chama o MCP sem credencial e recebe o 401 com `resource_metadata`. Lê os metadados do recurso (RFC 9728) e do servidor de autorização (RFC 8414).
2. **Registro** (RFC 7591). `POST /oauth/registrar` cria o app em `m2_oauth_clientes`. Freio: 200 registros por hora; apps sem uso há 30 dias são apagados no registro seguinte.
3. **Autorização.** O assistente abre `/oauth/autorizar` com `response_type=code`, `client_id`, `redirect_uri`, `code_challenge` (S256) e `state`. A tela confere: app existe e o `redirect_uri` é exatamente um dos registrados; `response_type = code`; método S256 e desafio de 43 caracteres. Pedido inválido mostra "Pedido de conexão inválido" / "Volte ao seu assistente e comece a conexão de novo." e **nunca redireciona** (não vira redirecionador aberto).
4. **Login com Google**, se não há sessão de cliente. `/oauth/entrar` mostra "Conectar ao Fechou por Quanto" e o botão "Entrar com Google". `GET /api/auth/google` gera `state` e PKCE e vai ao Google com escopos `openid email` e `prompt=select_account`. No retorno, o callback confere o `state`, troca o código (até 5 s), valida o `id_token` com `jose` (assinatura pelas chaves públicas do Google, `aud` = `GOOGLE_CLIENT_ID`, `iss`, validade e `email_verified = true`) e chama `m2_entra_cliente`:
   - conta nova acima de 50 nas últimas 24 h → "Os cadastros novos estão pausados por hoje. Tente de novo amanhã." (11.21);
   - conta bloqueada → "Esta conta está bloqueada. Fale com o administrador do Fechou por Quanto.";
   - qualquer outra falha → "Não foi possível entrar com o Google. Tente de novo.";
   - sucesso → cookie `m2_cliente` (JWT HS256 com `SESSION_SECRET` de pelo menos 32 caracteres, HttpOnly, SameSite=Lax, Secure em produção, 30 dias) e volta para a autorização. O log não registra e-mail nem token.
5. **Consentimento.** Título "<app> quer acessar o Fechou por Quanto", o que poderá e o que não poderá fazer (textos da seção 15), o host de volta (o nome do app pode mentir; o endereço não), "Conectando como <e-mail>" com "Usar outra conta", e os botões Cancelar e Permitir.
6. **Decisão.** `POST /oauth/autorizar/decidir` exige `Origin` do próprio site e a sessão de cliente, e confere o pedido de novo. Cancelar volta com `error=access_denied`. Permitir grava o código (10 min, só o hash) e volta com `code` e `state` (303).
7. **Token.** `POST /oauth/token` troca o código por `fpq_mcp_` + 32 bytes em base64url, de forma atômica. Só o hash e o prefixo ficam no banco. Sem `expires_in` e sem refresh token. Código reapresentado revoga o token que ele gerou e responde `invalid_grant`.
8. **Uso.** Cada chamada ao MCP passa por `m2_usa_token_mcp` (seção 5.8). A recusa por limite não conta como chamada.

Bloqueio: o admin bloqueia a conta na tela Chaves de API. A partir daí a conta não entra, não autoriza, não troca código e seus tokens recebem 401 na hora. As páginas `/privacidade` e `/termos` dizem que remover o conector no assistente não cancela o acesso: o cancelamento é pedido por e-mail e o admin bloqueia a conta.

Testes: Vitest em `src/server/oauth/oauth.test.ts` (redirect_uri, S256, pedido de autorização, metadados, rota de token, `id_token` com chaves locais, cookie adulterado) e `src/server/mcp/handler.test.ts` (sem credencial, token ativo, token revogado ou de conta bloqueada, limite, chave do painel); pgTAP `130_oauth`; `scripts/test-oauth.mjs` contra um deploy (descoberta, registro, autorização sem sessão, token inválido). O login com Google não é automatizável.

### 5.10 Execução comum das rotinas (seção 12; O1)
- CLI: `npm run ingestao -- <rotina> [args]`. Aceita os nomes da 4.4 e os curtos `itbi`, `iptu`, `anuncios`, `leiloes`; e `vigia`. Nome inválido → "Rotina inválida: … Use uma de: …" e código 1.
- `runRoutine`: antes de abrir, marca `falhou` com "tempo esgotado" toda execução `em_andamento` iniciada há mais de 6 h; abre a linha `em_andamento`; ao terminar grava `concluida` com contagens, referência, URL, hash e caminho do bruto; em erro grava `falhou` com a mensagem e relança, e o processo sai com código 1 (o GitHub Actions manda e-mail).
- `withRetry`: repete só erros passageiros (timeout, deadlock, conexão, 502/503/504) com esperas de 1, 5 e 15 s, e só em operações idempotentes. Leituras grandes são paginadas em 1.000 (max_rows do PostgREST).
- Significado das contagens:

| Rotina | `linhas_lidas` | `linhas_gravadas` | `linhas_descartadas` |
|---|---|---|---|
| ingestao-iptu | linhas do CSV | unidades gravadas | lidas − unidades (inclui as fora dos CEPs) |
| ingestao-itbi | linhas das abas mensais (0 em "sem mudança") | guias novas inseridas | lidas − guias com bairro |
| calibracao | guias de compra e venda ligadas a unidade | vendas consolidadas | guias que não viraram venda nem vaga agregada |
| coleta-anuncios / coleta-leiloes | páginas raspadas | anúncios / editais gravados | fora da allowlist, sem área/"outro", ou mantidos por `casado_manual` |

### 5.11 `ingestao-iptu` (épico 8.2)
1. **Arquivo**, nesta ordem: `--arquivo` local (caminho padrão, carga anual manual); `IPTU_ARQUIVO_URL` (resposta HTML ou erro → falha com a orientação de baixar no navegador e rodar `--arquivo`, sem cair para o armazém); senão `iptu/<ano>.zip` ou `.csv` no armazém de brutos. Nada encontrado → falha "Arquivo do IPTU <ano> não encontrado…".
2. **Bruto**: guardado em `iptu/<ano>.<ext>`; a versão anterior vira `iptu/<ano>.anterior.<ext>`; mesmo hash não regrava.
3. **Leitura** em stream (`csv-parse`, `;`, UTF-8, ZIP lido sem extrair). Só as 14 colunas da allowlist (`iptu/colunas.ts`); coluna obrigatória faltando → falha listando as ausentes. Linhas fora dos prefixos de CEP dos bairros ativos são descartadas antes de acumular; SQL sem 11 dígitos ou área ilegível são inválidas.
4. **Montagem** (funções puras):
   - 11.3: uso começando com "APARTAMENTO EM CONDOMINIO" → apartamento; contendo "GARAGEM" → vaga; resto → outro.
   - 11.4: agrupa por setor, quadra e número de condomínio (vazio ou só zeros → descartado); grupo com menos de 4 apartamentos → descartado.
   - **Bairro do prédio** (lógica da 11.2 adaptada): campo bairro casando com os padrões de um bairro cujo prefixo casa com o CEP, pela maioria das unidades (empate → indefinido); senão voto por CEP de 8 dígitos entre prédios resolvidos pelo campo (≥ 60% e ≥ 2 votos, com prefixo); senão voto por setor+quadra. Indecidível → descartado.
   - 11.6: `vagas_cadastro_proprio` se há unidade vaga.
   - 11.7: ordena os apartamentos por área e abre planta nova quando a área se afasta mais de 3% da mediana da planta corrente; `area_iptu_referencia` = mediana. Andar: número do complemento com até 4 dígitos; tira 1 dígito se o número tem até 2 dígitos e 2 se tem 3 ou mais ("APTO 72" → 7, "AP 24" → 2, "APTO 1201" → 12).
   - Atributos do prédio: logradouro normalizado (11.5) e número mais frequentes; todos os números em `numeros_imovel`; CEP, ano e padrão mais frequentes; maior número de pavimentos.
   - Os descartes saem no log por motivo.
5. **Gravação** idempotente em lotes de 500 com retry: upsert de `m2_predios` por `chave_predio`; cada planta nova casa com a planta existente do prédio mais próxima a até 3% (atribuição gulosa), preservando área, selo e confirmação; planta `confirmada` + `revisao_manual` recebe as unidades mas não é regravada (11.11); grupos sem par viram plantas novas; plantas antigas sem par não são apagadas; upsert de `m2_unidades` por `sql`.

### 5.12 `ingestao-itbi` (épico 8.3)
1. **Planilhas**: com `--arquivo`, o arquivo local; sem ele, lê `ITBI_PAGINA_URL`, extrai todos os links `.xlsx` e baixa cada um (User-Agent de navegador). Página fora do ar, sem links ou download HTML/≠ 200 → falha. O **ano** vem das abas `MMM-AAAA` (o nome do arquivo não diz o ano); abas de anos diferentes → falha. Só anos ≥ 2021; um argumento de ano restringe a ele.
2. **Uma execução por ano**. Falha num ano registra `falhou` nele, segue para os outros e no fim relança o primeiro erro.
3. **Sem mudança**: hash igual ao da última execução `concluida` do ano → conclui com 0 lidas/0 gravadas, sem regravar o bruto e sem substituir a anterior.
4. **Leitura** pelo leitor próprio `shared/xlsx.ts` (não o streaming do exceljs). Só abas mensais; colunas pelo **nome** normalizado do cabeçalho com sinônimos (19 campos usados; as demais ignoradas, inclusive repetidas); aba sem cabeçalho usa o de outra aba mensal compatível. SQL e CEP preenchidos com zeros; data serial do Excel convertida; matrícula só dígitos; proporção % → fração.
5. **Regras por guia**: `hash_linha` (11.1, todos os valores originais da linha, em ordem, unidos por `|`); `eh_compra_venda` (natureza "1."); 11.14 (fração ≥ 1 ou nula e complemento casando a regex).
6. **Bairro (11.2)**: (1) campo casando com os padrões de exatamente um bairro → `campo`; (2) SQL no IPTU → bairro do prédio → `iptu`; (3) voto por CEP de 8 dígitos entre as guias do ano resolvidas em 1–2 (≥ 60%, ≥ 2) → `cep`; (4) voto por setor+quadra → `quadra`. O CEP da guia precisa começar com um prefixo do bairro escolhido; senão a guia é descartada. Descartes por motivo e resumo por origem vão para o log.
7. **Gravação**: insert em lotes de 1.000 com `on conflict (hash_linha) do nothing` (guias idênticas na mesma planilha entram uma vez); `unidade_id`/`predio_id` pelo SQL (`m2_unidades_por_sql` em lotes de 1.000). Ao fim, `m2_itbi_substituir_ano` (11.1). Se algo falhou antes, a substituição não roda.
8. **Saída para o Actions**: grava `calibrar=true|false` no `GITHUB_OUTPUT` (verdadeiro se algum ano leu linhas), e o workflow só calibra se mudou (9.2).

### 5.13 `calibracao` (épicos 8.4 e 8.6)
Ordem:
1. **Ligação tardia** (`m2_ligar_transacoes_unidades`, 9.2).
2. **Recasamento dos anúncios** `casado_predio`/`ambiguo` não manuais com a função da 11.8, usando o `fator_predio` ou o fator de referência **gravados pela execução anterior**; grava só o que mudou.
3. **Selos das plantas** (`selos.ts`, puro; regras 11.9 a 11.12). Planta `confirmada` + `revisao_manual` fica intocada (e o SQL também barra).
   - Evidências de anúncio: anúncios `casado_planta` com área; página de condomínio com faixa num prédio de 2 plantas dá o mínimo à menor e o máximo à maior.
   - Anúncios: 1 evidência → `indicativa`; ≥ 2 a até 3% da mediana de todas → `calibrada` com a mediana das concordantes; senão ≥ 2 a até 8% → `indicativa`; senão "divergente" (sem área, revisão `anuncios_divergentes`). Fonte `anuncio` se alguma evidência é anúncio, senão `pagina_condominio`.
   - Editais `casado_unidade` com área: um, ou vários que concordam a 3% → `confirmada`, fonte `edital_leilao`, área = mediana (vale mesmo contra os anúncios); edital a mais de 5% da área dos anúncios → revisão `edital_divergente`, mantendo a área do edital; vários que discordam → não confirma e revisão `edital_divergente`.
   - `quartos` = mediana dos anúncios; `vagas_inclusas` = 0 se o prédio tem vaga própria, senão vagas do edital vinculadas à área, senão mediana dos anúncios, senão nulo.
   - Especial (11.12): a planta de maior área IPTU com ≤ 2 unidades e ≥ 1,4 × a seguinte vira `especial`; o pipeline só marca, nunca desmarca; a revisão `planta_especial` abre quando a planta passa a especial e fica até o admin resolver.
   - **Fatores de referência (11.10)** sobre plantas `calibrada`/`confirmada` não especiais: grupos (bairro, década, vaga própria), (década, vaga própria) e (vaga própria); só ≥ 8 plantas; p25/p75 lineares.
   - **Estimadas**: sem evidência → área = área IPTU × fator do grupo mais específico disponível, selo `estimada`, fonte `fator_referencia`, `faixa_erro_pct = (p75 − p25)/mediana × 100 / 2`; sem grupo → `sem_dado` com área nula.
   - **`fator_predio`** = mediana dos fatores ≥ indicativa; com ≥ 2 dessas plantas, fator a mais de 10% → `fator_incoerente`.
   - Um motivo por planta: `edital_divergente` > `fator_incoerente` > `anuncios_divergentes` > `planta_especial`.
   - Gravação em lotes de 500 por `m2_aplicar_calibracao_plantas` (+ histórico quando área, fator, selo ou fonte mudam), `m2_atualizar_fator_predio`, `m2_substituir_fatores_referencia`.
4. **Vendas consolidadas** (8.4), já com as áreas novas: guias de compra e venda com unidade, fora as da 11.14; por prédio e data, cada apartamento recebe guias de vaga do mesmo prédio e dia (11.15), até 3, distribuídas pela menor diferença de matrícula (sem matrícula vai para o fim; vaga sem apartamento e unidade "outro" ficam fora); campos de valor, área, selo, `m2_privativo` e `m2_iptu` como na seção 1.
   - **Fora da curva (11.16)**: venda marcada pelo admin mantém o valor dele; `valor_apartamento < 0,5 × valor_venal_referencia` → fora; com m², a referência é a mediana do prédio se ele tem ≥ 3 vendas com m² na janela de 36 meses que termina na data da venda, senão a do bairro no mesmo selo; **a própria venda não entra**; fora se < 0,6 × ou > 1,6 × a referência.
   - Upsert por `transacao_apartamento_id` (sem enviar `marcado_manual`) e `m2_vendas_remover_obsoletas`.
5. **Cobertura**: uma linha por bairro em `m2_cobertura_bairros` com as vendas dos últimos 24 meses por selo e `pct_cobertura` (sem indicativa). Inserção sem retry (não é idempotente).

### 5.14 `coleta-anuncios` (épico 8.5)
1. **Prioridade (11.13)**: recalcula `prioridade_coleta` de todos os prédios = vendas consolidadas dos últimos 24 meses × peso do pior selo (sem_dado 4, estimada 3, indicativa 2, calibrada/confirmada 0); escolhe até 150 com prioridade > 0 e `ultima_coleta_em` nula ou com mais de 90 dias. `--predio <chave>` força um prédio.
2. **Busca** Firecrawl v2: `"<logradouro sem o tipo>, <número>" <bairro> São Paulo` com `site:` dos 3 domínios, até 5 resultados.
3. Só URLs cujo host é um domínio da allowlist ou subdomínio; outras nunca são raspadas.
4. **Scrape** com o schema da 13.3 e o markdown da página; allowlist positiva de campos; "null" vira nulo; `outro` ou sem área → não grava. `checkTotalArea`: se a área extraída é igual a uma "área total" do texto e diferente de toda área útil/privativa, troca pela útil; se só há área total, descarta.
5. **Casamento (11.8)**: prédio por `m2_buscar_predio_por_endereco("<logradouro>, <número>", 0,6, 1)` (confiança = similaridade) ou pelo nome do condomínio igual ao de outra página já casada no mesmo número; planta: prédio de planta única → direto; faixa com 2 plantas → menor planta; área ÷ fator (prédio ou referência) com plantas a até 12%: uma → `casado_planta`, várias → `ambiguo`, nenhuma ou sem fator → `casado_predio`; sem prédio → `sem_predio`.
6. **Gravação**: upsert por `url`, exceto anúncio com `casado_manual` (não é tocado; se a leitura disso falhar, erro em vez de gravar às cegas).
7. Ao fim do prédio, `ultima_coleta_em = agora`.
- **Limites e erros**: teto de créditos (`FIRECRAWL_MAX_CREDITOS_EXECUCAO`, padrão 100 no código): antes de cada chamada, se o custo previsto (busca 2, scrape 5) passa do teto, a rodada para e **conclui**, com "créditos usados: N de T (parou no teto)" no log. 429/5xx: 3 tentativas com 10, 30 e 90 s; depois o prédio é pulado **sem** atualizar `ultima_coleta_em`.

### 5.15 `coleta-leiloes` (épico 8.5.1)
1. **Alvos (11.19)**: (a) prédios com guia de natureza "4." ou "17." nos últimos 36 meses, da mais recente; (b) os 100 de maior prioridade sem planta `confirmada`; o filtro de `ultima_coleta_leilao_em` (nula ou > 180 dias) vem **antes** do corte dos 100; teto `LEILAO_MAX_ALVOS_EXECUCAO` (100).
2. **Busca**: `"<logradouro sem o tipo>, <número>" leilão São Paulo` com `site:` da allowlist (`LEILAO_DOMINIOS` ou a lista A10), até 3 resultados; só domínios da lista são raspados.
3. **Página do lote** com o schema 13.3 estendido; não sendo lote de leilão → descartada.
4. **PDF** (só se a página não trouxe área privativa e o link é da allowlist): baixado para memória (tem de começar com `%PDF` e ter até 23 MB), lido pela Claude API (`claude-sonnet-5`, schema da 13.4), filtrado pela allowlist e descartado. Teto `CLAUDE_MAX_DOCUMENTOS_EXECUCAO` (150). O documento prevalece e a página completa; área total menor que a privativa vira nula. PDF que não baixa, ou erro permanente (4xx exceto 408/409/429) da Claude API → ignora o PDF; erro transitório → pula o alvo.
5. Sem nenhuma área → não grava.
6. **Casamento (11.20)**: prédio pelo endereço (critério da 11.8); unidade por (1) matrícula de guia do ITBI de uma única unidade do prédio, (2) chave do complemento ("AP <n>" + " BL <b>") igual à de exatamente uma unidade, (3) senão `casado_predio`; sem prédio → `sem_predio`.
7. Upsert por `url`, exceto `casado_manual`; `ultima_coleta_leilao_em` atualizado ao fim do alvo; alvo pulado por erro de API não atualiza. Nada é escrito em disco nem no Storage.

### 5.16 `vigia` (O3) e saúde (O2)
`avaliarSaude` por rotina, nesta ordem: **travada** (em andamento > 6 h) → **falhou** (a última terminada falhou) → **nunca_executada** → **atrasada** (sem concluída há mais de 35 dias no ITBI, 400 no IPTU, 8 nas coletas e na calibração) → **volume_anomalo** (a última concluída com mudança gravou menos de 50% da mediana das 3 anteriores da mesma referência; "sem mudança" do ITBI não conta) → ok. Também alerta queda de cobertura de mais de 5 pontos entre as duas fotos mais recentes de um bairro. A `vigia` imprime o relatório, faz a sonda `m2_buscar_predio_por_endereco('Rua Joaquim Antunes, 577')` e sai com 1 se houver qualquer problema. Não grava execução.

### 5.17 Automações (`.github/workflows/`)
Todos com Node 22, `npm ci`, `concurrency` por rotina, `permissions: contents: read` e segredos/variáveis do repositório.

| Workflow | Quando | Passos |
|---|---|---|
| `ingestao-itbi.yml` | dia 8, 09:10 UTC (06:10 BRT), e manual | `ingestao -- itbi` sem ano: todas as planilhas da página, a partir de 2021 (brutos no R2); `calibracao` só se `calibrar == 'true'` |
| `ingestao-iptu.yml` | **só manual**, input `ano` opcional (vazio = ano corrente, passado por `env`) | `ingestao -- iptu <ano>` lendo `iptu/<ano>.zip` do R2; depois `calibracao` |
| `coleta-anuncios.yml` | segunda 08:40 UTC (05:40 BRT), e manual | `anuncios` com `FIRECRAWL_MAX_CREDITOS_EXECUCAO` (variável = 50); depois `calibracao` |
| `coleta-leiloes.yml` | quarta 08:40 UTC, e manual | `leiloes`; depois `calibracao` |
| `calibracao.yml` | manual ("Executar agora") | `calibracao` |
| `vigia.yml` | todo dia 10:00 UTC (07:00 BRT), e manual | `ingestao -- vigia` |
| `ci.yml` | push no `main` e PR | typecheck, test, build; job à parte com `supabase start` e `supabase test db` |

---

## 6. Divergências em relação ao spec, decisões e interpretações

Junta tudo o que os planos registraram como decisão do usuário, divergência ou interpretação declarada, épico a épico.

### Geral e 8.0
| Item | Spec | Como ficou | Por quê |
|---|---|---|---|
| Prefixo `m2_` | Objetos sem prefixo (6.4, 7, 11) | Tabelas, enums, funções, triggers, políticas, índices e bucket com `m2_`; colunas e valores de enum como no spec | Decisão do usuário (21/11/2026): o banco remoto é compartilhado com outros apps |
| Nome do produto | "M² Real" até a v1.1 | "Fechou por Quanto" em todo texto visível; identificadores técnicos (`m2-real`, `@m2-real/*`, `m2_`, projetos, variáveis) e as 3 primeiras migrations ficaram com o nome antigo | Spec v1.2 (plano `renomear-produto`): não mexer em banco, deploys e variáveis |
| TypeScript | — | Fixado em `~6.0.3` | O `next build` usa a API JS do compilador, que mudou no TS 7 |
| CLI | Nomes da 4.4 | Aceita também `itbi`, `iptu`, `anuncios`, `leiloes` e o comando `vigia` | Exemplo da 18.5 (`npm run ingestao -- itbi 2025`); `vigia` é acréscimo (O3) |
| Auth | Sem autocadastro (6.1) | `[auth] enable_signup = false`; `[auth.email] enable_signup = true` (o `false` no 8.0 desligava o login por e-mail; corrigido no 8.7) | Bug do 8.0 |
| Supabase local | — | `supabase start -x vector,logflare,realtime,edge-runtime` | Várias stacks na máquina estouravam o health check |
| Workflows e documentação | 8.0 | `.github/workflows` entraram no 8.8; este documento, no encerramento | Sem repositório remoto até o 8.8 |

### 8.1 Banco
| Item | Como ficou | Por quê |
|---|---|---|
| `m2_marcar_planta_especial` | Função extra, SECURITY DEFINER | A matriz da seção 5 e a ficha permitem marcar especial, mas a 6.4 só libera update em plantas por funções, e nenhuma da 7.4 fazia isso |
| `m2_normalizar_endereco` | Função auxiliar fora da 7.4 | A busca da 11.5 precisa dela |
| `m2_buscar_predio_por_endereco` | Parâmetros opcionais `limiar_similaridade` (0,4) e `limite` (5); sem número também exige o limiar; usa `similarity()` e não o operador `%` (o índice trigram não entra no plano) | Limiares em `regras.ts`; evitar devolver 5 prédios quaisquer para "Avenida Paulista"; volume pequeno |
| Índices extras | Em FKs não listadas na 7.3 | Advisor "unindexed foreign keys" |
| Grants | `anon`/`authenticated` só com select nas `m2_*`; `anon` mantém select e recebe 0 linhas pelo RLS | Defesa em profundidade; o critério pede "0 linhas", não "permission denied" |
| `@m2-real/db` | Dois pontos de entrada: tipos (`@m2-real/db`) e cliente de serviço (`@m2-real/db/server`) | Não importar a service role no navegador por engano |
| Políticas de `m2_chaves_api` | Separadas por comando (leitura, inserção, atualização) | Advisor "multiple permissive policies" |

### 8.2 IPTU
| Item | Spec | Como ficou | Por quê |
|---|---|---|---|
| Download e agenda do IPTU | Download automático; cron em 15/02 (4.4) | Carga **manual e anual**: o usuário baixa o ZIP e roda `--arquivo` (ou envia ao armazém); o workflow é só manual, sem cron. `IPTU_ARQUIVO_URL` que falha não cai para o armazém | GeoSampa com desafio anti-robô (não se contorna); evitar falhar todo 15/02 sem arquivo; não esconder a falha |
| Bruto | `iptu/<ano>.csv` | `iptu/<ano>.zip` (o leitor aceita os dois) | CSV de 938 MB × ZIP de 70 MB |
| P3 (um prédio por condomínio) | Pergunta aberta | Condomínio com vários números continua **um** prédio; todos os números em `m2_predios.numeros_imovel` (migration `20261121140000`) e a busca acha por qualquer um | Decisão do usuário |
| Bairro do prédio | A 11.2 só define o bairro das guias | Lógica da 11.2 aplicada ao IPTU: campo (maioria) → voto por CEP → voto por setor+quadra, com o prefixo sempre exigido | Decisão do usuário: o campo bairro do IPTU vem vazio na maioria e os prefixos cobrem bairros vizinhos |
| Andar inferido | "sem os 2 últimos dígitos" | Segue os exemplos do spec (tira 1 dígito em números de até 2 dígitos) e ignora números com mais de 4 dígitos | Os exemplos da 11.7 contradizem o texto; números longos são matrícula/código |
| Plantas entre cargas | — | Casadas por área a até 3%, preservando calibração; confirmada manual não é regravada; plantas sem par não são apagadas | Regra 11.11 e 7.5 |
| Descartes | Motivo registrado | O motivo vai para o **log** da execução, não para tabela; `linhas_descartadas` = lidas − unidades | Não há coluna para isso |
| Formato | Detecção de delimitador/encoding | Fixos `;` e UTF-8, conferidos no arquivo real; mudança falha no cabeçalho | Simplicidade |
| Observabilidade O1–O5 e `vigia` | Não existem no spec | Registro de execução com expiração de 6 h e exit ≠ 0 (O1), `avaliarSaude` (O2), workflow diário `vigia` (O3), selo de saúde na tela Execuções (O4), `dados_desatualizados`/`motivo_desatualizacao` no MCP (O5). A `vigia` não grava execução | Pedido do usuário (21/11/2026): nenhuma carga pode falhar em silêncio |

### 8.3 ITBI
| Item | Como ficou | Por quê |
|---|---|---|
| Ano | Vem das abas, não do nome do arquivo | "GUIAS DE ITBI PAGAS (28012026)" contém 2025 |
| Colunas | Só os 19 campos usados, por nome normalizado com sinônimos; o hash usa todos os valores da linha | Todas as planilhas têm 28 colunas, com cabeçalhos deslocados ("ACC" repetido em 2021/2022/NOV–DEZ-2023) e o erro "pardão" em FEV-2026 |
| Leitor | `shared/xlsx.ts` (yauzl + saxes) no lugar do streaming do exceljs; abas sem cabeçalho usam o de outra aba | 2024 tem `workbook.xml` no fim do zip; JAN e OUT-2024 sem cabeçalho |
| Funções novas | `m2_unidades_por_sql`, `m2_itbi_substituir_ano`, `m2_ligar_transacoes_unidades` (só service role) | Substituição da 11.1 e ligação da 9.2 sem estourar a URL |
| `uso_iptu_guia` | Guarda a descrição, não o código | A 11.3 compara texto |
| `proporcao_transmitida` | Fração, não percentual | 100 não cabe em `numeric(6,4)` |
| "Sem mudança" × seção 12 | Não passa a anterior para `substituida`; pode haver várias `concluida` do mesmo ano. Só uma carga que grava substitui | Rastreabilidade (princípio 5): as guias apontam para quem as carregou |
| Guias de execuções que falharam | Continuam apontando para a execução `falhou` | Seção 12: "as gravações ficam" |
| Vagas de guias apagadas | `m2_itbi_substituir_ano` apaga a venda da guia removida mas não limpa `transacoes_vagas_ids` de outras vendas | Array sem FK; a próxima calibração recalcula tudo |
| `linhas_gravadas` com retry | Pode sair subcontada | O lote já gravado volta como existente no `on conflict` |
| Critério 13.289/11.355 | Lido como guias de **apartamento**; o banco guarda todas as guias dos 10 bairros | Nenhuma outra leitura reproduzia o número |
| Robustez | `withRetry` e lotes de 1.000 SQLs | Timeout de 8 s do PostgREST; max_rows corta em silêncio |

### 8.4 Consolidação
| Item | Como ficou | Por quê |
|---|---|---|
| Enum `calibracao` | Valor novo em `m2_fonte_dado`, só para `m2_execucoes_ingestao.fonte` da rotina `calibracao` | Decisão do usuário: a 7.2 não tinha fonte para essa rotina |
| `m2_vendas_remover_obsoletas` | Função nova (só service role) | Recalcular preservando `marcado_manual` sem limite de URL |
| Janela da 11.16 | 36 meses **terminando na data da venda** | Não misturar preços de épocas distantes |
| Guia sem unidade | Não gera venda | `unidade_id` é obrigatório na 7.2 |
| `linhas_descartadas` | Não conta vagas agregadas | Ajuste depois do verifier |

### 8.5 Anúncios
| Item | Spec | Como ficou | Por quê |
|---|---|---|---|
| Teto do Firecrawl | 600 créditos (17) | **100** no código e no `.env.local` (local); **50** na variável do Actions | Plano grátis (1.000/mês) dividido com otcb e Prelo; ~4 prédios por rodada. O teto não limita consultas do painel/MCP |
| API | — | Firecrawl v2 (`/v2/search`, `/v2/scrape`) | Versão atual |
| Créditos usados | — | No log da execução | Sem coluna em `m2_execucoes_ingestao` |
| Allowlist de domínios | "variável de configuração" | Constante `ANUNCIO_DOMINIOS` em `regras.ts` | Sem variável de ambiente nova fora da 18.4 |
| Nome do condomínio (11.8) | "mesmo endereço" | Mesmo `numero_extraido` de outra página já casada | Interpretação declarada |
| Área total × útil (13.3) | Verificado com página salva | `checkTotalArea` determinístico sobre o markdown; a página de exemplo é **montada** (`fixtures/anuncio-area-total-e-util.md`) | A página real conferida só tinha uma área; não gastar créditos |
| Teto | — | Confere o custo **previsto** antes da chamada; o real pode passar alguns créditos | Ressalva aceita |
| Função nova | — | `m2_atualizar_prioridades` | Upsert parcial exigiria colunas NOT NULL |

### 8.5.1 Leilões
| Item | Como ficou | Por quê |
|---|---|---|
| Modelo | `claude-sonnet-5` | "Modelo Sonnet" da geração atual |
| Fixture do Canário 906 | PDF **gerado em memória** (`shared/pdfTexto.ts`) com o trecho público da página do lote; teste offline com a resposta já filtrada; teste vivo opcional (`RUN_LIVE=1`) | O laudo em PDF não é mais publicado |
| Edital sem prédio | Fica `sem_predio`, não "descartado" | Sem prédio não dá para saber se é de fora dos 10 bairros; assim aparece em "Evidências sem vínculo" |
| Ordem dos filtros da 11.19 | 180 dias antes do corte dos 100 de (b) | A rodada seguinte pega os próximos da fila em vez de ficar vazia |
| Chave da unidade (11.20) | "AP <n>[letra]" + " BL <b>"; sem bloco e número repetido em blocos → `casado_predio`; matrícula de várias unidades passa ao passo 2 | Interpretação declarada |
| PDF + página | O documento prevalece; PDFs lidos em ordem até achar área | — |
| Erros | PDF que não baixa ou erro permanente da Claude API → ignora o PDF; erro transitório → pula o alvo | Não gastar créditos repetindo o mesmo alvo |
| Coerência de áreas | Total menor que a privativa vira nula; o prompt pede só o lote do apartamento | Bug da 1ª rodada real (vaga misturada ao apartamento) |

### 8.6 Calibração
| Item | Como ficou | Por quê |
|---|---|---|
| Mediana da 11.16 | **Sem a própria venda** | Decisão do usuário (22/11/2026) |
| P4 | `indicativa` não entra na cobertura | Decisão do usuário; igual à 7.2 |
| P2 | Sem desconto do valor das vagas; o MCP devolve `vagas_inclusas_area` | Decisão do usuário; regra 11.18 |
| Recasamento | Usa os fatores da execução anterior (sem iterar na mesma execução) | Interpretação declarada |
| Confirmada por edital | Recalculada a cada execução; só a `confirmada` + `revisao_manual` fica travada | Permitir que o admin desfaça um casamento errado de edital |
| Edital × anúncios | Compara com a área `calibrada` **e** `indicativa`; 2+ editais discordantes não confirmam | Interpretação declarada |
| Anúncios divergentes | < 2 concordantes a 8% → sem evidência (estimada) e revisão `anuncios_divergentes` | Interpretação declarada |
| Especial | O pipeline só marca, nunca desmarca; a revisão fica até o admin resolver | Não perder a decisão do admin |
| Um motivo por planta | Prioridade `edital_divergente` > `fator_incoerente` > `anuncios_divergentes` > `planta_especial`; `anuncio_ambiguo` não é gravado em planta | O ambíguo não aponta planta |
| Funções novas | `m2_aplicar_calibracao_plantas` (idempotente na 2ª migration), `m2_atualizar_fator_predio`, `m2_substituir_fatores_referencia`; SECURITY INVOKER (não DEFINER, como dizia o plano) | O cálculo fica no código (7.5); só a service role executa |
| Histórico quando a área é apagada | `fonte` = fonte anterior da planta | `fonte` é obrigatória |
| Cobertura | Gravada sem retry | Inserção não é idempotente |

### 8.7 Painel
| Item | Como ficou | Por quê |
|---|---|---|
| Funções do painel fora da 7.4 | `m2_listar_predios`, `m2_cobertura_atual`, `m2_ultimas_execucoes` (INVOKER, RLS vale) | Leitura paginada e agregada com o RLS |
| Design | Seção 16 e `prompt-design-m2-real.md` (sem telas do Claude Design); shadcn/ui gerado pelo CLI (base-nova), fonte Inter | Decisão do usuário |
| Busca de prédios | "Contém" sobre o texto normalizado + número; não por similaridade | A similaridade da 11.5 fica no MCP |
| Sem cliente Supabase no navegador | Toda leitura é no servidor; a chave anon nem vai ao bundle | Segurança |
| `/auth/sair` | Route handler para desconectar o usuário sem perfil | Server Component não apaga cookies |
| Mediana da ficha | Com a distribuição por selo ao lado | Princípio 1 e 11.17 |
| Porta local | 3010 | 3000 ocupada |
| Menu | Grupos Base, Qualidade e Operação (Qualidade e Operação entraram no 8.8) | Decisão do usuário: mostrar só o que está pronto |

### 8.8 Revisão e operação
| Item | Como ficou | Por quê |
|---|---|---|
| `m2_fila_revisao` fora da 7.4 | Função de leitura, INVOKER | A 7.4 só lista as de escrita |
| BANCO DE TESTE compartilhado | O banco na nuvem é o projeto Supabase **BANCO DE TESTE** (plano grátis, 500 MB), dividido com outros apps (inclusive o Assina); dados copiados do local por REST, sem `m2_perfis`/`m2_chaves_api` nem brutos; migrations aplicadas pelo MCP do Supabase, conferidas por hash e baixadas pelo `pg_net` | Decisão do usuário |
| Brutos no R2 | `shared/brutos.ts` com dois armazéns: Storage do Supabase (padrão, local) e Cloudflare R2 (`BRUTOS_ARMAZEM=r2`, bucket `m2-brutos`, nos workflows do ITBI e do IPTU); retenção de 2 versões igual | O Storage do plano grátis recusa arquivos acima de 50 MB; decisão do usuário (mesmo R2 do Assina) |
| Variáveis além da 18.4 | `BRUTOS_ARMAZEM`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Decisão do R2 |
| Teto nas Actions | `FIRECRAWL_MAX_CREDITOS_EXECUCAO = 50` | Decisão do usuário (~430 créditos/mês) |
| IPTU no "Executar agora" | Input `ano` opcional (vazio = ano corrente) | O painel manda só `{ref: "main"}` (13.1); com input obrigatório o GitHub respondia 422 |
| 9.2 no workflow do ITBI | `calibrar=true\|false` no `GITHUB_OUTPUT` e `if:` no passo da calibração | A calibração rodava com planilha sem mudança |
| Segurança dos workflows | `permissions: contents: read`; nenhum input direto em `run` | Ajuste do verifier |
| `/api/*` sem sessão | 401 em JSON, não redirecionamento | O cliente mostrava "Erro 200" |
| Volume anômalo | Comparação só dentro da mesma referência | Bug achado pela `vigia` (ano parcial do ITBI × anos inteiros) |
| Repositório | GitHub `asiqueira1973/m2-real`, público, licença MIT | Decisão do usuário |
| Turbopack | Módulos de saúde importados sem extensão | O Turbopack não mapeia `./x.js` para `./x.ts` |

### 8.9 MCP, Vercel e domínio
| Item | Como ficou | Por quê |
|---|---|---|
| `/mcp` | `fechouporquanto.com.br/mcp` reescrito para `/api/mcp`; os dois funcionam; o proxy exclui os dois | Decisão do usuário |
| Proteção de deploy da Vercel | Só os previews exigem login na Vercel; a produção (`m2-real.vercel.app`, provisório até o DNS) fica aberta, protegida pelo login de admin e pela chave de API; token de bypass só para o `scripts/test-client.mjs` | Autorizado pelo usuário |
| `m2_mediana_bairro` | Mediana do bairro calculada no banco (função fora da 7.4) | Calcular no app levava até 6 s (p95); a seção 17 pede 1,5 s |
| Rótulos dos selos | O MCP devolve "Calibrada", "Sem dado" etc. em `selo`, `selo_area` e nas chaves de `distribuicao_selos` | Seção 15 (correção depois do verifier) |
| Credencial de serviço | Handler em `src/server/mcp/handler.ts`; a rota só reexporta | Regra do CLAUDE.md |
| `ultimo_uso_em` | Gravado com `after()` | O `void` podia ser cortado na Vercel |
| Ordem das áreas na fila | Pela área (migration `20261122230000`) | O empate em `coletado_em` deixava o pgTAP 110 intermitente |
| `m2_bairro.quartos` | Quartos da planta (vindos dos anúncios); venda de planta sem quartos sai quando o filtro é usado | Interpretação declarada |
| `comparaveis.meses` | 1–120, como `vendas_predio` | A 13.2 não fixa o máximo |
| Campos extras | `dados_desatualizados`, `motivo_desatualizacao` (O5), `com_vagas_inclusas`, `mensagem`, `origem_area_referencia` | Só acrescentam campos |
| Build na Vercel | `installCommand = cd ../.. && npm ci`; TypeScript e `@types/node` declarados no `apps/web` | A Vercel instalava só o workspace |
| Testes | `ficha_predio`, `m2_bairro` e `comparaveis` testados pelo `test-client` (local e preview), não pelo Vitest | Cobertura menor que a do plano, declarada |
| Admin na nuvem e DNS | Perfil criado para a conta já existente no Auth do BANCO DE TESTE; registros A e CNAME passados ao usuário (zona em transição no registro.br) | — |


### 8.10 OAuth do MCP e cadastro aberto
| Item | Como ficou | Por quê |
|---|---|---|
| Contas de cliente | Tabela própria (`m2_clientes`, só `sub` e e-mail do Google), fora do Supabase Auth; `m2_perfis`, `m2_eh_admin()` e o layout do painel ficaram intactos | Sem autocadastro nem SMTP no projeto compartilhado; o painel continua só para admin |
| Numeração das regras | As regras novas são **11.21** (contas novas) e **11.22** (uso do MCP). A migration `20261123100000` cita os números provisórios 11.18 e 11.19, que já existiam (vagas e leilões); não foi editada, e a `20261123110000` registra a correção | Migration aplicada não se edita (CLAUDE.md) |
| Funções | `m2_cria_cliente` do plano virou `m2_entra_cliente(sub, email, limite)`, que devolve `(cliente_id, situacao)`; `m2_registra_uso_mcp(token_id, …)` virou `m2_usa_token_mcp(hash, …)`, que também valida o token e grava `ultimo_uso_em` numa ida só ao banco | Uma consulta por chamada ao MCP |
| Colunas | `m2_clientes` com `atualizado_em` e trigger; `m2_uso_mcp` com `criado_em` (no banco local entrou por `alter table` antes do envio ao remoto); o `010_estrutura` passou a conferir a convenção em todas as tabelas `m2_` | Convenção da seção 7 |
| Paginação | `m2_clientes_mcp(limite, deslocamento)` com `total`; a tela mostra 50 contas por página | Corte silencioso de 1.000 linhas do PostgREST |
| Freio no registro de app | `m2_registra_cliente_oauth`: no máximo 200 registros por hora; apps sem uso há 30 dias são apagados | Qualquer um pode chamar `POST /oauth/registrar` |
| Páginas públicas | `/privacidade` e `/termos`; dizem que remover o conector não cancela o acesso (o cancelamento é por e-mail e o admin bloqueia a conta) | Exigidas pela tela de consentimento do Google |
| CORS | 401 e 429 do MCP levam os cabeçalhos CORS (`expose-headers: www-authenticate`) | Clientes de navegador precisam ler o `WWW-Authenticate` |
| Tokens | Sem `expires_in` e sem refresh token; valem até o reuso do código ou o bloqueio da conta. Não há revogação de token individual pelo painel | Plano 8.10 (desenho do Assina): a pessoa corta o acesso pedindo o bloqueio da conta |
| Mensagem do 401 | Token inválido recebe a mesma mensagem da chave: "Chave de API inválida ou revogada." | A seção 15 tem uma só mensagem para credencial ausente ou inválida |
| Variáveis além da 18.4 | `NEXT_PUBLIC_SITE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` (Vercel e `.env.local`) | Login com Google e cookie assinado |

### Divergências conhecidas e pendências
Pontos em que o código não segue o spec, ou em que o spec, os planos ou o código ficaram desatualizados, e que **não** estão resolvidos. Cada item diz o comportamento real.

1. **Retenção de anúncios (seção 20) não existe.** O spec manda o pipeline apagar anúncios com mais de 3 anos. Nenhuma rotina apaga linhas de `m2_anuncios`. O plano mestre listava a tarefa no 8.6, mas o plano `8.6-calibracao.md` não a inclui. Hoje os anúncios ficam para sempre.
2. **`substituida` só no ITBI.** A seção 12 diz que uma execução `concluida` passa a `substituida` quando outra do mesmo ano/fonte conclui depois. Só `m2_itbi_substituir_ano` faz isso (e só numa carga que grava, não no "sem mudança"). Cargas repetidas do IPTU do mesmo exercício ficam todas `concluida`.
3. **`ingestao-itbi` processa todos os anos.** A seção 4.4 diz "baixa a planilha do ano corrente". A rotina lê a página da Fazenda, baixa **todas** as planilhas `.xlsx` e processa cada ano a partir de 2021; os anos sem mudança concluem com 0 linhas. Com um ano no argumento (`itbi 2025`), ainda baixa todas e só processa aquele. O comentário do `ingestao-itbi.yml` dizia "ano corrente" e foi corrigido no mesmo commit deste documento; o texto da 4.4 continua divergente.
4. **Casos de borda do `comparaveis` que a 13.2 não descreve:**
   - exclui as vendas do próprio prédio;
   - se o prédio não tem ano de construção, não aplica o filtro de década; se tem, as vendas de prédios sem ano ficam de fora;
   - sem `area_privativa` informada, usa a planta com mais unidades **entre as que têm área** (não a planta mais comum em absoluto);
   - "mesma rua" é igualdade exata do logradouro normalizado;
   - a lista inclui vendas `fora_da_curva` (só a mediana as exclui, pela 11.17);
   - cada venda traz também `predio_id`, `endereco` e `ano_construcao`, além dos campos de `vendas_predio`.
5. **Interpretação da 11.7 (andar inferido) sem registro no plano.** O texto da regra diz "sem os 2 últimos dígitos", mas os exemplos tiram 1 dígito de números com até 2 dígitos ("AP 24" → 2). O código segue os exemplos, e o comentário de `inferFloor` (`iptu/montagem.ts`) diz que a interpretação está em `plans/8.2-iptu.md`. O plano só registra o corte de números com mais de 4 dígitos.
6. **Selo de saúde (O4) só na tela Execuções.** O plano `8.2-iptu.md` previa o selo "na Visão geral e na tela Execuções". A Visão geral mostra só a data e o status da última execução de cada rotina (em vermelho se `falhou`), sem `avaliarSaude`.
7. **`buscar_predio` usa os padrões da função SQL.** O MCP chama `m2_buscar_predio_por_endereco` só com o texto, e valem os padrões da função (similaridade 0,4 e 5 resultados). Os valores são iguais aos de `BUSCA_SIMILARIDADE_MINIMA` e `BUSCA_LIMITE_RESULTADOS` em `regras.ts`, mas ficam duplicados no SQL: mudar a constante não muda o MCP.
8. **Assinaturas dos planos sem `janela_meses`.** O plano 8.7 descreve `m2_listar_predios(bairro_id, selo, so_revisao, busca, limite, deslocamento)` e o 8.8, `m2_fila_revisao(bairro, motivo, limite, deslocamento)`. As funções reais têm também `janela_meses` (o painel passa 24, `COBERTURA_JANELA_MESES`).
9. **Spec ainda fala em Storage para os brutos.** A seção 17 ("os brutos ficam no Storage"), o diagrama da 4.1, a 18.4 (`IPTU_ARQUIVO_URL`: "vazio = ler do Storage") e a 20 (retenção) citam o Storage do Supabase. Em produção (GitHub Actions) os brutos ficam no Cloudflare R2, bucket `m2-brutos` (`BRUTOS_ARMAZEM=r2`, decisão do 8.8). O Storage (`m2_brutos`) só é usado no ambiente local.
10. **Números provisórios na migration do OAuth.** `20261123100000_m2_oauth.sql` cita as regras 11.18 e 11.19 nos comentários de `m2_entra_cliente`, `m2_usa_token_mcp` e `m2_uso_mcp`. As regras certas são 11.21 e 11.22; a correção está registrada no cabeçalho da `20261123110000_m2_oauth_ajustes.sql`. O banco e o código usam os números certos.
11. **Spec sem o modelo das tabelas do 8.10.** A seção 7 não descreve as colunas de `clientes`, `oauth_clientes`, `oauth_codigos`, `tokens_mcp` e `uso_mcp` (só a 6.4 cita as tabelas), e a 6.4 não lista `registra_cliente_oauth` entre as funções de serviço. A seção 1 deste documento descreve o que existe.
