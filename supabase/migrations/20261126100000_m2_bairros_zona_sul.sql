-- =============================================================================
-- Fechou por Quanto — épico 8.14: quatro bairros da zona sul (tabela 11.2; regra 11.2).
-- Moema, Vila Nova Conceição, Brooklin e Campo Belo. Prefixos de CEP de 5 dígitos que cobrem 95% dos imóveis
-- com o nome do bairro no IPTU 2026
-- (plans/8.14-novos-bairros.md). O prefixo só filtra; o bairro de cada prédio/guia sai da regra 11.2.
-- Idempotente (o mesmo insert está no seed.sql, que o banco da nuvem não roda).
-- =============================================================================
insert into public.m2_bairros (nome, slug, prefixos_cep, padroes_nome) values
  ('Moema', 'moema', array['04029', '04075', '04076', '04077', '04078', '04079', '04080', '04081', '04082', '04083', '04084', '04086', '04087', '04088', '04089', '04090', '04514', '04515', '04516', '04517', '04520', '04521', '04522', '04523', '04524'], array['^MOEMA$']),
  ('Vila Nova Conceição', 'vila-nova-conceicao', array['04505', '04507', '04508', '04509', '04510', '04511', '04512', '04513', '04535', '04537', '04543', '04545'], array['^(VILA|VL\.?) NOVA CONCEICAO$']),
  ('Brooklin', 'brooklin', array['04555', '04556', '04557', '04558', '04559', '04560', '04561', '04562', '04563', '04564', '04565', '04566', '04567', '04568', '04569', '04570', '04571', '04575', '04576', '04578', '04580', '04581', '04582', '04583', '04601', '04602', '04610', '04620', '04621', '04622', '04623', '04634', '04702', '04703', '04704', '04705', '04707', '04710'], array['^BROOKLIN( PAULISTA| NOVO| VELHO| PAULISTA NOVO| PTA\.?( NOVO)?)?$']),
  ('Campo Belo', 'campo-belo', array['04601', '04602', '04603', '04605', '04606', '04607', '04608', '04609', '04610', '04611', '04612', '04613', '04614', '04615', '04616', '04617', '04618', '04619', '04620', '04624', '04625'], array['^CAMPO BELO$'])
on conflict (slug) do update
  set nome = excluded.nome,
      prefixos_cep = excluded.prefixos_cep,
      padroes_nome = excluded.padroes_nome;

-- -----------------------------------------------------------------------------
-- m2_itbi_reatribuir_bairros(hashes, bairros, origens) (épico 8.14; regra 11.2)
-- O que faz: na carga forçada do ITBI, troca o bairro e a origem das guias já gravadas quando a nova
-- atribuição é diferente (ex.: guia de Vila Nova Conceição que antes ficava no Itaim Bibi por voto).
-- Recebe: arrays paralelos de hash_linha, bairro_id e origem. Devolve: quantas guias mudaram.
-- -----------------------------------------------------------------------------
create function public.m2_itbi_reatribuir_bairros(p_hashes text[], p_bairros smallint[], p_origens public.m2_origem_bairro[])
returns integer
language sql security invoker set search_path = '' as $$
  with novo as (
    select * from unnest(p_hashes, p_bairros, p_origens) as n(hash_linha, bairro_id, origem)
  ), mudou as (
    update public.m2_transacoes t
       set bairro_id = n.bairro_id, origem_bairro = n.origem
      from novo n
     where t.hash_linha = n.hash_linha
       and (t.bairro_id is distinct from n.bairro_id or t.origem_bairro is distinct from n.origem)
    returning 1
  )
  select count(*)::integer from mudou;
$$;

revoke execute on function public.m2_itbi_reatribuir_bairros(text[], smallint[], public.m2_origem_bairro[]) from public, anon, authenticated;
grant execute on function public.m2_itbi_reatribuir_bairros(text[], smallint[], public.m2_origem_bairro[]) to service_role;
