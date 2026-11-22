-- Épico 8.6: gravação da calibração (regras 11.9, 11.10, 11.11; 7.2 calibracoes e fatores_referencia).
begin;
select plan(12);

insert into public.m2_predios (id, chave_predio, setor, quadra, numero_condominio, bairro_id, logradouro, numero, cep, exercicio_iptu) values
  ('00000000-0000-0000-0000-0000000000e1', '999-996-99-1', '999', '996', '99-1', (select id from public.m2_bairros where slug = 'pinheiros'), 'RUA TESTE', 1, '05415011', 2099);
insert into public.m2_plantas (id, predio_id, area_iptu_referencia, qtd_unidades, area_privativa, fator, selo, fonte_area) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 132, 10, null, null, 'sem_dado', null),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e1', 160, 10, 120, 0.75, 'confirmada', 'revisao_manual');

-- Pedido: calibrar as duas (a segunda está confirmada à mão).
select is(public.m2_aplicar_calibracao_plantas(
  '[{"id":"00000000-0000-0000-0000-0000000000f1","area_privativa":94.5,"vagas_inclusas":0,"quartos":3,"fator":0.716,"selo":"calibrada","fonte_area":"pagina_condominio","faixa_erro_pct":null,"especial":false,"revisao_pendente":false,"motivo_revisao":null},
    {"id":"00000000-0000-0000-0000-0000000000f2","area_privativa":80,"vagas_inclusas":0,"quartos":3,"fator":0.5,"selo":"calibrada","fonte_area":"anuncio","faixa_erro_pct":null,"especial":false,"revisao_pendente":true,"motivo_revisao":"fator_incoerente"}]'::jsonb,
  '[{"planta_id":"00000000-0000-0000-0000-0000000000f1","area_privativa":94.5,"vagas_inclusas":0,"fator":0.716,"selo":"calibrada","fonte":"pagina_condominio","anuncios_ids":[],"editais_ids":[]},
    {"planta_id":"00000000-0000-0000-0000-0000000000f2","area_privativa":80,"vagas_inclusas":0,"fator":0.5,"selo":"calibrada","fonte":"anuncio","anuncios_ids":[],"editais_ids":[]}]'::jsonb),
  1, 'só a planta não bloqueada é atualizada');
select is((select area_privativa from public.m2_plantas where id = '00000000-0000-0000-0000-0000000000f1'), 94.5::numeric, 'grava a área calibrada');
select is((select selo::text from public.m2_plantas where id = '00000000-0000-0000-0000-0000000000f1'), 'calibrada', 'grava o selo');
select row_eq($$select area_privativa, fator, selo::text, fonte_area::text, revisao_pendente from public.m2_plantas where id = '00000000-0000-0000-0000-0000000000f2'$$,
  row(120::numeric(8,2), 0.75::numeric(5,3), 'confirmada'::text, 'revisao_manual'::text, false),
  'regra 11.11: planta confirmada em revisão manual não muda');
select is((select count(*)::int from public.m2_calibracoes where planta_id = '00000000-0000-0000-0000-0000000000f1' and autor = 'pipeline'), 1, 'mudança de área gera uma linha de histórico');
select is((select count(*)::int from public.m2_calibracoes where planta_id = '00000000-0000-0000-0000-0000000000f2'), 0, 'regra 11.11: nenhum histórico do pipeline na planta manual');

-- Repetir a mesma chamada (retry depois de resposta perdida) não muda nem duplica nada.
select is(public.m2_aplicar_calibracao_plantas(
  '[{"id":"00000000-0000-0000-0000-0000000000f1","area_privativa":94.5,"vagas_inclusas":0,"quartos":3,"fator":0.716,"selo":"calibrada","fonte_area":"pagina_condominio","faixa_erro_pct":null,"especial":false,"revisao_pendente":false,"motivo_revisao":null}]'::jsonb,
  '[{"planta_id":"00000000-0000-0000-0000-0000000000f1","area_privativa":94.5,"vagas_inclusas":0,"fator":0.716,"selo":"calibrada","fonte":"pagina_condominio","anuncios_ids":[],"editais_ids":[]}]'::jsonb),
  0, 'repetição é idempotente');
select is((select count(*)::int from public.m2_calibracoes where planta_id = '00000000-0000-0000-0000-0000000000f1'), 1, 'repetição não duplica o histórico');

-- fator_predio
select is(public.m2_atualizar_fator_predio(array['00000000-0000-0000-0000-0000000000e1']::uuid[], array[0.716]::numeric[]), 1, 'grava fator_predio');

-- Fatores de referência: troca a tabela inteira.
select is(public.m2_substituir_fatores_referencia(
  '[{"bairro_id":null,"decada_construcao":null,"vagas_cadastro_proprio":true,"fator_mediano":0.72,"fator_p25":0.7,"fator_p75":0.75,"qtd_plantas":8}]'::jsonb), 1, 'insere os grupos');
select is((select count(*)::int from public.m2_fatores_referencia), 1, 'a tabela fica só com os grupos novos');

select ok(not has_function_privilege('authenticated', 'public.m2_aplicar_calibracao_plantas(jsonb,jsonb)', 'execute')
       and not has_function_privilege('anon', 'public.m2_aplicar_calibracao_plantas(jsonb,jsonb)', 'execute')
       and not has_function_privilege('authenticated', 'public.m2_atualizar_fator_predio(uuid[],numeric[])', 'execute')
       and not has_function_privilege('authenticated', 'public.m2_substituir_fatores_referencia(jsonb)', 'execute'),
  'só o pipeline (service role) executa as funções da calibração');

select * from finish();
rollback;
