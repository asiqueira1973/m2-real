-- =============================================================================
-- Fechou por Quanto — apoio à coleta de anúncios (épico 8.5).
-- Divergência declarada em plans/8.5-anuncios.md (a 7.4 não lista esta função).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- m2_atualizar_prioridades(ids, prioridades) (regra 11.13)
-- O que faz: grava prioridade_coleta de vários prédios de uma vez (a prioridade é calculada
-- no código, anuncios/prioridade.ts). Um upsert parcial não serve: o INSERT do upsert exige
-- as colunas NOT NULL de m2_predios.
-- Recebe: ids dos prédios e as prioridades, na mesma ordem (corpo do RPC).
-- Devolve: quantos prédios foram atualizados. Só o pipeline (service role) executa.
-- -----------------------------------------------------------------------------
create function public.m2_atualizar_prioridades(ids uuid[], prioridades integer[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_atualizados integer;
begin
  if coalesce(array_length(ids, 1), 0) <> coalesce(array_length(prioridades, 1), 0) then
    raise exception 'ids e prioridades com tamanhos diferentes.' using errcode = '22023';
  end if;
  update public.m2_predios p
     set prioridade_coleta = x.prioridade
    from unnest(m2_atualizar_prioridades.ids, m2_atualizar_prioridades.prioridades) as x(id, prioridade)
   where p.id = x.id
     and p.prioridade_coleta is distinct from x.prioridade;
  get diagnostics v_atualizados = row_count;
  return v_atualizados;
end;
$$;

revoke all on function public.m2_atualizar_prioridades(uuid[], integer[]) from public, anon, authenticated;
grant execute on function public.m2_atualizar_prioridades(uuid[], integer[]) to service_role;
