-- Épico 8.4: recálculo de m2_vendas_consolidadas (seções 7.2 e 7.5; regra 11.11).
begin;
select plan(6);

insert into public.m2_execucoes_ingestao (id, fonte, rotina, referencia) values ('00000000-0000-0000-0000-0000000000e1', 'itbi', 'ingestao-itbi', '2099');
insert into public.m2_predios (id, chave_predio, setor, quadra, numero_condominio, bairro_id, logradouro, numero, cep, exercicio_iptu)
values ('00000000-0000-0000-0000-0000000000d1', '999-998-99-9', '999', '998', '99-9', (select id from public.m2_bairros where slug = 'pinheiros'), 'RUA TESTE', 1, '05415011', 2099);
insert into public.m2_unidades (id, sql, predio_id, tipo_unidade, uso_iptu, area_construida)
values ('00000000-0000-0000-0000-0000000000b1', '99999899991', '00000000-0000-0000-0000-0000000000d1', 'apartamento', 'Apartamento em condomínio', 100);
insert into public.m2_transacoes (id, hash_linha, execucao_id, sql, unidade_id, predio_id, bairro_id, origem_bairro, logradouro, natureza, eh_compra_venda, data_transacao, mes_referencia, valor_declarado)
select ('00000000-0000-0000-0000-00000000007' || n)::uuid, 'h8.4-' || n, '00000000-0000-0000-0000-0000000000e1', '99999899991',
       '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', (select id from public.m2_bairros where slug = 'pinheiros'),
       'iptu', 'R TESTE', '1.Compra e venda', true, '2099-01-10', '2099-01-01', 100
from generate_series(1, 3) n;
insert into public.m2_vendas_consolidadas (transacao_apartamento_id, predio_id, unidade_id, data_transacao, valor_apartamento, valor_total, selo_area, m2_iptu, fora_da_curva, marcado_manual)
select ('00000000-0000-0000-0000-00000000007' || n)::uuid, '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1',
       '2099-01-10', 100, 100, 'sem_dado', 1, n = 3, n = 3
from generate_series(1, 3) n;

select ok((select enum_range(null::public.m2_fonte_dado)::text[] @> array['calibracao']), 'm2_fonte_dado tem o valor calibracao (decisão do usuário, 8.4)');
-- Só a venda 1 continua sendo consolidada; a 2 sumiu; a 3 foi marcada pelo admin.
select is(public.m2_vendas_remover_obsoletas(array['00000000-0000-0000-0000-000000000071'::uuid]), 1, 'apaga 1 venda obsoleta (a 2)');
select is((select array_agg(transacao_apartamento_id::text order by transacao_apartamento_id) from public.m2_vendas_consolidadas where predio_id = '00000000-0000-0000-0000-0000000000d1'),
  array['00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000073'], 'mantém a consolidada e a marcada pelo admin');
select ok((select fora_da_curva and marcado_manual from public.m2_vendas_consolidadas where transacao_apartamento_id = '00000000-0000-0000-0000-000000000073'),
  'venda marcada pelo admin continua com o valor dele (regra 11.11)');
select ok(not has_function_privilege('authenticated', 'public.m2_vendas_remover_obsoletas(uuid[])', 'execute'), 'authenticated não executa m2_vendas_remover_obsoletas');
select ok(not has_function_privilege('anon', 'public.m2_vendas_remover_obsoletas(uuid[])', 'execute'), 'anon não executa m2_vendas_remover_obsoletas');

select * from finish();
rollback;
