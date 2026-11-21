-- Épico 8.1, critério 3, e funções da 7.4: revisão manual só por admin (seção 5),
-- observação obrigatória (7.4), vínculos manuais (11.11), normalização e busca (11.5).
begin;
select plan(30);

-- Fixtures (como postgres).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@m2.test'),
  ('00000000-0000-0000-0000-00000000000b', 'semperfil@m2.test');
insert into public.m2_perfis (id, email) values ('00000000-0000-0000-0000-00000000000a', 'admin@m2.test');
insert into public.m2_execucoes_ingestao (id, fonte, rotina)
values ('00000000-0000-0000-0000-0000000000e1', 'anuncio', 'coleta-anuncios');
insert into public.m2_predios (id, chave_predio, setor, quadra, numero_condominio, bairro_id, logradouro, numero, cep, exercicio_iptu) values
  ('00000000-0000-0000-0000-0000000000d1', '020-001-01', '020', '001', '01',
   (select id from public.m2_bairros where slug = 'perdizes'), 'RUA CAIUBI', 324, '05010000', 2026),
  ('00000000-0000-0000-0000-0000000000d2', '081-002-01', '081', '002', '01',
   (select id from public.m2_bairros where slug = 'pinheiros'), 'RUA JOAQUIM ANTUNES', 577, '05415010', 2026),
  ('00000000-0000-0000-0000-0000000000d3', '020-003-01', '020', '003', '01',
   (select id from public.m2_bairros where slug = 'perdizes'), 'RUA CAIUBI', 100, '05010000', 2026);
insert into public.m2_plantas (id, predio_id, area_iptu_referencia, qtd_unidades) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d2', 132, 12),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000d1', 169, 8);
insert into public.m2_unidades (id, sql, predio_id, planta_id, tipo_unidade, complemento, uso_iptu, area_construida) values
  ('00000000-0000-0000-0000-0000000000b1', '08100200011', '00000000-0000-0000-0000-0000000000d2',
   '00000000-0000-0000-0000-0000000000a1', 'apartamento', 'APTO 11', 'APARTAMENTO EM CONDOMINIO', 132);
insert into public.m2_anuncios (id, url, dominio, fonte, execucao_id, area_privativa) values
  ('00000000-0000-0000-0000-0000000000c1', 'https://www.lopes.com.br/x', 'lopes.com.br', 'pagina_condominio',
   '00000000-0000-0000-0000-0000000000e1', 94);
insert into public.m2_editais_leilao (id, url, dominio, execucao_id, origem_documento) values
  ('00000000-0000-0000-0000-0000000000f1', 'https://www.portalzuk.com.br/x', 'portalzuk.com.br',
   '00000000-0000-0000-0000-0000000000e1', 'pagina');

-- Normalização de endereço (regra 11.5).
select is(public.m2_normalizar_endereco('R. Caiubi, 324'), 'RUA CAIUBI 324', 'normaliza R. → RUA e tira pontuação');
select is(public.m2_normalizar_endereco('  av  Brigadeiro   Faria Lima '), 'AVENIDA BRIGADEIRO FARIA LIMA', 'AV → AVENIDA e espaços simples');
select is(public.m2_normalizar_endereco('Al. Santos'), 'ALAMEDA SANTOS', 'AL → ALAMEDA');
select is(public.m2_normalizar_endereco('Pça. Vilaboim'), 'PRACA VILABOIM', 'PCA (com acento) → PRACA');
select is(public.m2_normalizar_endereco('r dr arnaldo'), 'RUA DOUTOR ARNALDO', 'R e DR → RUA DOUTOR');
select is(public.m2_normalizar_endereco('Rua Prof. Cel. Min. Cap. Sen. Ver. X'),
  'RUA PROFESSOR CORONEL MINISTRO CAPITAO SENADOR VEREADOR X', 'PROF, CEL, MIN, CAP, SEN, VER expandidos');
select is(public.m2_normalizar_endereco('Rua Rui Barbosa'), 'RUA RUI BARBOSA', 'abreviação só como palavra inteira (RUI não vira RUAUI)');
select is(public.m2_normalizar_endereco('Higienópolis'), 'HIGIENOPOLIS', 'sem acento');

-- Busca de endereço (7.4; regra 11.5; critério do 8.9 antecipado no banco).
select is((select predio_id from public.m2_buscar_predio_por_endereco('rua caiubi 324') limit 1),
  '00000000-0000-0000-0000-0000000000d1'::uuid, 'buscar "rua caiubi 324" traz a Caiubi, 324 em primeiro');
