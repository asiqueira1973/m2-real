-- Épico 8.14: reatribuição de bairro das guias na carga forçada do ITBI (regra 11.2).
begin;
select plan(3);

insert into public.m2_execucoes_ingestao (id, rotina, fonte) values ('00000000-0000-0000-0000-0000000006c1', 'ingestao-itbi', 'itbi');
insert into public.m2_transacoes (hash_linha, execucao_id, sql, bairro_id, origem_bairro, logradouro, natureza, eh_compra_venda, data_transacao, valor_declarado, mes_referencia)
values ('zs-1', '00000000-0000-0000-0000-0000000006c1', '1', (select id from public.m2_bairros where slug = 'itaim-bibi'), 'cep', 'RUA X', '1.Compra e venda', true, current_date, 1, date_trunc('month', current_date)::date),
       ('zs-2', '00000000-0000-0000-0000-0000000006c1', '2', (select id from public.m2_bairros where slug = 'moema'), 'campo', 'RUA Y', '1.Compra e venda', true, current_date, 1, date_trunc('month', current_date)::date);

select is(public.m2_itbi_reatribuir_bairros(array['zs-1','zs-2'],
  array[(select id from public.m2_bairros where slug = 'vila-nova-conceicao'), (select id from public.m2_bairros where slug = 'moema')]::smallint[],
  array['campo','campo']::public.m2_origem_bairro[]), 1, '8.14: só a guia com bairro diferente muda');
select is((select b.slug from public.m2_transacoes t join public.m2_bairros b on b.id = t.bairro_id where t.hash_linha = 'zs-1'), 'vila-nova-conceicao', '8.14: guia do Itaim por voto passa para Vila Nova Conceição');
select ok(not has_function_privilege('authenticated', 'public.m2_itbi_reatribuir_bairros(text[],smallint[],public.m2_origem_bairro[])', 'execute'), '6.4: só o servidor');

select * from finish();
rollback;
