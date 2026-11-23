-- Épico 8.13: teste do site, 1 busca por IP na janela (regra 11.23).
begin;
select plan(6);

insert into public.m2_predios (id, chave_predio, setor, quadra, numero_condominio, bairro_id, logradouro, numero, cep, exercicio_iptu) values
  ('00000000-0000-0000-0000-0000000005d1', '995-001-01-1', '995', '001', '01-1', (select id from public.m2_bairros where slug = 'perdizes'), 'RUA TESTE SITE', 1, '05015000', 2099),
  ('00000000-0000-0000-0000-0000000005d2', '995-001-02-1', '995', '001', '02-1', (select id from public.m2_bairros where slug = 'perdizes'), 'RUA TESTE SITE', 2, '05015000', 2099);

select is(public.m2_registra_teste_site('ip-a', '00000000-0000-0000-0000-0000000005d1', 30), true, '11.23: primeira busca do IP é permitida');
select is(public.m2_registra_teste_site('ip-a', '00000000-0000-0000-0000-0000000005d1', 30), true, '11.23: repetir o mesmo prédio não gasta');
select is(public.m2_registra_teste_site('ip-a', '00000000-0000-0000-0000-0000000005d2', 30), false, '11.23: outro prédio na janela é negado');
update public.m2_testes_site set criado_em = now() - interval '31 days' where ip_hash = 'ip-a';
select is(public.m2_registra_teste_site('ip-a', '00000000-0000-0000-0000-0000000005d2', 30), true, '11.23: depois da janela, nova busca é permitida');
select is((select count(*)::int from public.m2_testes_site where ip_hash = 'ip-a'), 1, '11.23: a linha vencida foi apagada');
select ok(not has_table_privilege('anon', 'public.m2_testes_site', 'select')
      and not has_function_privilege('authenticated', 'public.m2_registra_teste_site(text,uuid,integer)', 'execute'), '6.4: só o servidor');

select * from finish();
rollback;
