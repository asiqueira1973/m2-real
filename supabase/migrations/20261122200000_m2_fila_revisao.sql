-- =============================================================================
-- Fechou por Quanto — fila de revisão do painel (épico 8.8; seção 10; critério 1 do 8.8).
-- Divergência declarada em plans/8.8-revisao-operacao.md: a 7.4 não lista esta função. Só leitura,
-- SECURITY INVOKER: o RLS (m2_eh_admin(), 6.4) decide quem vê; sem perfil admin, vem vazia.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- m2_fila_revisao(bairro, motivo, janela_meses, limite, deslocamento) (seção 10, Fila de revisão)
-- O que faz: lista os itens pendentes, agrupados por motivo e ordenados pelo volume de vendas do
-- prédio na janela (critério 1 do 8.8):
--  - plantas com revisao_pendente (motivo da planta: fator_incoerente, anuncios_divergentes,
--    planta_especial, edital_divergente...; regras 11.9 e 11.12);
--  - vendas fora da curva que o admin ainda não marcou à mão (motivo venda_fora_da_curva; 11.16).
-- Para o resumo das evidências, devolve as áreas dos anúncios casados à planta e dos editais
-- casados às unidades dela (o texto é montado no painel).
-- Recebe: bairro e motivo (nulos = todos), janela_meses (o painel passa COBERTURA_JANELA_MESES),
-- limite e deslocamento POR MOTIVO (com motivo nulo, devolve os primeiros de cada grupo).
-- Devolve: os itens da página de cada grupo e, em cada linha, o total do grupo.
-- -----------------------------------------------------------------------------
create function public.m2_fila_revisao(
  bairro integer,
  motivo public.m2_motivo_revisao,
  janela_meses integer,
  limite integer,
  deslocamento integer
)
returns table (
  tipo text, item_id uuid, motivo public.m2_motivo_revisao, predio_id uuid, logradouro text, numero integer,
  bairro_nome text, vendas_janela integer, area_iptu numeric, area_privativa numeric, fator numeric,
  fator_predio numeric, selo public.m2_selo_area, areas_anuncios numeric[], areas_editais numeric[],
  data_venda date, unidade text, valor_total numeric, m2_privativo numeric, total_motivo bigint
)
language sql
stable
set search_path = ''
as $$
  with
  vendas as (
    select v.predio_id, count(*)::integer as qtd
      from public.m2_vendas_consolidadas v
     where v.data_transacao >= (current_date - make_interval(months => janela_meses))
     group by v.predio_id
  ),
  itens as (
    select 'planta'::text as tipo, pl.id as item_id, pl.motivo_revisao as motivo, pl.predio_id,
           pl.area_iptu_referencia as area_iptu, pl.area_privativa, pl.fator, pl.selo,
           (select array_agg(coalesce(a.area_privativa, a.area_privativa_min) order by a.coletado_em)
              from public.m2_anuncios a
             where a.planta_id = pl.id and a.status_casamento = 'casado_planta') as areas_anuncios,
           (select array_agg(e.area_privativa order by e.coletado_em)
              from public.m2_editais_leilao e
              join public.m2_unidades u on u.id = e.unidade_id
             where u.planta_id = pl.id and e.status_casamento = 'casado_unidade' and e.area_privativa is not null) as areas_editais,
           null::date as data_venda, null::text as unidade, null::numeric as valor_total, null::numeric as m2_privativo
      from public.m2_plantas pl
     where pl.revisao_pendente and pl.motivo_revisao is not null
    union all
    select 'venda', v.id, 'venda_fora_da_curva'::public.m2_motivo_revisao, v.predio_id,
           null, v.area_privativa, null, v.selo_area, null, null,
           v.data_transacao, u.complemento, v.valor_total, v.m2_privativo
      from public.m2_vendas_consolidadas v
      join public.m2_unidades u on u.id = v.unidade_id
     where v.fora_da_curva and not v.marcado_manual
  ),
  filtrados as (
    select i.*, p.logradouro, p.numero, b.nome as bairro_nome, p.fator_predio, coalesce(vd.qtd, 0) as vendas_janela,
           row_number() over (partition by i.motivo order by coalesce(vd.qtd, 0) desc, p.logradouro, i.item_id) as posicao,
           count(*) over (partition by i.motivo) as total_motivo
      from itens i
      join public.m2_predios p on p.id = i.predio_id
      join public.m2_bairros b on b.id = p.bairro_id
      left join vendas vd on vd.predio_id = i.predio_id
     where (m2_fila_revisao.bairro is null or p.bairro_id = m2_fila_revisao.bairro)
       and (m2_fila_revisao.motivo is null or i.motivo = m2_fila_revisao.motivo)
  )
  select f.tipo, f.item_id, f.motivo, f.predio_id, f.logradouro, f.numero, f.bairro_nome, f.vendas_janela,
         f.area_iptu, f.area_privativa, f.fator, f.fator_predio, f.selo, f.areas_anuncios, f.areas_editais,
         f.data_venda, f.unidade, f.valor_total, f.m2_privativo, f.total_motivo
    from filtrados f
   where f.posicao > greatest(coalesce(deslocamento, 0), 0)
     and f.posicao <= greatest(coalesce(deslocamento, 0), 0) + least(greatest(coalesce(limite, 20), 1), 100)
   order by f.motivo, f.posicao;
$$;

revoke all on function public.m2_fila_revisao(integer, public.m2_motivo_revisao, integer, integer, integer) from public, anon;
grant execute on function public.m2_fila_revisao(integer, public.m2_motivo_revisao, integer, integer, integer) to authenticated, service_role;
