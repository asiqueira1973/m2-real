-- Épico 8.1, critério 2: RLS (spec 6.4 e 22). Papéis: anon, authenticated sem perfil,
-- authenticated com perfil admin inativo e admin ativo.
begin;
select plan(14);

-- Fixtures (como postgres, que ignora RLS — o mesmo papel do pipeline/service role).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@m2.test'),
  ('00000000-0000-0000-0000-00000000000b', 'semperfil@m2.test'),
  ('00000000-0000-0000-0000-00000000000c', 'inativo@m2.test');
insert into public.m2_perfis (id, email, papel, ativo) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@m2.test', 'admin', true),
  ('00000000-0000-0000-0000-00000000000c', 'inativo@m2.test', 'admin', false);
insert into public.m2_predios (id, chave_predio, setor, quadra, numero_condominio, bairro_id, logradouro, numero, cep, exercicio_iptu)
values ('00000000-0000-0000-0000-0000000000d1', '020-001-01', '020', '001', '01',
        (select id from public.m2_bairros where slug = 'perdizes'), 'RUA CAIUBI', 324, '05010000', 2026);
insert into public.m2_plantas (id, predio_id, area_iptu_referencia, qtd_unidades)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', 169, 8);

-- anon: recebe 0 linhas (sem política para anon) e não escreve.
set local role anon;
select is((select count(*)::int from public.m2_predios), 0, 'anon recebe 0 linhas em m2_predios (8.1)');
select is((select count(*)::int from public.m2_bairros), 0, 'anon recebe 0 linhas em m2_bairros');
select throws_ok($$update public.m2_plantas set especial = true$$, '42501', null, 'anon não faz update em m2_plantas');
reset role;

-- authenticated sem perfil: 0 linhas.
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';
select is((select count(*)::int from public.m2_predios), 0, 'autenticado sem perfil recebe 0 linhas em m2_predios (8.1)');
select ok(not public.m2_eh_admin(), 'm2_eh_admin() é falso para quem não tem perfil');
select is((select count(*)::int from public.m2_perfis), 0, 'autenticado sem perfil não vê perfis de ninguém');
reset role;

-- authenticated com perfil admin inativo: 0 linhas (6.1: só admin ativo).
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}';
select is((select count(*)::int from public.m2_predios), 0, 'admin inativo recebe 0 linhas em m2_predios (6.1)');
select is((select count(*)::int from public.m2_perfis), 1, 'admin inativo lê só a própria linha de perfil (m2_perfis_leitura_propria)');
reset role;

-- admin ativo: recebe as linhas, mas não escreve direto em plantas (só pelas funções, 6.4).
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select ok(public.m2_eh_admin(), 'm2_eh_admin() é verdadeiro para admin ativo');
-- Independente do conteúdo do banco local (pode ter a carga real do IPTU): confere que o admin
-- vê a linha da fixture. (As asserções de "0 linhas" acima valem para a tabela inteira.)
select is((select count(*)::int from public.m2_predios where id = '00000000-0000-0000-0000-0000000000d1'), 1, 'admin recebe as linhas de m2_predios (8.1)');
select is((select count(*)::int from public.m2_bairros), 10, 'admin vê os 10 bairros');
select throws_ok($$update public.m2_plantas set especial = true$$, '42501', null,
  'admin não faz update direto em m2_plantas (só via funções, 6.4)');
select is((select array_agg(email) from public.m2_perfis), array['admin@m2.test'], 'admin lê só o próprio perfil (6.4)');
select throws_ok($$insert into public.m2_perfis (id, email) values ('00000000-0000-0000-0000-00000000000b', 'x@m2.test')$$,
  '42501', null, 'ninguém cria perfil pela API (6.2: só por seed/SQL)');
reset role;

select * from finish();
rollback;
