-- =============================================================================
-- Fechou por Quanto — mediana do bairro no banco (épico 8.9; ferramenta m2_bairro da 13.2; regra 11.17).
-- Divergência declarada em plans/8.9-mcp.md (a 7.4 não lista esta função). Motivo: trazer as vendas
-- da janela para calcular no app levava até 6 s (p95) em bairros grandes; a seção 17 pede ≤ 1,5 s.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- m2_mediana_bairro(bairro_slug, janela_meses, quartos) (regra 11.17)
-- O que faz: m² mediano do bairro = mediana de m2_privativo das vendas consolidadas (todas são de
-- compra e venda) não fora da curva, com selo ≥ estimada, na janela; com p25, p75, n, a distribuição
-- por selo e quantas têm vagas inclusas na área (princípio 1: a mediana sai com os selos).
-- Percentis por interpolação linear (percentile_cont), o mesmo método do código (server/mcp/calculos.ts).
-- Recebe: slug do bairro, janela em meses e quartos (nulo = todos; senão, só plantas com esses quartos).
-- Devolve: uma linha (nula se o slug não existe). SECURITY INVOKER; só o servidor (service role) chama.
-- -----------------------------------------------------------------------------
create function public.m2_mediana_bairro(bairro_slug text, janela_meses integer, quartos integer)
returns table (
  bairro text, mediana_m2_privativo numeric, p25 numeric, p75 numeric, n_vendas integer,
  distribuicao_selos jsonb, com_vagas_inclusas integer
)
language sql
stable
set search_path = ''
as $$
  with b as (select id, nome from public.m2_bairros where slug = bairro_slug),
  validas as (
    select v.m2_privativo, v.selo_area, v.vagas_inclusas_area
      from public.m2_vendas_consolidadas v
      join public.m2_predios p on p.id = v.predio_id
      join b on b.id = p.bairro_id
      left join public.m2_plantas pl on pl.id = v.planta_id
     where v.data_transacao >= (current_date - make_interval(months => janela_meses))
       and not v.fora_da_curva
       and v.m2_privativo is not null
       and v.selo_area in ('estimada', 'indicativa', 'calibrada', 'confirmada')  -- regra 11.17: selo ≥ estimada
       and (m2_mediana_bairro.quartos is null or pl.quartos = m2_mediana_bairro.quartos)
  )
  select b.nome,
         round((select percentile_cont(0.5) within group (order by m2_privativo) from validas)::numeric),
         round((select percentile_cont(0.25) within group (order by m2_privativo) from validas)::numeric),
         round((select percentile_cont(0.75) within group (order by m2_privativo) from validas)::numeric),
         (select count(*)::integer from validas),
         coalesce((select jsonb_object_agg(selo_area, n) from (select selo_area::text, count(*) n from validas group by 1) s), '{}'::jsonb),
         (select count(*)::integer from validas where coalesce(vagas_inclusas_area, 0) > 0)
    from b;
$$;

revoke all on function public.m2_mediana_bairro(text, integer, integer) from public, anon, authenticated;
grant execute on function public.m2_mediana_bairro(text, integer, integer) to service_role;

-- A janela por data dentro de cada prédio usa este índice; a junção por bairro passa por m2_predios_bairro_idx.
create index if not exists m2_vendas_consolidadas_data_idx on public.m2_vendas_consolidadas (data_transacao);
