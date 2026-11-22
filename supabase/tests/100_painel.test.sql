-- Épico 8.7: leituras do painel (seção 10; 6.4). Funções SECURITY INVOKER: o RLS decide quem vê.
begin;
select plan(14);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000001a1', 'admin-painel@m2.test'),
  ('00000000-0000-0000-0000-0000000001b1', 'semperfil-painel@m2.test');
insert into public.m2_perfis (id, email, papel, ativo) values
  ('00000000-0000-0000-0000-0000000001a1', 'admin-painel@m2.test', 'admin', true);

-- Dois prédios num bairro de teste isolado (setor 998), com plantas e vendas.
insert into public.m2_predios (id, chave_predio, setor, quadra, numero_condominio, bairro_id, logradouro, numero, numeros_imovel, cep, exercicio_iptu, total_unidades_residenciais) values
  ('00000000-0000-0000-0000-0000000001d1', '998-001-01-1', '998', '001', '01-1', (select id from public.m2_bairros where slug = 'pompeia'), 'RUA TESTE PAINEL', 10, '{10,12}', '05015000', 2099, 20),
  ('00000000-0000-0000-0000-0000000001d2', '998-001-02-1', '998', '001', '02-1', (select id from public.m2_bairros where slug = 'pompeia'), 'RUA OUTRA PAINEL', 20, '{20}', '05015000', 2099, 8);
insert into public.m2_plantas (id, predio_id, area_iptu_referencia, qtd_unidades, selo, revisao_pendente, motivo_revisao) values
  ('00000000-0000-0000-0000-0000000001f1', '00000000-0000-0000-0000-0000000001d1', 100, 10, 'calibrada', false, null),
  ('00000000-0000-0000-0000-0000000001f2', '00000000-0000-0000-0000-0000000001d1', 150, 10, 'estimada', true, 'fator_incoerente'),
  ('00000000-0000-0000-0000-0000000001f3', '00000000-0000-0000-0000-0000000001d2', 80, 8, 'confirmada', false, null);
insert into public.m2_unidades (id, sql, predio_id, planta_id, tipo_unidade, uso_iptu, area_construida) values
  ('00000000-0000-0000-0000-0000000001e1', '99800101011', '00000000-0000-0000-0000-0000000001d1', '00000000-0000-0000-0000-0000000001f1', 'apartamento', 'x', 100);
insert into public.m2_execucoes_ingestao (id, rotina, fonte) values ('00000000-0000-0000-0000-0000000001c1', 'ingestao-itbi', 'itbi');
insert into public.m2_transacoes (id, hash_linha, execucao_id, sql, unidade_id, predio_id, bairro_id, origem_bairro, logradouro, natureza, eh_compra_venda, data_transacao, valor_declarado, mes_referencia)
select gen_random_uuid(), 'painel-' || d, '00000000-0000-0000-0000-0000000001c1', '99800101011', '00000000-0000-0000-0000-0000000001e1',
       '00000000-0000-0000-0000-0000000001d1', (select id from public.m2_bairros where slug = 'pompeia'), 'iptu', 'RUA TESTE PAINEL', '1.Compra e venda', true, d, 1000000, date_trunc('month', d)::date
  from (values (current_date - 30), (current_date - 400), (current_date - 1500)) as x(d);
insert into public.m2_vendas_consolidadas (transacao_apartamento_id, predio_id, unidade_id, planta_id, data_transacao, valor_apartamento, valor_vagas, valor_total, qtd_vagas_separadas, selo_area, m2_iptu)
select t.id, t.predio_id, t.unidade_id, '00000000-0000-0000-0000-0000000001f1', t.data_transacao, 1000000, 0, 1000000, 0, 'calibrada', 10000
  from public.m2_transacoes t where t.hash_linha like 'painel-%';
insert into public.m2_cobertura_bairros (bairro_id, calculado_em, vendas_24m, vendas_confirmada, vendas_calibrada, vendas_indicativa, vendas_estimada, vendas_sem_dado, pct_cobertura) values
  ((select id from public.m2_bairros where slug = 'pompeia'), now() + interval '1 day', 9, 1, 2, 3, 2, 1, 33.3);

-- admin
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-0000000001a1", "role": "authenticated"}';
select results_eq($$select logradouro, pior_selo::text, qtd_plantas, vendas_janela, revisao_pendente, total from public.m2_listar_predios(null, null, false, 'teste painel', 24, 50, 0)$$,
  $$values ('RUA TESTE PAINEL', 'estimada', 2, 2, true, 1::bigint)$$, 'admin vê o prédio: pior selo, nº de plantas, vendas em 24 meses e revisão');
select is((select count(*)::int from public.m2_listar_predios((select id from public.m2_bairros where slug = 'pompeia'), null, false, 'painel', 24, 50, 0)), 2, 'filtro por bairro + busca');
select is((select logradouro from public.m2_listar_predios(null, 'confirmada', false, 'painel', 24, 50, 0)), 'RUA OUTRA PAINEL', 'filtro pelo pior selo');
select is((select count(*)::int from public.m2_listar_predios(null, null, true, 'painel', 24, 50, 0)), 1, 'filtro "só com revisão pendente"');
select is((select logradouro from public.m2_listar_predios(null, null, false, 'R. Teste Painel, 12', 24, 50, 0)), 'RUA TESTE PAINEL', 'busca normalizada (11.5) casa por qualquer número do condomínio');
select is((select count(*)::int from public.m2_listar_predios(null, null, false, 'painel', 24, 1, 1)), 1, 'paginação: limite e deslocamento');
select is((select max(total)::int from public.m2_listar_predios(null, null, false, 'painel', 24, 1, 0)), 2, 'total do filtro vem em cada linha');
select is((select vendas_janela from public.m2_listar_predios(null, null, false, 'teste painel', 60, 50, 0)), 3, 'janela de meses é parâmetro');
select is((select pct_cobertura from public.m2_cobertura_atual() where bairro_id = (select id from public.m2_bairros where slug = 'pompeia')), 33.3::numeric,
  'cobertura atual: a última foto do bairro');
select ok((select count(*) from public.m2_ultimas_execucoes() where rotina = 'ingestao-itbi') = 1, 'uma linha por rotina');
reset role;

-- authenticated sem perfil: nada.
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-0000000001b1", "role": "authenticated"}';
select is((select count(*)::int from public.m2_listar_predios(null, null, false, null, 24, 50, 0)), 0, 'sem perfil: 0 prédios');
select is((select count(*)::int from public.m2_cobertura_atual()), 0, 'sem perfil: 0 linhas de cobertura');
reset role;

-- anon: não executa.
select ok(not has_function_privilege('anon', 'public.m2_listar_predios(integer,public.m2_selo_area,boolean,text,integer,integer,integer)', 'execute')
       and not has_function_privilege('anon', 'public.m2_cobertura_atual()', 'execute')
       and not has_function_privilege('anon', 'public.m2_ultimas_execucoes()', 'execute'), 'anon não executa as leituras do painel');
select ok(not has_function_privilege('anon', 'public.m2_listar_predios(integer,public.m2_selo_area,boolean,text,integer,integer,integer)', 'execute'), 'anon sem execute (confirmação)');

select * from finish();
rollback;
