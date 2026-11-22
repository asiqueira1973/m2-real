-- Épico 8.5: gravação de prioridade_coleta (regra 11.13).
begin;
select plan(4);

insert into public.m2_predios (id, chave_predio, setor, quadra, numero_condominio, bairro_id, logradouro, numero, cep, exercicio_iptu) values
  ('00000000-0000-0000-0000-0000000000d1', '999-997-99-1', '999', '997', '99-1', (select id from public.m2_bairros where slug = 'pinheiros'), 'RUA TESTE', 1, '05415011', 2099),
  ('00000000-0000-0000-0000-0000000000d2', '999-997-99-2', '999', '997', '99-2', (select id from public.m2_bairros where slug = 'pinheiros'), 'RUA TESTE', 2, '05415011', 2099);

select is(public.m2_atualizar_prioridades(array['00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2']::uuid[], array[40, 0]), 1,
  'atualiza só o que mudou (o 2º já tinha prioridade 0)');
select is((select prioridade_coleta from public.m2_predios where id = '00000000-0000-0000-0000-0000000000d1'), 40, 'grava a prioridade (11.13)');
select throws_ok($$select public.m2_atualizar_prioridades(array['00000000-0000-0000-0000-0000000000d1']::uuid[], array[1, 2])$$,
  '22023', null, 'listas de tamanhos diferentes → erro');
select ok(not has_function_privilege('authenticated', 'public.m2_atualizar_prioridades(uuid[],integer[])', 'execute'),
  'só o pipeline grava prioridade');

select * from finish();
rollback;