select is((select count(*)::int from public.m2_buscar_predio_por_endereco('R. Caiubi, 324')), 1,
  'com número, só o número exato (Caiubi 100 fica de fora)');
select is((select count(*)::int from public.m2_buscar_predio_por_endereco('rua caiubi')), 2,
  'sem número, devolve os prédios similares (os dois da Caiubi)');
select is((select count(*)::int from public.m2_buscar_predio_por_endereco('Avenida Paulista, 1000')), 0,
  'endereço sem prédio similar devolve vazio (MCP mostra "fora da cobertura")');
select is((select count(*)::int from public.m2_buscar_predio_por_endereco('rua caiubi', 0.4, 1)), 1,
  'o limite vem do parâmetro (config/regras.ts)');

-- Não-admin: todas as funções de revisão dão erro 42501 (seção 5).
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';
select throws_ok($$select public.m2_confirmar_area_planta('00000000-0000-0000-0000-0000000000a1', 94, 1::smallint, 'anúncio Lopes')$$,
  '42501', null, 'm2_confirmar_area_planta por não-admin gera erro (8.1)');
select throws_ok($$select public.m2_casar_anuncio('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d2', null)$$,
  '42501', null, 'm2_casar_anuncio por não-admin gera erro');
select throws_ok($$select public.m2_casar_edital('00000000-0000-0000-0000-0000000000f1', null, null)$$,
  '42501', null, 'm2_casar_edital por não-admin gera erro');
select throws_ok($$select public.m2_marcar_planta_especial('00000000-0000-0000-0000-0000000000a1', true)$$,
  '42501', null, 'm2_marcar_planta_especial por não-admin gera erro');
reset role;

-- Admin.
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';
select throws_ok($$select public.m2_confirmar_area_planta('00000000-0000-0000-0000-0000000000a1', 94, 1::smallint, '   ')$$,
  '22023', null, 'admin com observação vazia gera erro (8.1)');
select throws_ok($$select public.m2_confirmar_area_planta('00000000-0000-0000-0000-0000000000a1', 94, 1::smallint, null)$$,
  '22023', null, 'admin com observação nula gera erro');
select lives_ok($$select public.m2_confirmar_area_planta('00000000-0000-0000-0000-0000000000a1', 94, 1::smallint, 'Planta conferida com a página Lopes')$$,
  'admin com observação confirma a área');
select results_eq(
  $$select area_privativa, fator, selo::text, fonte_area::text, revisao_pendente from public.m2_plantas where id = '00000000-0000-0000-0000-0000000000a1'$$,
  $$values (94.00::numeric(8,2), 0.712::numeric(5,3), 'confirmada', 'revisao_manual', false)$$,
  'planta fica confirmada, fonte revisao_manual, fator = 94/132 = 0,712 (7.4)');
select results_eq(
  $$select selo::text, fonte::text, autor, observacao from public.m2_calibracoes where planta_id = '00000000-0000-0000-0000-0000000000a1'$$,
  $$values ('confirmada', 'revisao_manual', 'admin@m2.test', 'Planta conferida com a página Lopes')$$,
  'confirmação gera linha em m2_calibracoes com o e-mail do admin (7.4)');

select is((public.m2_casar_anuncio('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d2',
            '00000000-0000-0000-0000-0000000000a1')).status_casamento::text, 'casado_planta', 'casar anúncio com planta → casado_planta');
select ok((select casado_manual from public.m2_anuncios where id = '00000000-0000-0000-0000-0000000000c1'), 'casamento manual marca casado_manual (11.11)');
select throws_ok($$select public.m2_casar_anuncio('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1')$$,
  '22023', null, 'planta de outro prédio é recusada');
select is((public.m2_casar_anuncio('00000000-0000-0000-0000-0000000000c1', null, null)).status_casamento::text, 'descartado', 'prédio nulo → descartado');

select is((public.m2_casar_edital('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d2',
            '00000000-0000-0000-0000-0000000000b1')).status_casamento::text, 'casado_unidade', 'casar edital com unidade → casado_unidade');
select is((public.m2_casar_edital('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d2', null)).status_casamento::text,
  'casado_predio', 'casar edital só com prédio → casado_predio');

select is((public.m2_marcar_planta_especial('00000000-0000-0000-0000-0000000000a2', true)).especial, true, 'admin marca planta especial');
select throws_ok($$select public.m2_marcar_outlier('00000000-0000-0000-0000-000000000999', true)$$,
  'P0002', null, 'm2_marcar_outlier em venda inexistente gera P0002');
reset role;

select * from finish();
rollback;
