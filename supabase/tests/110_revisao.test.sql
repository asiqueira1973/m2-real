-- Épico 8.8: fila de revisão (critério 1) e chaves de API pela sessão do admin (critério 5; 6.3, 6.4).
begin;
select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000002a1', 'admin-revisao@m2.test'),
  ('00000000-0000-0000-0000-0000000002b1', 'semperfil-revisao@m2.test');
insert into public.m2_perfis (id, email, papel, ativo) values
  ('00000000-0000-0000-0000-0000000002a1', 'admin-revisao@m2.test', 'admin', true);

-- Dois prédios num setor de teste (997): o "movimentado" tem mais vendas e deve vir antes.
insert into public.m2_predios (id, chave_predio, setor, quadra, numero_condominio, bairro_id, logradouro, numero, cep, exercicio_iptu) values
  ('00000000-0000-0000-0000-0000000002d1', '997-001-01-1', '997', '001', '01-1', (select id from public.m2_bairros where slug = 'perdizes'), 'RUA MOVIMENTADA REVISAO', 1, '05015000', 2099),
  ('00000000-0000-0000-0000-0000000002d2', '997-001-02-1', '997', '001', '02-1', (select id from public.m2_bairros where slug = 'perdizes'), 'RUA CALMA REVISAO', 2, '05015000', 2099);
insert into public.m2_plantas (id, predio_id, area_iptu_referencia, qtd_unidades, revisao_pendente, motivo_revisao) values
  ('00000000-0000-0000-0000-0000000002f1', '00000000-0000-0000-0000-0000000002d1', 132, 10, true, 'fator_incoerente'),
  ('00000000-0000-0000-0000-0000000002f2', '00000000-0000-0000-0000-0000000002d2', 80, 10, true, 'fator_incoerente'),
  ('00000000-0000-0000-0000-0000000002f3', '00000000-0000-0000-0000-0000000002d2', 200, 1, true, 'planta_especial');
insert into public.m2_unidades (id, sql, predio_id, planta_id, tipo_unidade, uso_iptu, area_construida) values
  ('00000000-0000-0000-0000-0000000002e1', '99700101011', '00000000-0000-0000-0000-0000000002d1', '00000000-0000-0000-0000-0000000002f1', 'apartamento', 'x', 132);
insert into public.m2_execucoes_ingestao (id, rotina, fonte) values ('00000000-0000-0000-0000-0000000002c1', 'ingestao-itbi', 'itbi');
insert into public.m2_anuncios (url, dominio, fonte, execucao_id, area_privativa, predio_id, planta_id, status_casamento) values
  ('https://ex.test/revisao/a1', 'ex.test', 'anuncio', '00000000-0000-0000-0000-0000000002c1', 94, '00000000-0000-0000-0000-0000000002d1', '00000000-0000-0000-0000-0000000002f1', 'casado_planta'),
  ('https://ex.test/revisao/a2', 'ex.test', 'anuncio', '00000000-0000-0000-0000-0000000002c1', 107, '00000000-0000-0000-0000-0000000002d1', '00000000-0000-0000-0000-0000000002f1', 'casado_planta');
insert into public.m2_transacoes (id, hash_linha, execucao_id, sql, unidade_id, predio_id, bairro_id, origem_bairro, logradouro, natureza, eh_compra_venda, data_transacao, valor_declarado, mes_referencia)
select gen_random_uuid(), 'revisao-' || d, '00000000-0000-0000-0000-0000000002c1', '99700101011', '00000000-0000-0000-0000-0000000002e1',
       '00000000-0000-0000-0000-0000000002d1', (select id from public.m2_bairros where slug = 'perdizes'), 'iptu', 'RUA MOVIMENTADA REVISAO', '1.Compra e venda', true, d, 1000000, date_trunc('month', d)::date
  from (values (current_date - 10), (current_date - 20)) as x(d);
insert into public.m2_vendas_consolidadas (transacao_apartamento_id, predio_id, unidade_id, planta_id, data_transacao, valor_apartamento, valor_vagas, valor_total, qtd_vagas_separadas, selo_area, m2_iptu, fora_da_curva, marcado_manual)
select t.id, t.predio_id, t.unidade_id, '00000000-0000-0000-0000-0000000002f1', t.data_transacao, 1000000, 0, 1000000, 0, 'sem_dado', 7575,
       t.data_transacao = current_date - 10, false
  from public.m2_transacoes t where t.hash_linha like 'revisao-%';

-- admin
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-0000000002a1", "role": "authenticated"}';
select results_eq(
  $$select motivo::text, logradouro, total_motivo::int from public.m2_fila_revisao((select id from public.m2_bairros where slug = 'perdizes'), 'fator_incoerente', 24, 20, 0) where logradouro like '%REVISAO'$$,
  $$values ('fator_incoerente', 'RUA MOVIMENTADA REVISAO', 2), ('fator_incoerente', 'RUA CALMA REVISAO', 2)$$,
  'agrupada por motivo e ordenada pelo volume de vendas do prédio (critério 1)');
select is((select areas_anuncios from public.m2_fila_revisao(null, 'fator_incoerente', 24, 100, 0) where item_id = '00000000-0000-0000-0000-0000000002f1'),
  array[94, 107]::numeric[], 'traz as áreas dos anúncios casados para o resumo das evidências');
-- O banco local tem vendas fora da curva reais: percorre as páginas do grupo até achar a da fixture.
select is((select count(*)::int from generate_series(0, 49) g, lateral public.m2_fila_revisao(null, 'venda_fora_da_curva', 24, 100, g * 100) f
            where f.predio_id = '00000000-0000-0000-0000-0000000002d1'), 1,
  'vendas fora da curva não marcadas à mão entram na fila');
select is((select count(*)::int from public.m2_fila_revisao(null, 'fator_incoerente', 24, 1, 1) where logradouro like '%REVISAO'), 1, 'paginação dentro do motivo');
select ok((select count(distinct motivo) from public.m2_fila_revisao(null, null, 24, 1, 0)) >= 2, 'sem filtro de motivo: o primeiro de cada grupo');

-- Chaves de API pela sessão (RLS m2_chaves_api_insercao_admin / _atualizacao_admin; grant só em "ativa").
select lives_ok($$insert into public.m2_chaves_api (nome, prefixo, hash_chave, criada_por) values ('teste revisao', 'abcdefgh', repeat('a', 64), '00000000-0000-0000-0000-0000000002a1')$$,
  'admin cria chave (só hash e prefixo)');
update public.m2_chaves_api set ativa = false where nome = 'teste revisao';
select is((select ativa from public.m2_chaves_api where nome = 'teste revisao'), false, 'admin revoga chave (ativa = false)');
select throws_ok($$update public.m2_chaves_api set hash_chave = 'x' where nome = 'teste revisao'$$, '42501', null, 'o hash não pode ser alterado pela API');
reset role;

-- authenticated sem perfil
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-0000000002b1", "role": "authenticated"}';
select is((select count(*)::int from public.m2_fila_revisao(null, null, 24, 100, 0)), 0, 'sem perfil: fila vazia');
select throws_ok($$insert into public.m2_chaves_api (nome, prefixo, hash_chave, criada_por) values ('intruso', 'zzzzzzzz', repeat('b', 64), '00000000-0000-0000-0000-0000000002b1')$$,
  '42501', null, 'sem perfil: não cria chave');
reset role;

select ok(not has_function_privilege('anon', 'public.m2_fila_revisao(integer,public.m2_motivo_revisao,integer,integer,integer)', 'execute'), 'anon não executa a fila');

select * from finish();
rollback;
