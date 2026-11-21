-- =============================================================================
-- M² Real — migration 3/3: funções da 7.4, RLS e políticas da 6.4, grants
-- Todas as funções: search_path vazio (nomes sempre qualificados), prefixo m2_.
-- As funções de revisão são SECURITY DEFINER e exigem m2_eh_admin(): são o único
-- caminho de escrita do admin em plantas, anúncios, editais e vendas (6.4).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- m2_eh_admin() (7.4; 6.4)
-- O que faz: diz se o usuário autenticado tem perfil admin ativo.
-- Recebe: nada (usa auth.uid() da sessão). Devolve: boolean.
-- SECURITY DEFINER para ler m2_perfis sem depender das políticas da própria tabela.
-- -----------------------------------------------------------------------------
create function public.m2_eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.m2_perfis p
    where p.id = auth.uid()
      and p.papel = 'admin'
      and p.ativo
  );
$$;

-- -----------------------------------------------------------------------------
-- m2_normalizar_endereco(texto) (regra 11.5)
-- O que faz: deixa um endereço comparável — sem acento, maiúsculas, sem pontuação,
-- espaços simples e abreviações padronizadas (R→RUA, AV→AVENIDA, AL→ALAMEDA,
-- PCA→PRACA, DR→DOUTOR, PROF→PROFESSOR, CEL→CORONEL, MIN→MINISTRO, CAP→CAPITAO,
-- SEN→SENADOR, VER→VEREADOR).
-- Recebe: texto livre (pode ser nulo). Devolve: texto normalizado (nulo se entrada nula).
-- A mesma regra é espelhada no TypeScript da ingestão (épico 8.2) para gravar m2_predios.logradouro.
-- -----------------------------------------------------------------------------
create function public.m2_normalizar_endereco(texto text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  t text;
  abreviacao record;
begin
  if texto is null then
    return null;
  end if;
  -- Sem acento e em maiúsculas.
  t := upper(extensions.unaccent('extensions.unaccent'::regdictionary, texto));
  -- Sem pontuação: tudo que não é letra, dígito ou espaço vira espaço.
  t := regexp_replace(t, '[^A-Z0-9 ]', ' ', 'g');
  -- Espaços simples.
  t := btrim(regexp_replace(t, '\s+', ' ', 'g'));
  -- Abreviações da regra 11.5, só como palavra inteira (\m e \M são limites de palavra).
  for abreviacao in
    select * from (values
      ('R', 'RUA'), ('AV', 'AVENIDA'), ('AL', 'ALAMEDA'), ('PCA', 'PRACA'), ('DR', 'DOUTOR'),
      ('PROF', 'PROFESSOR'), ('CEL', 'CORONEL'), ('MIN', 'MINISTRO'), ('CAP', 'CAPITAO'),
      ('SEN', 'SENADOR'), ('VER', 'VEREADOR')
    ) as a (curta, longa)
  loop
    t := regexp_replace(t, '\m' || abreviacao.curta || '\M', abreviacao.longa, 'g');
  end loop;
  return t;
end;
$$;

-- -----------------------------------------------------------------------------
-- m2_buscar_predio_por_endereco(texto, limiar_similaridade, limite) (7.4; regra 11.5)
-- O que faz: acha prédios por endereço digitado livremente (usado pelo MCP buscar_predio
-- e pela busca do painel).
--   1. Normaliza o texto (regra 11.5).
--   2. Separa logradouro e número: se o texto tem vírgula, o número é o primeiro
--      grupo de dígitos depois dela ("Rua Caiubi, 324"); senão, o último grupo de
--      dígitos do texto ("rua caiubi 324").
--   3. Com número: só prédios com número exato e similaridade trigram do logradouro
--      ≥ limiar. Sem número: os mais similares acima do limiar.
-- Recebe: texto livre; limiar (padrão 0.4) e limite (padrão 5) da regra 11.5 — o MCP
--   passa os valores de packages/ingestao/src/config/regras.ts.
-- Devolve: até "limite" linhas, da maior para a menor similaridade.
-- SECURITY INVOKER: respeita o RLS de quem chama (admin no painel; service role no MCP).
-- -----------------------------------------------------------------------------
create function public.m2_buscar_predio_por_endereco(
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
  where (pt.numero is null or p.numero = pt.numero)
    and extensions.similarity(p.logradouro, pt.logradouro) >= limiar_similaridade
  order by extensions.similarity(p.logradouro, pt.logradouro) desc, p.numero, p.id
  limit limite;
$$;

-- -----------------------------------------------------------------------------
-- m2_confirmar_area_planta(planta_id, area_privativa, vagas_inclusas, observacao) (7.4; regras 11.9, 11.11)
-- O que faz: revisão manual da área de uma planta. Grava área, vagas inclusas,
-- fator (área ÷ área IPTU de referência), selo "confirmada" com fonte "revisao_manual",
-- limpa a revisão pendente e registra a mudança em m2_calibracoes (autor = e-mail do admin).
-- Recebe: id da planta, área privativa (> 0), vagas inclusas (pode ser nulo), observação.
-- Devolve: a planta atualizada.
-- Erros: 42501 se não for admin; 22023 se observação vazia ou área inválida; P0002 se a planta não existe.
-- -----------------------------------------------------------------------------
create function public.m2_confirmar_area_planta(
  planta_id uuid,
  area_privativa numeric,
  vagas_inclusas smallint,
  observacao text
)
returns public.m2_plantas
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_planta public.m2_plantas;
  v_autor  text;
begin
  if not public.m2_eh_admin() then
    raise exception 'Acesso negado: só o admin confirma a área de uma planta (seção 5).'
      using errcode = '42501';
  end if;
  if m2_confirmar_area_planta.observacao is null or btrim(m2_confirmar_area_planta.observacao) = '' then
    raise exception 'A observação é obrigatória para confirmar a área (seção 7.4).'
      using errcode = '22023';
  end if;
  if m2_confirmar_area_planta.area_privativa is null or m2_confirmar_area_planta.area_privativa <= 0 then
    raise exception 'A área privativa precisa ser maior que zero.' using errcode = '22023';
  end if;

  select pf.email into v_autor from public.m2_perfis pf where pf.id = auth.uid();

  update public.m2_plantas p
     set area_privativa   = m2_confirmar_area_planta.area_privativa,
         vagas_inclusas   = m2_confirmar_area_planta.vagas_inclusas,
         fator            = round(m2_confirmar_area_planta.area_privativa / p.area_iptu_referencia, 3),
         selo             = 'confirmada',
         fonte_area       = 'revisao_manual',
         faixa_erro_pct   = null,   -- faixa de erro só existe no selo estimada (7.2)
         revisao_pendente = false,
         motivo_revisao   = null
   where p.id = m2_confirmar_area_planta.planta_id
  returning p.* into v_planta;

  if not found then
    raise exception 'Planta não encontrada.' using errcode = 'P0002';
  end if;

  insert into public.m2_calibracoes
    (planta_id, area_privativa, vagas_inclusas, fator, selo, fonte, observacao, autor)
  values
    (v_planta.id, v_planta.area_privativa, v_planta.vagas_inclusas, v_planta.fator,
     'confirmada', 'revisao_manual', btrim(m2_confirmar_area_planta.observacao), v_autor);

  return v_planta;
end;
$$;

-- -----------------------------------------------------------------------------
-- m2_casar_anuncio(anuncio_id, predio_id, planta_id) (7.4; regras 11.8, 11.11)
-- O que faz: vínculo manual de um anúncio. Prédio nulo → "descartado";
-- planta informada → "casado_planta" (a planta precisa ser do prédio);
-- só prédio → "casado_predio". Marca casado_manual = true, que o pipeline não altera.
-- Recebe: id do anúncio, id do prédio (ou nulo), id da planta (ou nulo).
-- Devolve: o anúncio atualizado.
-- Erros: 42501 se não for admin; 22023 se a combinação for inválida; P0002 se algo não existe.
-- -----------------------------------------------------------------------------
create function public.m2_casar_anuncio(
  anuncio_id uuid,
  predio_id uuid,
  planta_id uuid
)
returns public.m2_anuncios
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_status  public.m2_status_casamento;
  v_anuncio public.m2_anuncios;
begin
  if not public.m2_eh_admin() then
    raise exception 'Acesso negado: só o admin casa ou descarta anúncios (seção 5).'
      using errcode = '42501';
  end if;

  if m2_casar_anuncio.predio_id is null then
    if m2_casar_anuncio.planta_id is not null then
      raise exception 'Planta informada sem prédio.' using errcode = '22023';
    end if;
    v_status := 'descartado';
  elsif m2_casar_anuncio.planta_id is not null then
    if not exists (
      select 1 from public.m2_plantas pl
      where pl.id = m2_casar_anuncio.planta_id and pl.predio_id = m2_casar_anuncio.predio_id
    ) then
      raise exception 'A planta não pertence ao prédio informado.' using errcode = '22023';
    end if;
    v_status := 'casado_planta';
  else
    if not exists (select 1 from public.m2_predios pr where pr.id = m2_casar_anuncio.predio_id) then
      raise exception 'Prédio não encontrado.' using errcode = 'P0002';
    end if;
    v_status := 'casado_predio';
  end if;

  update public.m2_anuncios a
     set predio_id           = m2_casar_anuncio.predio_id,
         planta_id           = m2_casar_anuncio.planta_id,
         status_casamento    = v_status,
         confianca_casamento = null,  -- vínculo manual não tem confiança calculada
         casado_manual       = true
   where a.id = m2_casar_anuncio.anuncio_id
  returning a.* into v_anuncio;

  if not found then
    raise exception 'Anúncio não encontrado.' using errcode = 'P0002';
  end if;
  return v_anuncio;
end;
$$;

-- -----------------------------------------------------------------------------
-- m2_casar_edital(edital_id, predio_id, unidade_id) (7.4; regras 11.11, 11.20)
-- O que faz: vínculo manual de um edital de leilão. Prédio nulo → "descartado";
-- unidade informada → "casado_unidade" (a unidade precisa ser do prédio);
-- só prédio → "casado_predio". Marca casado_manual = true.
-- Recebe: id do edital, id do prédio (ou nulo), id da unidade (ou nulo).
-- Devolve: o edital atualizado.
-- Erros: 42501 se não for admin; 22023 se a combinação for inválida; P0002 se algo não existe.
-- -----------------------------------------------------------------------------
create function public.m2_casar_edital(
  edital_id uuid,
  predio_id uuid,
  unidade_id uuid
)
returns public.m2_editais_leilao
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_status public.m2_status_casamento_edital;
  v_edital public.m2_editais_leilao;
begin
  if not public.m2_eh_admin() then
    raise exception 'Acesso negado: só o admin casa ou descarta editais (seção 5).'
      using errcode = '42501';
  end if;

  if m2_casar_edital.predio_id is null then
    if m2_casar_edital.unidade_id is not null then
      raise exception 'Unidade informada sem prédio.' using errcode = '22023';
    end if;
    v_status := 'descartado';
  elsif m2_casar_edital.unidade_id is not null then
    if not exists (
      select 1 from public.m2_unidades u
      where u.id = m2_casar_edital.unidade_id and u.predio_id = m2_casar_edital.predio_id
    ) then
      raise exception 'A unidade não pertence ao prédio informado.' using errcode = '22023';
    end if;
    v_status := 'casado_unidade';
  else
    if not exists (select 1 from public.m2_predios pr where pr.id = m2_casar_edital.predio_id) then
      raise exception 'Prédio não encontrado.' using errcode = 'P0002';
    end if;
    v_status := 'casado_predio';
  end if;

  update public.m2_editais_leilao e
     set predio_id        = m2_casar_edital.predio_id,
         unidade_id       = m2_casar_edital.unidade_id,
         status_casamento = v_status,
         casado_manual    = true
   where e.id = m2_casar_edital.edital_id
  returning e.* into v_edital;

  if not found then
    raise exception 'Edital não encontrado.' using errcode = 'P0002';
  end if;
  return v_edital;
end;
$$;

-- -----------------------------------------------------------------------------
-- m2_marcar_outlier(venda_id, fora_da_curva) (7.4; regras 11.11, 11.16)
-- O que faz: o admin força ou desfaz "fora da curva" numa venda consolidada;
-- grava marcado_manual = true, que o pipeline preserva no recálculo (7.5).
-- Recebe: id da venda, novo valor de fora_da_curva. Devolve: a venda atualizada.
-- Erros: 42501 se não for admin; 22023 se o valor for nulo; P0002 se a venda não existe.
-- -----------------------------------------------------------------------------
create function public.m2_marcar_outlier(
  venda_id uuid,
  fora_da_curva boolean
)
returns public.m2_vendas_consolidadas
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_venda public.m2_vendas_consolidadas;
begin
  if not public.m2_eh_admin() then
    raise exception 'Acesso negado: só o admin marca venda fora da curva (seção 5).'
      using errcode = '42501';
  end if;
  if m2_marcar_outlier.fora_da_curva is null then
    raise exception 'Informe verdadeiro ou falso.' using errcode = '22023';
  end if;

  update public.m2_vendas_consolidadas v
     set fora_da_curva  = m2_marcar_outlier.fora_da_curva,
         marcado_manual = true
   where v.id = m2_marcar_outlier.venda_id
  returning v.* into v_venda;

  if not found then
    raise exception 'Venda não encontrada.' using errcode = 'P0002';
  end if;
  return v_venda;
end;
$$;

-- -----------------------------------------------------------------------------
-- m2_marcar_planta_especial(planta_id, especial) (seção 5, regra 11.12)
-- Divergência declarada (plans/8.1-banco.md): a matriz da seção 5 deixa o admin marcar
-- planta especial, mas a 6.4 só libera update em plantas por funções. Esta função fecha a lacuna.
-- O que faz: grava especial = verdadeiro/falso; se a planta estava na fila por
-- "planta_especial", a decisão do admin resolve a revisão.
-- Recebe: id da planta, novo valor. Devolve: a planta atualizada.
-- Erros: 42501 se não for admin; 22023 se o valor for nulo; P0002 se a planta não existe.
-- -----------------------------------------------------------------------------
create function public.m2_marcar_planta_especial(
  planta_id uuid,
  especial boolean
)
returns public.m2_plantas
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_planta public.m2_plantas;
begin
  if not public.m2_eh_admin() then
    raise exception 'Acesso negado: só o admin marca planta especial (seção 5).'
      using errcode = '42501';
  end if;
  if m2_marcar_planta_especial.especial is null then
    raise exception 'Informe verdadeiro ou falso.' using errcode = '22023';
  end if;

  update public.m2_plantas p
     set especial         = m2_marcar_planta_especial.especial,
         revisao_pendente = case when p.motivo_revisao = 'planta_especial' then false else p.revisao_pendente end,
         motivo_revisao   = case when p.motivo_revisao = 'planta_especial' then null else p.motivo_revisao end
   where p.id = m2_marcar_planta_especial.planta_id
  returning p.* into v_planta;

  if not found then
    raise exception 'Planta não encontrada.' using errcode = 'P0002';
  end if;
  return v_planta;
end;
$$;

-- =============================================================================
-- RLS (6.4): ligado em todas as tabelas. O pipeline usa service role (ignora RLS).
-- =============================================================================
alter table public.m2_bairros             enable row level security;
alter table public.m2_perfis              enable row level security;
alter table public.m2_execucoes_ingestao  enable row level security;
alter table public.m2_predios             enable row level security;
alter table public.m2_plantas             enable row level security;
alter table public.m2_unidades            enable row level security;
alter table public.m2_transacoes          enable row level security;
alter table public.m2_vendas_consolidadas enable row level security;
alter table public.m2_anuncios            enable row level security;
alter table public.m2_editais_leilao      enable row level security;
alter table public.m2_calibracoes         enable row level security;
alter table public.m2_fatores_referencia  enable row level security;
alter table public.m2_cobertura_bairros   enable row level security;
alter table public.m2_chaves_api          enable row level security;

-- Política m2_<tabela>_leitura_admin (6.4): só admin ativo lê. Uma por tabela de dados.
-- (select m2_eh_admin()) avalia uma vez por consulta (advisor "auth_rls_initplan").
-- Nenhuma política de insert/update/delete: a escrita do admin em plantas, anúncios,
-- editais e vendas é só pelas funções acima (6.4); as demais tabelas são do pipeline.
do $$
declare
  t text;
begin
  foreach t in array array[
    'm2_bairros', 'm2_predios', 'm2_unidades', 'm2_plantas', 'm2_transacoes',
    'm2_vendas_consolidadas', 'm2_anuncios', 'm2_editais_leilao', 'm2_calibracoes',
    'm2_fatores_referencia', 'm2_execucoes_ingestao', 'm2_cobertura_bairros'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.m2_eh_admin()))',
      t || '_leitura_admin', t
    );
  end loop;
