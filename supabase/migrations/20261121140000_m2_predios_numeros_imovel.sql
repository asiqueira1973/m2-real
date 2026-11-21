-- =============================================================================
-- Fechou por Quanto — P3 (pergunta aberta da seção 25), decidida pelo usuário em 21/11/2026:
-- condomínio com mais de um número de imóvel continua sendo UM prédio (regra 11.4, A7),
-- e todos os números ficam guardados para a busca de endereço achar o prédio por qualquer um.
-- Divergência declarada em plans/8.2-iptu.md.
-- =============================================================================

-- Todos os números de imóvel das unidades do condomínio (IPTU). "numero" continua sendo o
-- mais frequente entre os apartamentos, usado na exibição.
alter table public.m2_predios
  add column numeros_imovel integer[] not null default '{}';

-- Busca de endereço (regra 11.5; 7.4) também por qualquer número do condomínio.
-- Mesma assinatura, comentário e regras da versão anterior (migration 20261121120200);
-- só muda o filtro de número: p.numero = n OU n = any(p.numeros_imovel).
create or replace function public.m2_buscar_predio_por_endereco(
  texto text,
  limiar_similaridade real default 0.4,
  limite integer default 5
)
returns table (
  predio_id      uuid,
  logradouro     text,
  numero         integer,
  endereco       text,
  bairro         text,
  bairro_slug    text,
  ano_construcao smallint,
  total_unidades integer,
  similaridade   real
)
language sql
stable
set search_path = ''
as $$
  with entrada as (
    select
      public.m2_normalizar_endereco(split_part(texto, ',', 1)) as antes_da_virgula,
      public.m2_normalizar_endereco(nullif(substr(texto, strpos(texto, ',') + 1), texto)) as depois_da_virgula,
      public.m2_normalizar_endereco(texto) as tudo,
      strpos(texto, ',') > 0 as tem_virgula
  ),
  partes as (
    select
      case
        when e.tem_virgula then (regexp_match(coalesce(e.depois_da_virgula, ''), '(\d+)'))[1]::integer
        else (regexp_match(e.tudo, '(\d+)\D*$'))[1]::integer
      end as numero,
      case
        when e.tem_virgula then e.antes_da_virgula
        else btrim(regexp_replace(e.tudo, '\s*\d+\D*$', ''))
      end as logradouro
    from entrada e
  )
  select
    p.id,
    p.logradouro,
    p.numero,
    p.logradouro || coalesce(', ' || p.numero::text, ''),
    b.nome,
    b.slug,
    p.ano_construcao,
    p.total_unidades_residenciais,
    extensions.similarity(p.logradouro, pt.logradouro)
  from public.m2_predios p
  join public.m2_bairros b on b.id = p.bairro_id
  cross join partes pt
  where (pt.numero is null or p.numero = pt.numero or pt.numero = any (p.numeros_imovel))
    and extensions.similarity(p.logradouro, pt.logradouro) >= limiar_similaridade
  order by extensions.similarity(p.logradouro, pt.logradouro) desc, p.numero, p.id
  limit limite;
$$;
