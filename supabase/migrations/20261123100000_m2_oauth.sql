-- =============================================================================
-- Fechou por Quanto — épico 8.10: MCP com OAuth 2.1 e cadastro aberto (seções 5, 6.3, 6.4, 6.5;
-- regras 11.18 e 11.19). Mesmo desenho do Assina: cliente público registrado sozinho (RFC 7591),
-- código de autorização de 10 min com PKCE S256 e troca por um token `fpq_mcp_…` que só existe
-- como hash e vale até ser revogado. As contas de cliente entram com Google e ficam fora do
-- Supabase Auth (o painel continua só para admin).
-- Nenhuma tabela é lida pelo anon ou pelo authenticated: só o servidor (service role) escreve e lê;
-- o admin vê as contas pela função m2_clientes_mcp().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------

-- Conta de cliente MCP (seção 5): identificada pelo `sub` do Google. Sem nome nem foto (princípio 4).
create table public.m2_clientes (
  id uuid primary key default gen_random_uuid(),
  google_sub text not null unique,
  email text not null,
  bloqueado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index m2_clientes_criado_em_idx on public.m2_clientes (criado_em);

-- Cliente OAuth registrado sozinho (RFC 7591): o app que conecta (Claude, ChatGPT…), não a pessoa.
create table public.m2_oauth_clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  redirect_uris text[] not null,
  criado_em timestamptz not null default now()
);

-- Token de acesso do MCP (6.3): só o hash; vale até ser revogado ou a conta ser bloqueada.
create table public.m2_tokens_mcp (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.m2_clientes (id) on delete cascade,
  oauth_cliente_id uuid references public.m2_oauth_clientes (id) on delete set null,
  prefixo text not null,
  hash_token text not null unique,
  revogado_em timestamptz,
  ultimo_uso_em timestamptz,
  criado_em timestamptz not null default now()
);
create index m2_tokens_mcp_cliente_idx on public.m2_tokens_mcp (cliente_id);
create index m2_tokens_mcp_oauth_cliente_idx on public.m2_tokens_mcp (oauth_cliente_id);

