-- =============================================================================
-- Fechou por Quanto — épico 8.10, ajustes do verifier (seções 6.5 e 16; regras 11.21 e 11.22).
-- A migration 20261123100000_m2_oauth.sql cita as regras pela numeração provisória 11.18 e 11.19,
-- que já existiam no spec; os números certos são 11.21 (contas novas) e 11.22 (uso do MCP).
-- 1) m2_clientes_mcp paginada (o PostgREST corta em 1.000 linhas sem aviso; CLAUDE.md).
-- 2) m2_registra_cliente_oauth: registro de cliente OAuth (RFC 7591) com limite por hora e
--    limpeza dos clientes que nunca autorizaram nada.
-- =============================================================================

drop function public.m2_clientes_mcp();

-- -----------------------------------------------------------------------------
-- m2_clientes_mcp(limite, deslocamento) (tela Chaves de API, "Contas conectadas"; seção 16)
-- O que faz: uma página das contas de cliente, as mais recentes primeiro, com e-mail, criação,
-- bloqueio, último uso, chamadas nas últimas 24 h, tokens ativos e o total de contas (para a
-- paginação). Só admin (m2_eh_admin()); para os demais, vazia.
-- Recebe: tamanho da página e deslocamento. Devolve: até `limite` linhas.
-- -----------------------------------------------------------------------------
create function public.m2_clientes_mcp(limite integer, deslocamento integer)
returns table (
  id uuid, email text, criado_em timestamptz, bloqueado_em timestamptz,
  ultimo_uso_em timestamptz, chamadas_24h integer, tokens_ativos integer, total integer
)
language sql stable security definer set search_path = '' as $$
  with pagina as (
    select c.*, count(*) over ()::integer as total
      from public.m2_clientes c
     where (select public.m2_eh_admin())
     order by c.criado_em desc, c.id
     limit limite offset deslocamento
  )
  select p.id, p.email, p.criado_em, p.bloqueado_em,
         (select max(t.ultimo_uso_em) from public.m2_tokens_mcp t where t.cliente_id = p.id),
         coalesce((select sum(u.chamadas)::integer from public.m2_uso_mcp u join public.m2_tokens_mcp t on t.id = u.token_id
                    where t.cliente_id = p.id and u.janela > now() - interval '24 hours'), 0),
         (select count(*)::integer from public.m2_tokens_mcp t where t.cliente_id = p.id and t.revogado_em is null),
         p.total
    from pagina p
   order by p.criado_em desc, p.id;
$$;

-- -----------------------------------------------------------------------------
-- m2_registra_cliente_oauth(nome, redirect_uris, limite_hora, dias_sem_uso) (6.5, passo 3)
-- O que faz: registra um cliente OAuth se, na última hora, foram registrados menos de
-- `limite_hora` (freio contra quem enche a tabela). Antes, apaga clientes com mais de
-- `dias_sem_uso` dias que nunca geraram código de autorização. A trava consultiva serializa
-- registros simultâneos. Recebe: nome, redirect_uris (já conferidos) e os dois limites.
-- Devolve: o id do cliente, ou nulo se o limite da hora estourou.
-- -----------------------------------------------------------------------------
create function public.m2_registra_cliente_oauth(p_nome text, p_redirect_uris text[], p_limite_hora integer, p_dias_sem_uso integer)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('m2_registra_cliente_oauth'));
  delete from public.m2_oauth_clientes o
   where o.criado_em < now() - make_interval(days => p_dias_sem_uso)
     and not exists (select 1 from public.m2_oauth_codigos c where c.oauth_cliente_id = o.id)
     and not exists (select 1 from public.m2_tokens_mcp t where t.oauth_cliente_id = o.id);
  if (select count(*) from public.m2_oauth_clientes where criado_em > now() - interval '1 hour') >= p_limite_hora then
    return null;
  end if;
  insert into public.m2_oauth_clientes (nome, redirect_uris) values (p_nome, p_redirect_uris) returning id into v_id;
  return v_id;
end;
$$;

create index m2_oauth_clientes_criado_em_idx on public.m2_oauth_clientes (criado_em);

revoke execute on function public.m2_clientes_mcp(integer, integer), public.m2_registra_cliente_oauth(text, text[], integer, integer)
  from public, anon, authenticated;
grant execute on function public.m2_clientes_mcp(integer, integer) to authenticated, service_role;
grant execute on function public.m2_registra_cliente_oauth(text, text[], integer, integer) to service_role;
