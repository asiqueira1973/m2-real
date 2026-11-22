-- =============================================================================
-- Fechou por Quanto — leituras do painel (épico 8.7; seção 10).
-- Divergência declarada em plans/8.7-painel.md: a 7.4 não lista estas funções. São só de
-- leitura, SECURITY INVOKER: rodam com o papel de quem chama, então o RLS (m2_eh_admin(), 6.4)
-- vale como em qualquer select — sem perfil admin ativo, devolvem vazio.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- m2_listar_predios(...) (seção 10, tela Prédios; regras 11.5 e 11.13)
-- O que faz: lista os prédios com as colunas da tela (endereço, bairro, ano, unidades, plantas,
-- pior selo, vendas na janela, revisão pendente), filtrados e paginados.
-- Recebe: bairro (nulo = todos), selo (filtra pelo pior selo; nulo = todos), so_revisao,
-- busca (texto livre de endereço, normalizado pela 11.5; o número, se houver, casa com numero
-- ou numeros_imovel), janela_meses (vendas recentes; o painel passa COBERTURA_JANELA_MESES),
-- limite (até 100) e deslocamento.
-- Devolve: as linhas da página e, em cada uma, o total de linhas do filtro.
-- Pior selo: a ordem da 11.13 (sem_dado < estimada < indicativa < calibrada < confirmada).
-- -----------------------------------------------------------------------------
create function public.m2_listar_predios(
  bairro integer,
  selo public.m2_selo_area,
  so_revisao boolean,
  busca text,
  janela_meses integer,
  limite integer,
  deslocamento integer
)
returns table (
  id uuid, logradouro text, numero integer, bairro_id smallint, bairro_nome text, ano_construcao smallint,
  total_unidades integer, qtd_plantas integer, pior_selo public.m2_selo_area, vendas_janela integer,
  revisao_pendente boolean, total bigint
)
language sql
stable
set search_path = ''
as $$
  with
  termo as (
    select nullif(trim(regexp_replace(public.m2_normalizar_endereco(coalesce(busca, '')), '\d+', '', 'g')), '') as texto,
           (regexp_match(coalesce(busca, ''), '\d+'))[1]::integer as numero
  ),
  plantas as (
    select pl.predio_id,
           count(*)::integer as qtd,
           min(array_position(array['sem_dado','estimada','indicativa','calibrada','confirmada']::public.m2_selo_area[], pl.selo)) as pior,
           bool_or(pl.revisao_pendente) as revisao
      from public.m2_plantas pl
     group by pl.predio_id
  ),
  vendas as (
    select v.predio_id, count(*)::integer as qtd
      from public.m2_vendas_consolidadas v
     where v.data_transacao >= (current_date - make_interval(months => janela_meses))
     group by v.predio_id
  ),
  filtrados as (
    select p.id, p.logradouro, p.numero, p.bairro_id, b.nome as bairro_nome, p.ano_construcao,
           p.total_unidades_residenciais as total_unidades, coalesce(pl.qtd, 0) as qtd_plantas,
           (array['sem_dado','estimada','indicativa','calibrada','confirmada']::public.m2_selo_area[])[pl.pior] as pior_selo,
           coalesce(v.qtd, 0) as vendas_janela, coalesce(pl.revisao, false) as revisao_pendente
      from public.m2_predios p
      join public.m2_bairros b on b.id = p.bairro_id
      left join plantas pl on pl.predio_id = p.id
      left join vendas v on v.predio_id = p.id
      cross join termo t
     where (m2_listar_predios.bairro is null or p.bairro_id = m2_listar_predios.bairro)
       and (not coalesce(so_revisao, false) or coalesce(pl.revisao, false))
       and (t.texto is null or p.logradouro like '%' || t.texto || '%')
       and (t.numero is null or p.numero = t.numero or t.numero = any (p.numeros_imovel))
  )
  select f.id, f.logradouro, f.numero, f.bairro_id, f.bairro_nome, f.ano_construcao, f.total_unidades, f.qtd_plantas,
         f.pior_selo, f.vendas_janela, f.revisao_pendente, count(*) over () as total
    from filtrados f
   where m2_listar_predios.selo is null or f.pior_selo = m2_listar_predios.selo
   order by f.vendas_janela desc, f.logradouro, f.numero, f.id
   limit least(greatest(coalesce(limite, 50), 1), 100)
  offset greatest(coalesce(deslocamento, 0), 0);
$$;

revoke all on function public.m2_listar_predios(integer, public.m2_selo_area, boolean, text, integer, integer, integer) from public, anon;
grant execute on function public.m2_listar_predios(integer, public.m2_selo_area, boolean, text, integer, integer, integer) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- m2_cobertura_atual() (seção 10, Visão geral; D12)
-- O que faz: a última foto de cobertura de cada bairro.
-- Recebe: nada. Devolve: uma linha por bairro com cobertura calculada (com o nome do bairro).
-- -----------------------------------------------------------------------------
create function public.m2_cobertura_atual()
returns table (
  bairro_id smallint, bairro_nome text, calculado_em timestamptz, vendas_24m integer, vendas_confirmada integer,
  vendas_calibrada integer, vendas_indicativa integer, vendas_estimada integer, vendas_sem_dado integer, pct_cobertura numeric
)
language sql
stable
set search_path = ''
as $$
  select distinct on (c.bairro_id)
         c.bairro_id, b.nome, c.calculado_em, c.vendas_24m, c.vendas_confirmada, c.vendas_calibrada,
         c.vendas_indicativa, c.vendas_estimada, c.vendas_sem_dado, c.pct_cobertura
    from public.m2_cobertura_bairros c
    join public.m2_bairros b on b.id = c.bairro_id
   order by c.bairro_id, c.calculado_em desc, c.id;
$$;

revoke all on function public.m2_cobertura_atual() from public, anon;
grant execute on function public.m2_cobertura_atual() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- m2_ultimas_execucoes() (seção 10, Visão geral: "data da última execução de cada rotina")
-- O que faz: a execução mais recente de cada rotina, qualquer que seja o status.
-- Recebe: nada. Devolve: uma linha por rotina já executada.
-- -----------------------------------------------------------------------------
create function public.m2_ultimas_execucoes()
returns table (
  rotina text, status public.m2_status_execucao, iniciada_em timestamptz, concluida_em timestamptz,
  linhas_lidas integer, linhas_gravadas integer, mensagem_erro text
)
language sql
stable
set search_path = ''
as $$
  select distinct on (e.rotina)
         e.rotina, e.status, e.iniciada_em, e.concluida_em, e.linhas_lidas, e.linhas_gravadas, e.mensagem_erro
    from public.m2_execucoes_ingestao e
   order by e.rotina, e.iniciada_em desc, e.id;
$$;

revoke all on function public.m2_ultimas_execucoes() from public, anon;
grant execute on function public.m2_ultimas_execucoes() to authenticated, service_role;
