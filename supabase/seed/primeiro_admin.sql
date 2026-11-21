-- =============================================================================
-- Primeiro admin do painel (spec seção 6.2).
-- Pré-requisito: o usuário já existe em Authentication (Supabase Studio → Add user).
-- Uso: troque o e-mail abaixo e rode no SQL Editor (ou via psql) com papel postgres.
-- O que faz: cria (ou reativa) a linha em m2_perfis com papel admin para esse usuário.
-- Erro claro se o e-mail não existir em auth.users. Não existe tela para isso no MVP.
-- =============================================================================
do $$
declare
  v_email text := 'TROQUE-PELO-EMAIL@exemplo.com';
  v_id    uuid;
begin
  select u.id into v_id from auth.users u where lower(u.email) = lower(v_email);
  if v_id is null then
    raise exception 'Usuário % não existe em auth.users. Crie-o em Authentication → Add user e rode de novo.', v_email;
  end if;

  insert into public.m2_perfis (id, email, papel, ativo)
  values (v_id, v_email, 'admin', true)
  on conflict (id) do update set papel = 'admin', ativo = true, email = excluded.email;

  raise notice 'Admin % ativo em m2_perfis.', v_email;
end;
$$;