end;
$$;

-- m2_perfis_leitura_propria (6.4): cada usuário lê só a própria linha; ninguém escreve pela API.
create policy m2_perfis_leitura_propria on public.m2_perfis
  for select to authenticated
  using (id = (select auth.uid()));

-- m2_chaves_api (6.4): admin lê, cria e altera "ativa" (revogar). Uma política por comando,
-- para não haver políticas permissivas sobrepostas (advisor "multiple_permissive_policies").
create policy m2_chaves_api_leitura_admin on public.m2_chaves_api
  for select to authenticated
  using ((select public.m2_eh_admin()));

create policy m2_chaves_api_insercao_admin on public.m2_chaves_api
  for insert to authenticated
  with check ((select public.m2_eh_admin()) and criada_por = (select auth.uid()));

create policy m2_chaves_api_atualizacao_admin on public.m2_chaves_api
  for update to authenticated
  using ((select public.m2_eh_admin()))
  with check ((select public.m2_eh_admin()));

-- =============================================================================
-- Grants (defesa em profundidade, além do RLS; seções 5 e 6.4).
-- O Supabase concede tudo a anon/authenticated por padrão em public: aqui se restringe
-- só às tabelas m2_*. Toda migration futura que criar tabela m2_* repete este padrão
-- (o teste supabase/tests/010_estrutura confere).
-- =============================================================================
do $$
declare
  t text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'm2\_%'
  loop
    -- anon e authenticated ficam só com select; o RLS decide as linhas (anon não tem
    -- política, então recebe 0 linhas, como pede o critério do épico 8.1).
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end;
$$;

