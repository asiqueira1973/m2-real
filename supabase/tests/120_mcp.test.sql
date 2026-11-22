-- Épico 8.9: m2_mediana_bairro (ferramenta m2_bairro da 13.2; regra 11.17; princípio 1).
begin;
select plan(8);

-- Bairro de teste isolado (não interfere nos 10 bairros reais nem é afetado por eles).
insert into public.m2_bairros (nome, slug, prefixos_cep, padroes_nome) values ('Bairro Teste MCP', 'teste-mcp', '{}', '{}');
insert into public.m2_predios (id, chave_predio, setor, quadra, numero_condominio, bairro_id, logradouro, numero, cep, exercicio_iptu) values
  ('00000000-0000-0000-0000-0000000003d1', '996-001-01-1', '996', '001', '01-1', (select id from public.m2_bairros where slug = 'teste-mcp'), 'RUA TESTE MCP', 1, '05015000', 2099);
insert into public.m2_plantas (id, predio_id, area_iptu_referencia, qtd_unidades, quartos) values
  ('00000000-0000-0000-0000-0000000003f1', '00000000-0000-0000-0000-0000000003d1', 100, 10, 2),
  ('00000000-0000-0000-0000-0000000003f2', '00000000-0000-0000-0000-0000000003d1', 150, 10, 3);
insert into public.m2_unidades (id, sql, predio_id, planta_id, tipo_unidade, uso_iptu, area_construida) values
  ('00000000-0000-0000-0000-0000000003e1', '99600101011', '00000000-0000-0000-0000-0000000003d1', '00000000-0000-0000-0000-0000000003f1', 'apartamento', 'x', 100);
insert into public.m2_execucoes_ingestao (id, rotina, fonte) values ('00000000-0000-0000-0000-0000000003c1', 'ingestao-itbi', 'itbi');
-- Seis vendas: 3 válidas (calibrada 10.000, estimada 12.000 com vaga inclusa, confirmada 14.000 de 3 quartos)
-- e 3 que a 11.17 exclui (fora da curva, sem_dado, fora da janela).
with v(n, m2, selo, fora, dias, planta, vagas) as (values
  (1, 10000, 'calibrada', false, 30, '00000000-0000-0000-0000-0000000003f1', 0),
  (2, 12000, 'estimada', false, 60, '00000000-0000-0000-0000-0000000003f1', 1),
  (3, 14000, 'confirmada', false, 90, '00000000-0000-0000-0000-0000000003f2', 0),
  (4, 99000, 'calibrada', true, 30, '00000000-0000-0000-0000-0000000003f1', 0),
  (5, 1000, 'sem_dado', false, 30, '00000000-0000-0000-0000-0000000003f1', 0),
  (6, 50000, 'calibrada', false, 1000, '00000000-0000-0000-0000-0000000003f1', 0)),
t as (
  insert into public.m2_transacoes (hash_linha, execucao_id, sql, unidade_id, predio_id, bairro_id, origem_bairro, logradouro, natureza, eh_compra_venda, data_transacao, valor_declarado, mes_referencia)
  select 'mcp-' || n, '00000000-0000-0000-0000-0000000003c1', '99600101011', '00000000-0000-0000-0000-0000000003e1', '00000000-0000-0000-0000-0000000003d1',
         (select id from public.m2_bairros where slug = 'teste-mcp'), 'iptu', 'RUA TESTE MCP', '1.Compra e venda', true, current_date - dias, m2 * 100, date_trunc('month', current_date - dias)::date
    from v returning id, hash_linha, data_transacao
)
insert into public.m2_vendas_consolidadas (transacao_apartamento_id, predio_id, unidade_id, planta_id, data_transacao, valor_apartamento, valor_vagas, valor_total, qtd_vagas_separadas, area_privativa, m2_privativo, selo_area, vagas_inclusas_area, m2_iptu, fora_da_curva)
select t.id, '00000000-0000-0000-0000-0000000003d1', '00000000-0000-0000-0000-0000000003e1', v.planta::uuid, t.data_transacao, v.m2 * 100, 0, v.m2 * 100, 0, 100, v.m2, v.selo::public.m2_selo_area, v.vagas, 7000, v.fora
  from t join v on t.hash_linha = 'mcp-' || v.n;

select results_eq($$select mediana_m2_privativo, p25, p75, n_vendas from public.m2_mediana_bairro('teste-mcp', 24, null)$$,
  $$values (12000::numeric, 11000::numeric, 13000::numeric, 3)$$, '11.17: só selo ≥ estimada, sem fora da curva, na janela; percentis lineares');
select is((select distribuicao_selos from public.m2_mediana_bairro('teste-mcp', 24, null)), '{"calibrada": 1, "estimada": 1, "confirmada": 1}'::jsonb,
  'princípio 1: distribuição por selo junto com a mediana');
select is((select com_vagas_inclusas from public.m2_mediana_bairro('teste-mcp', 24, null)), 1, '11.17: informa vendas com vagas inclusas na área');
select is((select n_vendas from public.m2_mediana_bairro('teste-mcp', 60, null)), 4, 'janela maior inclui a venda antiga');
select is((select mediana_m2_privativo from public.m2_mediana_bairro('teste-mcp', 24, 3)), 14000::numeric, 'filtro de quartos usa os quartos da planta');
select is((select count(*)::int from public.m2_mediana_bairro('bairro-que-nao-existe', 24, null)), 0, 'slug desconhecido: nenhuma linha');
select ok(not has_function_privilege('anon', 'public.m2_mediana_bairro(text,integer,integer)', 'execute')
       and not has_function_privilege('authenticated', 'public.m2_mediana_bairro(text,integer,integer)', 'execute'), 'só o servidor (service role) executa');
select ok(has_function_privilege('service_role', 'public.m2_mediana_bairro(text,integer,integer)', 'execute'), 'service role executa');

select * from finish();
rollback;
