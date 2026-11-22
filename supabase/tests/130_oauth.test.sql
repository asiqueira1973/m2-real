-- Épico 8.10: OAuth do MCP e contas de cliente (seções 6.3, 6.4, 6.5; regras 11.21 e 11.22).
begin;
select plan(29);

-- Admin para as funções do painel.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000004a1', 'admin-oauth@m2.test');
insert into public.m2_perfis (id, email, papel, ativo) values ('00000000-0000-0000-0000-0000000004a1', 'admin-oauth@m2.test', 'admin', true);

-- ---------------------------------------------------------------- 11.21: entrada e limite diário
select is((select situacao from public.m2_entra_cliente('sub-1', 'a@m2.test', 1000)), 'nova', '11.21: primeira entrada cria a conta');
select is((select situacao from public.m2_entra_cliente('sub-1', 'a2@m2.test', 1000)), 'existente', '11.21: segunda entrada reaproveita a conta');
select is((select email from public.m2_clientes where google_sub = 'sub-1'), 'a2@m2.test', 'e-mail atualizado na entrada');
select is((select situacao from public.m2_entra_cliente('sub-2', 'b@m2.test', (select count(*)::int from public.m2_clientes where criado_em > now() - interval '24 hours'))),
  'pausado', '11.21: limite diário atingido, conta nova não entra');
select is((select count(*)::int from public.m2_clientes where google_sub = 'sub-2'), 0, '11.21: nada gravado quando pausado');
select is((select situacao from public.m2_entra_cliente('sub-1', 'a2@m2.test', 0)), 'existente', '11.21: quem já tem conta entra mesmo com o limite');

-- ---------------------------------------------------------------- 6.5: código e troca
insert into public.m2_oauth_clientes (id, nome, redirect_uris) values
  ('00000000-0000-0000-0000-0000000004b1', 'Claude', '{https://claude.ai/api/mcp/auth_callback}'),
  ('00000000-0000-0000-0000-0000000004b2', 'Outro', '{https://outro.test/cb}');

select throws_ok($$select public.m2_cria_codigo_oauth('h-x', '00000000-0000-0000-0000-0000000004b1', (select id from public.m2_clientes where google_sub = 'sub-1'),
  'https://malicioso.test/cb', repeat('a', 43), 600)$$, 'invalid_request', 'redirect_uri fora da lista é recusado');
select throws_ok($$select public.m2_cria_codigo_oauth('h-x', '00000000-0000-0000-0000-0000000004b9', (select id from public.m2_clientes where google_sub = 'sub-1'),
  'https://claude.ai/api/mcp/auth_callback', repeat('a', 43), 600)$$, 'invalid_client', 'cliente OAuth inexistente é recusado');

select lives_ok($$select public.m2_cria_codigo_oauth('h-1', '00000000-0000-0000-0000-0000000004b1', (select id from public.m2_clientes where google_sub = 'sub-1'),
  'https://claude.ai/api/mcp/auth_callback', repeat('a', 43), 600)$$, 'Permitir grava o código');

select is(public.m2_troca_codigo_oauth('h-1', '00000000-0000-0000-0000-0000000004b2', 'https://claude.ai/api/mcp/auth_callback', repeat('a', 43), 'tok-x', 'fpq_mcp_x'),
  null, 'outro cliente OAuth não troca o código');
select is(public.m2_troca_codigo_oauth('h-1', '00000000-0000-0000-0000-0000000004b1', 'https://claude.ai/api/mcp/auth_callback', repeat('b', 43), 'tok-x', 'fpq_mcp_x'),
  null, 'PKCE errado não troca o código');
select is(public.m2_troca_codigo_oauth('h-1', '00000000-0000-0000-0000-0000000004b1', 'https://claude.ai/api/mcp/auth_callback', repeat('a', 43), 'tok-1', 'fpq_mcp_1'),
  (select id from public.m2_clientes where google_sub = 'sub-1'), 'troca válida devolve a conta e cria o token');
select is(public.m2_troca_codigo_oauth('h-1', '00000000-0000-0000-0000-0000000004b1', 'https://claude.ai/api/mcp/auth_callback', repeat('a', 43), 'tok-2', 'fpq_mcp_2'),
  null, 'RFC 9700: código reapresentado não gera outro token');
select isnt((select revogado_em from public.m2_tokens_mcp where hash_token = 'tok-1'), null, 'RFC 9700: e revoga o token que ele gerou');