-- Chaves de API: o admin cria (nome, prefixo, hash e autor) e só altera "ativa" (13.1).
grant insert (nome, prefixo, hash_chave, criada_por) on public.m2_chaves_api to authenticated;
grant update (ativa) on public.m2_chaves_api to authenticated;

-- Funções: ninguém além de authenticated/service_role executa. A trigger function não é chamável.
revoke all on function public.m2_atualizar_atualizado_em() from public, anon, authenticated;
revoke all on function public.m2_eh_admin() from public, anon;
revoke all on function public.m2_normalizar_endereco(text) from public, anon;
revoke all on function public.m2_buscar_predio_por_endereco(text, real, integer) from public, anon;
revoke all on function public.m2_confirmar_area_planta(uuid, numeric, smallint, text) from public, anon;
revoke all on function public.m2_casar_anuncio(uuid, uuid, uuid) from public, anon;
revoke all on function public.m2_casar_edital(uuid, uuid, uuid) from public, anon;
revoke all on function public.m2_marcar_outlier(uuid, boolean) from public, anon;
revoke all on function public.m2_marcar_planta_especial(uuid, boolean) from public, anon;

grant execute on function public.m2_eh_admin() to authenticated, service_role;
grant execute on function public.m2_normalizar_endereco(text) to authenticated, service_role;
grant execute on function public.m2_buscar_predio_por_endereco(text, real, integer) to authenticated, service_role;
grant execute on function public.m2_confirmar_area_planta(uuid, numeric, smallint, text) to authenticated;
grant execute on function public.m2_casar_anuncio(uuid, uuid, uuid) to authenticated;
grant execute on function public.m2_casar_edital(uuid, uuid, uuid) to authenticated;
grant execute on function public.m2_marcar_outlier(uuid, boolean) to authenticated;
grant execute on function public.m2_marcar_planta_especial(uuid, boolean) to authenticated;
