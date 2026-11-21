-- =============================================================================
-- M² Real — migration 1/3: extensões e enums (spec seção 7.1)
-- Todo objeto leva o prefixo m2_ (decisão do usuário, 21/11/2026); os valores
-- dos enums ficam exatamente como no spec.
-- =============================================================================

-- Extensões no schema "extensions" (padrão Supabase; o advisor alerta extensão em public).
-- pg_trgm: busca de endereço por similaridade (regra 11.5, índice da 7.3).
-- unaccent: normalização de endereço sem acento (regra 11.5).
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- De onde veio um dado (7.1). Usado em execuções, anúncios, plantas e calibrações.
create type public.m2_fonte_dado as enum (
  'itbi', 'iptu', 'anuncio', 'pagina_condominio', 'edital_leilao', 'revisao_manual', 'fator_referencia'
);

-- Ciclo de uma execução de ingestão (7.1; máquina de estados da seção 12).
create type public.m2_status_execucao as enum ('em_andamento', 'concluida', 'falhou', 'substituida');

-- Classificação da unidade pelo uso do IPTU (7.1; regra 11.3).
create type public.m2_tipo_unidade as enum ('apartamento', 'vaga', 'outro');

-- Confiança da área privativa (7.1; regra 11.9).
create type public.m2_selo_area as enum ('confirmada', 'calibrada', 'indicativa', 'estimada', 'sem_dado');

-- Situação do vínculo de um anúncio (7.1; regra 11.8).
create type public.m2_status_casamento as enum (
  'casado_planta', 'casado_predio', 'ambiguo', 'sem_predio', 'descartado'
);

-- Tipo do anúncio (7.1).
create type public.m2_finalidade_anuncio as enum ('venda', 'aluguel');

-- Como o bairro da guia foi definido (7.1; regra 11.2).
create type public.m2_origem_bairro as enum ('campo', 'cep', 'quadra', 'iptu');

-- Perfil do painel (7.1; seção 5).
create type public.m2_papel_usuario as enum ('admin');

-- Por que algo foi para a fila de revisão (7.1; regras 11.9, 11.12, 11.16).
create type public.m2_motivo_revisao as enum (
  'fator_incoerente', 'anuncios_divergentes', 'anuncio_ambiguo', 'planta_especial',
  'venda_fora_da_curva', 'edital_divergente'
);

-- Situação do vínculo de um edital de leilão (7.1; regra 11.20).
create type public.m2_status_casamento_edital as enum (
  'casado_unidade', 'casado_predio', 'sem_predio', 'descartado'
);
