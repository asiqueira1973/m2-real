-- =============================================================================
-- Fechou por Quanto — épico 8.13: "Teste aqui" no site (regra 11.23; seções 10 e 20).
-- Uma busca por IP a cada janela (30 dias, em regras.ts). O IP nunca é guardado: só o HMAC dele.
-- =============================================================================

create table public.m2_testes_site (
  ip_hash text primary key,
  predio_id uuid not null references public.m2_predios (id) on delete cascade,
  criado_em timestamptz not null default now()
);
create index m2_testes_site_predio_idx on public.m2_testes_site (predio_id);
create index m2_testes_site_criado_em_idx on public.m2_testes_site (criado_em);

-- RLS ligado e sem política: só o servidor (service role) lê e escreve (6.4).
alter table public.m2_testes_site enable row level security;
revoke all on public.m2_testes_site from anon, authenticated;

-- -----------------------------------------------------------------------------
-- m2_registra_teste_site(ip_hash, predio_id, janela_dias) (regra 11.23)
-- O que faz: decide se este IP pode ver as vendas deste prédio. Primeira busca na janela: registra e
-- permite. Mesmo prédio de novo: permite (recarregar não gasta). Outro prédio dentro da janela: nega.
-- Apaga as linhas mais velhas que a janela (o hash não fica guardado depois dela).
-- Recebe: hash do IP, prédio e janela em dias. Devolve: verdadeiro se pode mostrar.
-- -----------------------------------------------------------------------------
create function public.m2_registra_teste_site(p_ip_hash text, p_predio_id uuid, p_janela_dias integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_t public.m2_testes_site;
begin
  perform pg_advisory_xact_lock(hashtext(p_ip_hash));
  delete from public.m2_testes_site where criado_em < now() - make_interval(days => p_janela_dias);
  select * into v_t from public.m2_testes_site where ip_hash = p_ip_hash;
  if v_t.ip_hash is null then
    insert into public.m2_testes_site (ip_hash, predio_id) values (p_ip_hash, p_predio_id);
    return true;
  end if;
  return v_t.predio_id = p_predio_id;
end;
$$;

revoke execute on function public.m2_registra_teste_site(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.m2_registra_teste_site(text, uuid, integer) to service_role;