-- Código vencido.
insert into public.m2_oauth_codigos (codigo_hash, oauth_cliente_id, cliente_id, redirect_uri, code_challenge, expira_em)
values ('h-venc', '00000000-0000-0000-0000-0000000004b1', (select id from public.m2_clientes where google_sub = 'sub-1'),
        'https://claude.ai/api/mcp/auth_callback', repeat('a', 43), now() - interval '1 second');
select is(public.m2_troca_codigo_oauth('h-venc', '00000000-0000-0000-0000-0000000004b1', 'https://claude.ai/api/mcp/auth_callback', repeat('a', 43), 'tok-v', 'fpq_mcp_v'),
  null, 'código vencido não troca');

-- ---------------------------------------------------------------- 11.22: uso do token
insert into public.m2_tokens_mcp (id, cliente_id, prefixo, hash_token) values
  ('00000000-0000-0000-0000-0000000004c1', (select id from public.m2_clientes where google_sub = 'sub-1'), 'fpq_mcp_a', 'tok-ok');
select is((select permitido from public.m2_usa_token_mcp('tok-ok', 2, 100)), true, '11.22: 1ª chamada do minuto passa');
select is((select permitido from public.m2_usa_token_mcp('tok-ok', 2, 100)), true, '11.22: 2ª chamada do minuto passa');
select is((select permitido from public.m2_usa_token_mcp('tok-ok', 2, 100)), false, '11.22: acima do limite por minuto é recusada');
select ok((select espera_s between 1 and 60 from public.m2_usa_token_mcp('tok-ok', 2, 100)), '11.22: informa quanto esperar');
select is((select chamadas from public.m2_uso_mcp where token_id = '00000000-0000-0000-0000-0000000004c1'), 2, '11.22: chamada recusada não conta');
-- Limite diário: janela antiga (dentro das 24 h) já cheia.
insert into public.m2_uso_mcp (token_id, janela, chamadas) values ('00000000-0000-0000-0000-0000000004c1', date_trunc('minute', now()) - interval '3 hours', 98);
select is((select permitido from public.m2_usa_token_mcp('tok-ok', 1000, 100)), false, '11.22: acima do limite de 24 h é recusada');
select is((select count(*)::int from public.m2_usa_token_mcp('tok-1', 1000, 1000)), 0, 'token revogado não vale');

-- ---------------------------------------------------------------- bloqueio pelo admin (seção 5)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000004a1","role":"authenticated"}', true);
select ok((select count(*) from public.m2_clientes_mcp(100, 0) where email = 'a2@m2.test') = 1, 'admin vê as contas conectadas');
select public.m2_bloqueia_cliente((select id from public.m2_clientes_mcp(100, 0) where email = 'a2@m2.test'), true);
reset role;
select is((select count(*)::int from public.m2_usa_token_mcp('tok-ok', 1000, 100000)), 0, 'conta bloqueada: o token para na hora');

-- ---------------------------------------------------------------- 6.5, passo 3: registro com freio por hora
select isnt(public.m2_registra_cliente_oauth('A', '{https://a.test/cb}', 1000, 30), null, '6.5: registro abaixo do limite da hora');
select is(public.m2_registra_cliente_oauth('B', '{https://b.test/cb}', (select count(*)::int from public.m2_oauth_clientes where criado_em > now() - interval '1 hour'), 30),
  null, '6.5: limite de registros por hora atingido → nulo');
insert into public.m2_oauth_clientes (id, nome, redirect_uris, criado_em) values ('00000000-0000-0000-0000-0000000004b7', 'Velho sem uso', '{https://v.test/cb}', now() - interval '40 days');
select public.m2_registra_cliente_oauth('C', '{https://c.test/cb}', 1000, 30);
select is((select count(*)::int from public.m2_oauth_clientes where id = '00000000-0000-0000-0000-0000000004b7'), 0, '6.5: cliente antigo que nunca autorizou é apagado');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000004a1","role":"authenticated"}', true);
select is((select count(*)::int from public.m2_clientes_mcp(1, 0)), 1, 'seção 16: contas conectadas paginadas (limite respeitado)');
reset role;

-- ---------------------------------------------------------------- 6.4: ninguém de fora lê ou executa
select ok(not has_table_privilege('authenticated', 'public.m2_tokens_mcp', 'select')
      and not has_table_privilege('anon', 'public.m2_oauth_codigos', 'select')
      and not has_function_privilege('authenticated', 'public.m2_usa_token_mcp(text,integer,integer)', 'execute')
      and not has_function_privilege('anon', 'public.m2_troca_codigo_oauth(text,uuid,text,text,text,text)', 'execute'),
  '6.4: tabelas e funções do OAuth só para o servidor');

select * from finish();
rollback;
