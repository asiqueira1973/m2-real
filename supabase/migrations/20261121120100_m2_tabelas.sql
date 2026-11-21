-- =============================================================================
-- M² Real — migration 2/3: tabelas, índices e trigger de atualizado_em
-- Spec seções 7.2 (tabelas), 7.3 (relacionamentos e índices) e 7.4 (trigger).
-- Prefixo m2_ em tabelas, índices, constraints nomeadas e triggers.
-- Convenção (7): toda tabela tem criado_em; as que mudam têm atualizado_em.
-- m2_calibracoes e m2_cobertura_bairros são históricos só de inserção: sem atualizado_em.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- m2_bairros: os 10 bairros cobertos (7.2). Seed em supabase/seed.sql (7.6).
-- -----------------------------------------------------------------------------
create table public.m2_bairros (
  id            smallint generated always as identity primary key,
  nome          text not null unique,
  slug          text not null unique constraint m2_bairros_slug_formato check (slug ~ '^[a-z0-9-]+$'),
  prefixos_cep  text[] not null,                 -- regra 11.2: CEPs aceitos
  padroes_nome  text[] not null,                 -- regra 11.2: regex de grafias aceitas
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- m2_perfis: quem entra no painel (6.1, 7.2). Só admin ativo acessa (6.1).
-- -----------------------------------------------------------------------------
create table public.m2_perfis (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  papel         public.m2_papel_usuario not null default 'admin',
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- m2_execucoes_ingestao: uma linha por execução de rotina (7.2; seção 12).
-- -----------------------------------------------------------------------------
create table public.m2_execucoes_ingestao (
  id                 uuid primary key default gen_random_uuid(),
  fonte              public.m2_fonte_dado not null,
  rotina             text not null,          -- ingestao-itbi, ingestao-iptu, coleta-anuncios, coleta-leiloes, calibracao (4.4)
  referencia         text,                   -- ano do ITBI / exercício do IPTU; nulo nas coletas e na calibração
  arquivo_url        text,
  arquivo_hash       text,                   -- SHA-256 do arquivo baixado (regra 11.1 / épico 8.3)
  caminho_storage    text,
  status             public.m2_status_execucao not null default 'em_andamento',
  linhas_lidas       integer not null default 0,
  linhas_gravadas    integer not null default 0,
  linhas_descartadas integer not null default 0,
  mensagem_erro      text,                   -- só quando falhou
  iniciada_em        timestamptz not null default now(),
  concluida_em       timestamptz,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- m2_predios: condomínio residencial vertical montado a partir do IPTU (7.2; regras 11.4, 11.6).
-- -----------------------------------------------------------------------------
create table public.m2_predios (
  id                          uuid primary key default gen_random_uuid(),
  chave_predio                text not null unique,     -- setor-quadra-condominio (regra 11.4)
  setor                       char(3) not null,
  quadra                      char(3) not null,
  numero_condominio           text not null,
  bairro_id                   smallint not null references public.m2_bairros (id),
  logradouro                  text not null,            -- normalizado (regra 11.5)
  numero                      integer,
  cep                         char(8) not null,
  ano_construcao              smallint,
  qtd_pavimentos              smallint,
  padrao_iptu                 text,
  total_unidades_residenciais integer not null default 0,
  vagas_cadastro_proprio      boolean not null default false,  -- regra 11.6
  fator_predio                numeric(5,3),
  prioridade_coleta           integer not null default 0,      -- regra 11.13
  ultima_coleta_em            timestamptz,
  ultima_coleta_leilao_em     timestamptz,                     -- regra 11.19
  exercicio_iptu              smallint not null,
  criado_em                   timestamptz not null default now(),
  atualizado_em               timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- m2_plantas: grupo de unidades de mesmo tamanho dentro de um prédio (7.2; regras 11.7, 11.9, 11.12).
-- -----------------------------------------------------------------------------
create table public.m2_plantas (
  id                   uuid primary key default gen_random_uuid(),
  predio_id            uuid not null references public.m2_predios (id),
  area_iptu_referencia numeric(10,2) not null,
  qtd_unidades         integer not null,
  area_privativa       numeric(8,2),            -- nula enquanto selo = sem_dado
  vagas_inclusas       smallint,
  quartos              smallint,
  fator                numeric(5,3),            -- area_privativa / area_iptu_referencia
  selo                 public.m2_selo_area not null default 'sem_dado',
  fonte_area           public.m2_fonte_dado,
  faixa_erro_pct       numeric(5,1),            -- só no selo estimada
  especial             boolean not null default false,
  revisao_pendente     boolean not null default false,
  motivo_revisao       public.m2_motivo_revisao,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- m2_unidades: uma linha por SQL do IPTU dentro de um prédio (7.2; regras 11.3, 11.7).
-- -----------------------------------------------------------------------------
create table public.m2_unidades (
  id              uuid primary key default gen_random_uuid(),
  sql             char(11) not null unique,
  predio_id       uuid not null references public.m2_predios (id),
  planta_id       uuid references public.m2_plantas (id),   -- nulo para vagas e outros usos
  tipo_unidade    public.m2_tipo_unidade not null,
  complemento     text,
  uso_iptu        text not null,
  area_construida numeric(10,2) not null,
  fracao_ideal    numeric(8,6),
  andar_inferido  smallint,                                -- regra 11.7
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- m2_transacoes: uma guia de ITBI dos 10 bairros (7.2; regras 11.1, 11.2, 11.14).
-- -----------------------------------------------------------------------------
create table public.m2_transacoes (
  id                           uuid primary key default gen_random_uuid(),
  hash_linha                   text not null unique,        -- regra 11.1 (idempotência)
  execucao_id                  uuid not null references public.m2_execucoes_ingestao (id),
  sql                          char(11) not null,
  unidade_id                   uuid references public.m2_unidades (id),
  predio_id                    uuid references public.m2_predios (id),
  bairro_id                    smallint not null references public.m2_bairros (id),
  origem_bairro                public.m2_origem_bairro not null,
  logradouro                   text not null,
  numero                       integer,
  complemento                  text,
  cep                          char(8),
  natureza                     text not null,
  eh_compra_venda              boolean not null,
  data_transacao               date not null,
  mes_referencia               date not null,
  valor_declarado              numeric(14,2) not null,
  valor_venal_referencia       numeric(14,2),
  base_calculo                 numeric(14,2),
  proporcao_transmitida        numeric(6,4),
  tipo_financiamento           text,
  valor_financiado             numeric(14,2) not null default 0,
  cartorio                     text,
  matricula                    text,
  uso_iptu_guia                text,
  area_construida_guia         numeric(10,2),
  fracao_ideal_guia            numeric(8,6),
  unidade_sem_cadastro_proprio boolean not null default false,  -- regra 11.14
  criado_em                    timestamptz not null default now(),
  atualizado_em                timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- m2_vendas_consolidadas: venda de apartamento com as vagas vendidas junto (7.2; regras 11.15, 11.16).
-- -----------------------------------------------------------------------------
create table public.m2_vendas_consolidadas (
  id                       uuid primary key default gen_random_uuid(),
  transacao_apartamento_id uuid not null unique references public.m2_transacoes (id),
  transacoes_vagas_ids     uuid[] not null default '{}',  -- sem FK por ser array (trade-off 7.7)
  predio_id                uuid not null references public.m2_predios (id),
  unidade_id               uuid not null references public.m2_unidades (id),
  planta_id                uuid references public.m2_plantas (id),
  data_transacao           date not null,
  valor_apartamento        numeric(14,2) not null,
  valor_vagas              numeric(14,2) not null default 0,
  valor_total              numeric(14,2) not null,
  qtd_vagas_separadas      smallint not null default 0,
  vagas_inclusas_area      smallint,
  area_privativa           numeric(8,2),
  selo_area                public.m2_selo_area not null,
  m2_privativo             numeric(10,2),
  m2_iptu                  numeric(10,2) not null,
  fora_da_curva            boolean not null default false,
  marcado_manual           boolean not null default false,
  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- m2_anuncios: página de condomínio ou anúncio, só campos mínimos (7.2; princípio 4; regra 11.8).
-- -----------------------------------------------------------------------------
create table public.m2_anuncios (
  id                  uuid primary key default gen_random_uuid(),
  url                 text not null unique,
  dominio             text not null,
  fonte               public.m2_fonte_dado not null,
  execucao_id         uuid not null references public.m2_execucoes_ingestao (id),
  logradouro_extraido text,
  numero_extraido     integer,
  nome_condominio     text,
  finalidade          public.m2_finalidade_anuncio,
  area_privativa      numeric(8,2),
  area_privativa_min  numeric(8,2),
  area_privativa_max  numeric(8,2),
  quartos             smallint,
  vagas               smallint,
  andar               smallint,
  preco_pedido        numeric(14,2),
  predio_id           uuid references public.m2_predios (id),
  planta_id           uuid references public.m2_plantas (id),
  status_casamento    public.m2_status_casamento not null default 'sem_predio',
  confianca_casamento numeric(4,3),
  casado_manual       boolean not null default false,   -- regra 11.11
  coletado_em         timestamptz not null default now(),
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- m2_editais_leilao: edital de leilão, só campos extraídos; o PDF não é guardado (7.2; seção 20; regra 11.20).
-- -----------------------------------------------------------------------------
create table public.m2_editais_leilao (
  id                    uuid primary key default gen_random_uuid(),
  url                   text not null unique,
  url_documento         text,
  dominio               text not null,
  execucao_id           uuid not null references public.m2_execucoes_ingestao (id),
  logradouro_extraido   text,
  numero_extraido       integer,
  complemento_extraido  text,
  matricula             text,
  cartorio              text,
  area_privativa        numeric(8,2),
  area_comum            numeric(8,2),
  area_total            numeric(8,2),
  fracao_ideal          numeric(8,6),
  vagas                 smallint,
  vagas_vinculadas_area boolean,
  valor_avaliacao       numeric(14,2),
  data_leilao           date,
  origem_documento      text not null,      -- pagina, edital, laudo ou matricula
  predio_id             uuid references public.m2_predios (id),
  unidade_id            uuid references public.m2_unidades (id),
  status_casamento      public.m2_status_casamento_edital not null default 'sem_predio',
  casado_manual         boolean not null default false,   -- regra 11.11
  coletado_em           timestamptz not null default now(),
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- m2_calibracoes: histórico de toda mudança de área de uma planta (7.2). Só inserção.
-- -----------------------------------------------------------------------------
create table public.m2_calibracoes (
  id             uuid primary key default gen_random_uuid(),
  planta_id      uuid not null references public.m2_plantas (id),
  area_privativa numeric(8,2),
  vagas_inclusas smallint,
  fator          numeric(5,3),
  selo           public.m2_selo_area not null,
  fonte          public.m2_fonte_dado not null,
  anuncios_ids   uuid[] not null default '{}',
  editais_ids    uuid[] not null default '{}',
  observacao     text,                       -- obrigatória na revisão manual
  autor          text not null,              -- 'pipeline' ou e-mail do admin
  criado_em      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- m2_fatores_referencia: fator típico por grupo (7.2; regra 11.10). Recalculado pelo pipeline.
-- -----------------------------------------------------------------------------
create table public.m2_fatores_referencia (
  id                     uuid primary key default gen_random_uuid(),
  bairro_id              smallint references public.m2_bairros (id),  -- nulo = os 10 bairros
  decada_construcao      smallint,                                    -- nulo = todas
  vagas_cadastro_proprio boolean not null,
  fator_mediano          numeric(5,3) not null,
  fator_p25              numeric(5,3) not null,
  fator_p75              numeric(5,3) not null,
  qtd_plantas            integer not null,
  calculado_em           timestamptz not null default now(),
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now(),
  constraint m2_fatores_referencia_grupo_unico
    unique nulls not distinct (bairro_id, decada_construcao, vagas_cadastro_proprio)
);

-- -----------------------------------------------------------------------------
-- m2_cobertura_bairros: foto do indicador de cobertura (7.2; D12). Só inserção (histórico).
-- -----------------------------------------------------------------------------
create table public.m2_cobertura_bairros (
  id                 uuid primary key default gen_random_uuid(),
  bairro_id          smallint not null references public.m2_bairros (id),
  calculado_em       timestamptz not null default now(),
  vendas_24m         integer not null,
  vendas_confirmada  integer not null,
  vendas_calibrada   integer not null,
  vendas_indicativa  integer not null,
  vendas_estimada    integer not null,
  vendas_sem_dado    integer not null,
  pct_cobertura      numeric(5,1) not null,   -- (confirmada + calibrada) / vendas_24m × 100 (P4: indicativa não entra)
  criado_em          timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- m2_chaves_api: chaves do cliente MCP, guardadas só como hash SHA-256 (6.3, 7.2).
-- -----------------------------------------------------------------------------
create table public.m2_chaves_api (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  prefixo       char(8) not null,
  hash_chave    text not null unique,
  ativa         boolean not null default true,
  ultimo_uso_em timestamptz,
  criada_por    uuid not null references public.m2_perfis (id),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- =============================================================================
-- Índices da seção 7.3 (com prefixo m2_).
-- =============================================================================
create index m2_transacoes_sql_idx                   on public.m2_transacoes (sql);
create index m2_transacoes_predio_data_idx           on public.m2_transacoes (predio_id, data_transacao);
create index m2_transacoes_bairro_data_idx           on public.m2_transacoes (bairro_id, data_transacao);
create index m2_unidades_predio_idx                  on public.m2_unidades (predio_id);
create index m2_unidades_planta_idx                  on public.m2_unidades (planta_id);
create index m2_plantas_predio_idx                   on public.m2_plantas (predio_id);
create index m2_vendas_consolidadas_predio_data_idx  on public.m2_vendas_consolidadas (predio_id, data_transacao);
create index m2_vendas_consolidadas_planta_idx       on public.m2_vendas_consolidadas (planta_id);
create index m2_anuncios_predio_idx                  on public.m2_anuncios (predio_id);
create index m2_editais_leilao_predio_idx            on public.m2_editais_leilao (predio_id);
create index m2_editais_leilao_matricula_idx         on public.m2_editais_leilao (matricula);
create index m2_predios_bairro_idx                   on public.m2_predios (bairro_id);
create index m2_predios_logradouro_numero_idx        on public.m2_predios (logradouro, numero);
-- Regra 11.5: busca de endereço do MCP por similaridade trigram.
create index m2_predios_logradouro_trgm_idx          on public.m2_predios using gin (logradouro extensions.gin_trgm_ops);

-- Índices extras em FKs não cobertas acima (advisor de performance "unindexed foreign keys";
-- divergência declarada em plans/8.1-banco.md).
create index m2_transacoes_execucao_idx              on public.m2_transacoes (execucao_id);
create index m2_transacoes_unidade_idx               on public.m2_transacoes (unidade_id);
create index m2_vendas_consolidadas_unidade_idx      on public.m2_vendas_consolidadas (unidade_id);
create index m2_anuncios_execucao_idx                on public.m2_anuncios (execucao_id);
create index m2_anuncios_planta_idx                  on public.m2_anuncios (planta_id);
create index m2_editais_leilao_execucao_idx          on public.m2_editais_leilao (execucao_id);
create index m2_editais_leilao_unidade_idx           on public.m2_editais_leilao (unidade_id);
create index m2_calibracoes_planta_idx               on public.m2_calibracoes (planta_id);
create index m2_fatores_referencia_bairro_idx        on public.m2_fatores_referencia (bairro_id);
create index m2_cobertura_bairros_bairro_idx         on public.m2_cobertura_bairros (bairro_id, calculado_em);
create index m2_chaves_api_criada_por_idx            on public.m2_chaves_api (criada_por);

-- =============================================================================
-- Trigger m2_atualizar_atualizado_em (7.4).
-- =============================================================================

-- Função de trigger: grava now() em atualizado_em antes de cada update.
-- Recebe: a linha nova (NEW). Devolve: a linha com atualizado_em = now().
-- Regra: convenção da seção 7 ("atualizado_em mantido pelo trigger atualizar_atualizado_em").
create function public.m2_atualizar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- Um trigger "before update" por tabela que tem atualizado_em (nome: m2_<tabela>_atualizado_em).
do $$
declare
  t text;
begin
  foreach t in array array[
    'm2_bairros', 'm2_perfis', 'm2_execucoes_ingestao', 'm2_predios', 'm2_plantas', 'm2_unidades',
    'm2_transacoes', 'm2_vendas_consolidadas', 'm2_anuncios', 'm2_editais_leilao',
    'm2_fatores_referencia', 'm2_chaves_api'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.m2_atualizar_atualizado_em()',
      t || '_atualizado_em', t
    );
  end loop;
end;
$$;
