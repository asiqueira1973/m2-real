-- =============================================================================
-- Fechou por Quanto — funções de apoio à ingestão do ITBI (épico 8.3).
-- Todas só para o pipeline (service role): sem execute para anon/authenticated.
-- Recebem listas grandes no corpo do RPC (POST), o que evita o limite de URL do PostgREST.
-- Divergência declarada em plans/8.3-itbi.md (a 7.4 não lista estas funções).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- m2_unidades_por_sql(sqls) (regras 11.2 passo 2 e 11.14; seção 9.2)
-- O que faz: devolve unidade, prédio e bairro do prédio de cada SQL informado que existe no IPTU.
-- Recebe: lista de SQLs (11 dígitos). Devolve: uma linha por SQL encontrado.
-- -----------------------------------------------------------------------------
create function public.m2_unidades_por_sql(sqls text[])
returns table (sql text, unidade_id uuid, predio_id uuid, bairro_id smallint)
language sql
stable
set search_path = ''
as $$
  select u.sql::text, u.id, u.predio_id, p.bairro_id
  from public.m2_unidades u
  join public.m2_predios p on p.id = u.predio_id
  where u.sql = any (sqls::char(11)[]);
$$;

-- -----------------------------------------------------------------------------
-- m2_itbi_substituir_ano(ano, execucao_id, hashes) (regra 11.1; seção 7.5; seção 12)
-- O que faz, ao fim de uma carga concluída de um ano do ITBI:
--   1. apaga as guias daquele ano (mes_referencia) vindas de outra execução cujo hash não
--      está no arquivo novo — e, antes, as vendas consolidadas que apontam para elas
--      (a venda deixa de existir na fonte; a 8.6 recalcula as demais);
--   2. marca como "substituida" as execuções "concluida" anteriores do mesmo ano.
-- É a única exclusão física do sistema (7.5). Só roda se a carga terminou (seção 12).
-- Recebe: ano, id da execução nova e os hashes das guias do arquivo novo (10 bairros).
-- Devolve: quantas guias foram apagadas.
-- -----------------------------------------------------------------------------
create function public.m2_itbi_substituir_ano(ano integer, execucao_id uuid, hashes text[])
returns integer
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_apagadas integer;
begin
  create temporary table m2_tmp_guias_removidas on commit drop as
    select t.id
    from public.m2_transacoes t
    where t.mes_referencia >= make_date(m2_itbi_substituir_ano.ano, 1, 1)
      and t.mes_referencia <  make_date(m2_itbi_substituir_ano.ano + 1, 1, 1)
      and t.execucao_id <> m2_itbi_substituir_ano.execucao_id
      and not (t.hash_linha = any (m2_itbi_substituir_ano.hashes));

  delete from public.m2_vendas_consolidadas v
   where v.transacao_apartamento_id in (select id from m2_tmp_guias_removidas);

  delete from public.m2_transacoes t where t.id in (select id from m2_tmp_guias_removidas);
  get diagnostics v_apagadas = row_count;

  update public.m2_execucoes_ingestao e
     set status = 'substituida'
   where e.rotina = 'ingestao-itbi'
     and e.referencia = m2_itbi_substituir_ano.ano::text
     and e.status = 'concluida'
     and e.id <> m2_itbi_substituir_ano.execucao_id;

  return v_apagadas;
end;
$$;

-- -----------------------------------------------------------------------------
-- m2_ligar_transacoes_unidades() (seção 9.2: "quando o IPTU do ano seguinte trouxer o SQL,
-- a calibração liga a guia à unidade")
-- O que faz: preenche unidade_id e predio_id das guias que ainda não têm, pelo SQL.
-- Recebe: nada. Devolve: quantas guias foram ligadas. Chamada pela calibração (8.6).
-- -----------------------------------------------------------------------------
create function public.m2_ligar_transacoes_unidades()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_ligadas integer;
begin
  update public.m2_transacoes t
     set unidade_id = u.id,
         predio_id  = u.predio_id
    from public.m2_unidades u
   where t.unidade_id is null
     and u.sql = t.sql;
  get diagnostics v_ligadas = row_count;
  return v_ligadas;
end;
$$;

revoke all on function public.m2_unidades_por_sql(text[]) from public, anon, authenticated;
revoke all on function public.m2_itbi_substituir_ano(integer, uuid, text[]) from public, anon, authenticated;
revoke all on function public.m2_ligar_transacoes_unidades() from public, anon, authenticated;
grant execute on function public.m2_unidades_por_sql(text[]) to service_role;
grant execute on function public.m2_itbi_substituir_ano(integer, uuid, text[]) to service_role;
grant execute on function public.m2_ligar_transacoes_unidades() to service_role;
