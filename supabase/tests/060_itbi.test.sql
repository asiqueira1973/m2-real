-- Épico 8.3: funções de apoio ao ITBI (regra 11.1; seções 7.5, 9.2 e 12).
begin;
select plan(9);

-- Fixtures (como postgres = papel do pipeline). Ano 2099 para não cruzar com dados reais.
insert into public.m2_execucoes_ingestao (id, fonte, rotina, referencia, status) values
  ('00000000-0000-0000-0000-0000000000e1', 'itbi', 'ingestao-itbi', '2099', 'concluida'),
  ('00000000-0000-0000-0000-0000000000e2', 'itbi', 'ingestao-itbi', '2099', 'em_andamento');
insert into public.m2_predios (id, chave_predio, setor, quadra, numero_condominio, bairro_id, logradouro, numero, cep, exercicio_iptu)
values ('00000000-0000-0000-0000-0000000000d1', '999-999-99-9', '999', '999', '99-9',
        (select id from public.m2_bairros where slug = 'pinheiros'), 'RUA TESTE', 1, '05415011', 2099);
insert into public.m2_unidades (id, sql, predio_id, tipo_unidade, uso_iptu, area_construida)
values ('00000000-0000-0000-0000-0000000000b1', '99999999991', '00000000-0000-0000-0000-0000000000d1', 'apartamento', 'Apartamento em condomínio', 100);

-- Duas guias da carga anterior (e1): uma continua no arquivo novo (h-fica), outra sumiu (h-some).
-- Uma guia sem unidade ligada (SQL que só aparece depois no IPTU, seção 9.2).
insert into public.m2_transacoes (id, hash_linha, execucao_id, sql, bairro_id, origem_bairro, logradouro, natureza, eh_compra_venda, data_transacao, mes_referencia, valor_declarado) values
  ('00000000-0000-0000-0000-000000000071', 'h-fica', '00000000-0000-0000-0000-0000000000e1', '99999999991', (select id from public.m2_bairros where slug = 'pinheiros'), 'campo', 'R TESTE', '1.Compra e venda', true, '2099-01-10', '2099-01-01', 100),
  ('00000000-0000-0000-0000-000000000072', 'h-some', '00000000-0000-0000-0000-0000000000e1', '99999999991', (select id from public.m2_bairros where slug = 'pinheiros'), 'campo', 'R TESTE', '1.Compra e venda', true, '2099-02-10', '2099-02-01', 200),
  ('00000000-0000-0000-0000-000000000073', 'h-outro-ano', '00000000-0000-0000-0000-0000000000e1', '99999999991', (select id from public.m2_bairros where slug = 'pinheiros'), 'campo', 'R TESTE', '1.Compra e venda', true, '2098-12-10', '2098-12-01', 300);
insert into public.m2_vendas_consolidadas (transacao_apartamento_id, predio_id, unidade_id, data_transacao, valor_apartamento, valor_total, selo_area, m2_iptu)
values ('00000000-0000-0000-0000-000000000072', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '2099-02-10', 200, 200, 'sem_dado', 2);

-- m2_unidades_por_sql (11.2 passo 2)
select results_eq($$select unidade_id, bairro_id::int from public.m2_unidades_por_sql(array['99999999991', '00000000000'])$$,
  $$values ('00000000-0000-0000-0000-0000000000b1'::uuid, (select id::int from public.m2_bairros where slug = 'pinheiros'))$$,
  'm2_unidades_por_sql devolve unidade e bairro do prédio dos SQLs que existem');

-- m2_ligar_transacoes_unidades (9.2)
select is(public.m2_ligar_transacoes_unidades() >= 3, true, 'liga as guias sem unidade pelo SQL');
select is((select unidade_id from public.m2_transacoes where id = '00000000-0000-0000-0000-000000000071'),
  '00000000-0000-0000-0000-0000000000b1'::uuid, 'guia passa a apontar para a unidade');

-- m2_itbi_substituir_ano (11.1): o arquivo novo de 2099 só traz h-fica
select is(public.m2_itbi_substituir_ano(2099, '00000000-0000-0000-0000-0000000000e2', array['h-fica']), 1, 'apaga 1 guia (h-some)');
select is((select array_agg(hash_linha order by hash_linha) from public.m2_transacoes where execucao_id = '00000000-0000-0000-0000-0000000000e1'),
  array['h-fica', 'h-outro-ano'], 'mantém a guia que veio no arquivo novo e a de outro ano');
select is((select count(*)::int from public.m2_vendas_consolidadas where transacao_apartamento_id = '00000000-0000-0000-0000-000000000072'), 0,
  'a venda consolidada da guia apagada sai junto');
select is((select status::text from public.m2_execucoes_ingestao where id = '00000000-0000-0000-0000-0000000000e1'), 'substituida',
  'execução anterior do ano vira substituida (seção 12)');

-- Só o pipeline executa (seção 5)
select ok(not has_function_privilege('authenticated', 'public.m2_itbi_substituir_ano(integer,uuid,text[])', 'execute'),
  'authenticated não executa m2_itbi_substituir_ano');
select ok(not has_function_privilege('anon', 'public.m2_unidades_por_sql(text[])', 'execute'),
  'anon não executa m2_unidades_por_sql');

select * from finish();
rollback;