-- Código de autorização (6.4, passo 4): hash, 10 min, PKCE. token_id: o token que ele gerou, para
-- revogar se o código for reapresentado (RFC 9700).
create table public.m2_oauth_codigos (
  codigo_hash text primary key,
  oauth_cliente_id uuid not null references public.m2_oauth_clientes (id) on delete cascade,
  cliente_id uuid not null references public.m2_clientes (id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  expira_em timestamptz not null,
  usado_em timestamptz,
  token_id uuid references public.m2_tokens_mcp (id) on delete set null,
  criado_em timestamptz not null default now()
);
create index m2_oauth_codigos_oauth_cliente_idx on public.m2_oauth_codigos (oauth_cliente_id);
create index m2_oauth_codigos_cliente_idx on public.m2_oauth_codigos (cliente_id);
create index m2_oauth_codigos_token_idx on public.m2_oauth_codigos (token_id);
create index m2_oauth_codigos_expira_idx on public.m2_oauth_codigos (expira_em);

-- Contagem de chamadas por token e por minuto (regra 11.19).
create table public.m2_uso_mcp (
  token_id uuid not null references public.m2_tokens_mcp (id) on delete cascade,
  janela timestamptz not null,
  chamadas integer not null default 0,
  primary key (token_id, janela)
);
create index m2_uso_mcp_janela_idx on public.m2_uso_mcp (janela);

create trigger m2_clientes_atualizado_em before update on public.m2_clientes
  for each row execute function public.m2_atualizar_atualizado_em();

-- RLS ligado e nenhuma política: anon e authenticated não leem nem escrevem (6.4).
alter table public.m2_clientes enable row level security;
alter table public.m2_oauth_clientes enable row level security;
alter table public.m2_tokens_mcp enable row level security;
alter table public.m2_oauth_codigos enable row level security;
alter table public.m2_uso_mcp enable row level security;
revoke all on public.m2_clientes, public.m2_oauth_clientes, public.m2_tokens_mcp, public.m2_oauth_codigos, public.m2_uso_mcp
  from anon, authenticated;

-- -----------------------------------------------------------------------------
-- m2_entra_cliente(sub, email, limite_novos_dia) (regra 11.18; seção 6.5, passo 2)
-- O que faz: entrada pelo Google. Conta existente: atualiza o e-mail e entra (bloqueada não entra).
-- Conta nova: só se nas últimas 24 h foram criadas menos de `limite_novos_dia` contas; a trava
-- consultiva impede que dois cadastros simultâneos passem do limite.
-- Recebe: sub e e-mail do Google, limite diário. Devolve: (cliente_id, situacao), com situacao
-- 'existente' | 'nova' | 'bloqueada' | 'pausado' (cliente_id nulo em 'pausado').
-- -----------------------------------------------------------------------------
create function public.m2_entra_cliente(p_sub text, p_email text, p_limite_novos_dia integer)
returns table (cliente_id uuid, situacao text)
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.m2_clientes;
begin
  select * into v_c from public.m2_clientes where google_sub = p_sub;
  if v_c.id is not null then
    if v_c.bloqueado_em is not null then
      return query select v_c.id, 'bloqueada'::text;
      return;
    end if;
    update public.m2_clientes set email = p_email where id = v_c.id and email is distinct from p_email;
    return query select v_c.id, 'existente'::text;
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('m2_entra_cliente'));
  if (select count(*) from public.m2_clientes where criado_em > now() - interval '24 hours') >= p_limite_novos_dia then
    return query select null::uuid, 'pausado'::text;
    return;
  end if;
  insert into public.m2_clientes (google_sub, email) values (p_sub, p_email)
  on conflict (google_sub) do update set email = excluded.email
  returning * into v_c;
  return query select v_c.id, 'nova'::text;
end;
$$;

-- -----------------------------------------------------------------------------
-- m2_cria_codigo_oauth: "Permitir" na tela de consentimento (6.5, passo 4). Confere que o
-- redirect_uri é exatamente um dos registrados, que o code_challenge é um S256 e que a conta não
-- está bloqueada; grava o código (hash). Aproveita para apagar códigos vencidos há mais de 1 dia.
-- Recebe: hash do código, cliente OAuth, conta, redirect_uri, code_challenge e validade (s).
-- Lança: 'invalid_client', 'invalid_request' ou 'access_denied' (conta bloqueada).
-- -----------------------------------------------------------------------------
create function public.m2_cria_codigo_oauth(
  p_codigo_hash text, p_oauth_cliente_id uuid, p_cliente_id uuid, p_redirect_uri text, p_code_challenge text, p_validade_s integer
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uris text[];
begin
  select redirect_uris into v_uris from public.m2_oauth_clientes where id = p_oauth_cliente_id;
  if v_uris is null then
    raise exception 'invalid_client';
  end if;
  if not (p_redirect_uri = any (v_uris)) or p_code_challenge !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'invalid_request';
  end if;
  if not exists (select 1 from public.m2_clientes where id = p_cliente_id and bloqueado_em is null) then
    raise exception 'access_denied';
  end if;
  delete from public.m2_oauth_codigos where expira_em < now() - interval '1 day';
  insert into public.m2_oauth_codigos (codigo_hash, oauth_cliente_id, cliente_id, redirect_uri, code_challenge, expira_em)
  values (p_codigo_hash, p_oauth_cliente_id, p_cliente_id, p_redirect_uri, p_code_challenge, now() + make_interval(secs => p_validade_s));
end;
$$;

-- -----------------------------------------------------------------------------
-- m2_troca_codigo_oauth: POST /oauth/token (6.5, passo 5), com o código travado (duas trocas ao
-- mesmo tempo não geram dois tokens). Confere: existe, não usado, não vencido, mesmo cliente OAuth,
-- mesmo redirect_uri, PKCE (o servidor manda o S256 do code_verifier) e conta não bloqueada.
-- Queima o código e cria o token. Código já usado: revoga o token que ele gerou (RFC 9700).
-- Não lança exceção: devolve nulo (invalid_grant), para a revogação do reuso ser gravada.
-- Recebe: hash do código, cliente OAuth, redirect_uri, S256 do verifier, hash e prefixo do token.
-- Devolve: o id da conta, ou nulo.
-- -----------------------------------------------------------------------------
create function public.m2_troca_codigo_oauth(
  p_codigo_hash text, p_oauth_cliente_id uuid, p_redirect_uri text, p_challenge_do_verifier text, p_token_hash text, p_token_prefixo text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.m2_oauth_codigos;
  v_token uuid;
begin
  select * into v_c from public.m2_oauth_codigos where codigo_hash = p_codigo_hash for update;
  if v_c.codigo_hash is null then
    return null;
  end if;
  if v_c.usado_em is not null then
    update public.m2_tokens_mcp set revogado_em = now() where id = v_c.token_id and revogado_em is null;
    return null;
  end if;
  if v_c.expira_em <= now()
     or v_c.oauth_cliente_id <> p_oauth_cliente_id
     or v_c.redirect_uri is distinct from p_redirect_uri
     or v_c.code_challenge is distinct from p_challenge_do_verifier then
    return null;
  end if;
  if exists (select 1 from public.m2_clientes where id = v_c.cliente_id and bloqueado_em is not null) then
    return null;
  end if;
  insert into public.m2_tokens_mcp (cliente_id, oauth_cliente_id, prefixo, hash_token)
  values (v_c.cliente_id, p_oauth_cliente_id, p_token_prefixo, p_token_hash)
  returning id into v_token;
  update public.m2_oauth_codigos set usado_em = now(), token_id = v_token where codigo_hash = p_codigo_hash;
  return v_c.cliente_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- m2_usa_token_mcp(hash, por_minuto, por_dia) (6.3; regra 11.19)
-- O que faz: numa ida ao banco, confere o token (existe, não revogado, conta não bloqueada), aplica
-- o limite de chamadas (no minuto corrente e nas últimas 24 h), conta a chamada e grava
-- ultimo_uso_em. A trava consultiva por token serializa chamadas simultâneas do mesmo token.
-- Chamada recusada não conta. Apaga as janelas do token com mais de 2 dias.
-- Recebe: hash do token e os dois limites. Devolve: nenhuma linha se o token não vale; senão
-- (token_id, permitido, espera_s), com espera_s = segundos até liberar (0 se permitido).
-- -----------------------------------------------------------------------------
create function public.m2_usa_token_mcp(p_hash text, p_por_minuto integer, p_por_dia integer)
returns table (token_id uuid, permitido boolean, espera_s integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_token uuid;
  v_minuto timestamptz := date_trunc('minute', now());
  v_no_minuto integer;
  v_no_dia integer;
  v_mais_antiga timestamptz;
begin
  select t.id into v_token
    from public.m2_tokens_mcp t join public.m2_clientes c on c.id = t.cliente_id
   where t.hash_token = p_hash and t.revogado_em is null and c.bloqueado_em is null;
  if v_token is null then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext(v_token::text));
  select coalesce(sum(u.chamadas) filter (where u.janela = v_minuto), 0),
         coalesce(sum(u.chamadas), 0),
         min(u.janela)
    into v_no_minuto, v_no_dia, v_mais_antiga
    from public.m2_uso_mcp u
   where u.token_id = v_token and u.janela > now() - interval '24 hours';
  if v_no_dia >= p_por_dia then
    -- Libera quando a janela mais antiga das últimas 24 h sair da conta.
    return query select v_token, false, greatest(1, ceil(extract(epoch from (v_mais_antiga + interval '24 hours' + interval '1 minute' - now())))::integer);
    return;
  end if;
  if v_no_minuto >= p_por_minuto then
    return query select v_token, false, greatest(1, ceil(extract(epoch from (v_minuto + interval '1 minute' - now())))::integer);
    return;
  end if;
  insert into public.m2_uso_mcp as u (token_id, janela, chamadas) values (v_token, v_minuto, 1)
  on conflict on constraint m2_uso_mcp_pkey do update set chamadas = u.chamadas + 1;
  update public.m2_tokens_mcp set ultimo_uso_em = now() where id = v_token;
  delete from public.m2_uso_mcp where m2_uso_mcp.token_id = v_token and janela < now() - interval '2 days';
  return query select v_token, true, 0;
end;
$$;

-- -----------------------------------------------------------------------------
-- m2_clientes_mcp() (tela Chaves de API, seção "Contas conectadas"; seção 16)
-- O que faz: lista as contas de cliente com e-mail, criação, bloqueio, último uso, chamadas nas
-- últimas 24 h e tokens ativos. Só admin (m2_eh_admin()); para os demais, vazia.
-- Recebe: nada. Devolve: uma linha por conta, as mais recentes primeiro.
-- -----------------------------------------------------------------------------
create function public.m2_clientes_mcp()
returns table (
  id uuid, email text, criado_em timestamptz, bloqueado_em timestamptz,
  ultimo_uso_em timestamptz, chamadas_24h integer, tokens_ativos integer
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.email, c.criado_em, c.bloqueado_em,
         (select max(t.ultimo_uso_em) from public.m2_tokens_mcp t where t.cliente_id = c.id),
         coalesce((select sum(u.chamadas)::integer from public.m2_uso_mcp u join public.m2_tokens_mcp t on t.id = u.token_id
                    where t.cliente_id = c.id and u.janela > now() - interval '24 hours'), 0),
         (select count(*)::integer from public.m2_tokens_mcp t where t.cliente_id = c.id and t.revogado_em is null)
    from public.m2_clientes c
   where (select public.m2_eh_admin())
   order by c.criado_em desc;
$$;

-- -----------------------------------------------------------------------------
-- m2_bloqueia_cliente(id, bloquear) (seção 5: admin bloqueia uma conta de cliente)
-- O que faz: marca ou desmarca bloqueado_em. Bloqueada, a conta não entra, não autoriza e seus
-- tokens deixam de valer na hora (m2_usa_token_mcp confere a conta).
-- Recebe: id da conta e verdadeiro para bloquear. Devolve: nada. Lança 'acesso_negado' se não é admin.
-- -----------------------------------------------------------------------------
create function public.m2_bloqueia_cliente(p_cliente_id uuid, p_bloquear boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.m2_eh_admin()) then
    raise exception 'acesso_negado';
  end if;
  update public.m2_clientes
     set bloqueado_em = case when p_bloquear then coalesce(bloqueado_em, now()) else null end
   where id = p_cliente_id;
end;
$$;

revoke execute on function
  public.m2_entra_cliente(text, text, integer),
  public.m2_cria_codigo_oauth(text, uuid, uuid, text, text, integer),
  public.m2_troca_codigo_oauth(text, uuid, text, text, text, text),
  public.m2_usa_token_mcp(text, integer, integer),
  public.m2_clientes_mcp(),
  public.m2_bloqueia_cliente(uuid, boolean)
from public, anon, authenticated;

grant execute on function
  public.m2_entra_cliente(text, text, integer),
  public.m2_cria_codigo_oauth(text, uuid, uuid, text, text, integer),
  public.m2_troca_codigo_oauth(text, uuid, text, text, text, text),
  public.m2_usa_token_mcp(text, integer, integer)
to service_role;

grant execute on function public.m2_clientes_mcp(), public.m2_bloqueia_cliente(uuid, boolean) to authenticated, service_role;
