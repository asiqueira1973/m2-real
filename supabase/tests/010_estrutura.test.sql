-- Épico 8.1: estrutura do banco (spec 7.1–7.4, 6.4) e convenção de prefixo m2_.
-- Confere que tabelas, enums, funções, triggers, RLS, políticas e grants existem como
-- especificados, e que nenhum objeto do app em public fica sem o prefixo m2_.
begin;
select plan(56);

-- 7.2: as 14 tabelas.
select has_table('public', t, 'tabela ' || t || ' existe (7.2)')
from unnest(array[
  'm2_bairros', 'm2_perfis', 'm2_execucoes_ingestao', 'm2_predios', 'm2_plantas', 'm2_unidades',
  'm2_transacoes', 'm2_vendas_consolidadas', 'm2_anuncios', 'm2_editais_leilao', 'm2_calibracoes',
  'm2_fatores_referencia', 'm2_cobertura_bairros', 'm2_chaves_api'
]) as t;

-- 7.1: os 10 enums, com os valores exatos do spec.
-- 'calibracao' acrescentado no 8.4 por decisão do usuário (fonte das execuções da rotina calibracao;
-- plans/8.4-consolidacao.md). Os demais valores são os da 7.1.
select enum_has_labels('public', 'm2_fonte_dado',
  array['itbi','iptu','anuncio','pagina_condominio','edital_leilao','revisao_manual','fator_referencia','calibracao'], 'enum m2_fonte_dado (7.1 + calibracao, 8.4)');
select enum_has_labels('public', 'm2_status_execucao', array['em_andamento','concluida','falhou','substituida'], 'enum m2_status_execucao (7.1)');
select enum_has_labels('public', 'm2_tipo_unidade', array['apartamento','vaga','outro'], 'enum m2_tipo_unidade (7.1)');
select enum_has_labels('public', 'm2_selo_area', array['confirmada','calibrada','indicativa','estimada','sem_dado'], 'enum m2_selo_area (7.1)');
select enum_has_labels('public', 'm2_status_casamento', array['casado_planta','casado_predio','ambiguo','sem_predio','descartado'], 'enum m2_status_casamento (7.1)');
select enum_has_labels('public', 'm2_finalidade_anuncio', array['venda','aluguel'], 'enum m2_finalidade_anuncio (7.1)');
select enum_has_labels('public', 'm2_origem_bairro', array['campo','cep','quadra','iptu'], 'enum m2_origem_bairro (7.1)');
select enum_has_labels('public', 'm2_papel_usuario', array['admin'], 'enum m2_papel_usuario (7.1)');
select enum_has_labels('public', 'm2_motivo_revisao',
  array['fator_incoerente','anuncios_divergentes','anuncio_ambiguo','planta_especial','venda_fora_da_curva','edital_divergente'], 'enum m2_motivo_revisao (7.1)');
select enum_has_labels('public', 'm2_status_casamento_edital', array['casado_unidade','casado_predio','sem_predio','descartado'], 'enum m2_status_casamento_edital (7.1)');

-- 7.4: funções.
select has_function('public', 'm2_eh_admin', array[]::text[], 'm2_eh_admin() existe (7.4)');
select has_function('public', 'm2_normalizar_endereco', array['text'], 'm2_normalizar_endereco existe (11.5)');
select has_function('public', 'm2_buscar_predio_por_endereco', array['text','real','integer'], 'm2_buscar_predio_por_endereco existe (7.4)');
select has_function('public', 'm2_confirmar_area_planta', array['uuid','numeric','smallint','text'], 'm2_confirmar_area_planta existe (7.4)');
select has_function('public', 'm2_casar_anuncio', array['uuid','uuid','uuid'], 'm2_casar_anuncio existe (7.4)');
select has_function('public', 'm2_casar_edital', array['uuid','uuid','uuid'], 'm2_casar_edital existe (7.4)');
select has_function('public', 'm2_marcar_outlier', array['uuid','boolean'], 'm2_marcar_outlier existe (7.4)');
select has_function('public', 'm2_marcar_planta_especial', array['uuid','boolean'], 'm2_marcar_planta_especial existe (seção 5)');
select is_definer('public', 'm2_eh_admin', array[]::text[], 'm2_eh_admin é SECURITY DEFINER (6.4)');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'm2\_%'
      and not coalesce(array_to_string(p.proconfig, ',') like '%search_path=%', false)),
  0, 'toda função m2_* tem search_path fixo (6.4)');

-- 7.4: trigger m2_atualizar_atualizado_em em toda tabela com atualizado_em.
select is(
  (select count(*)::int from information_schema.columns c
    where c.table_schema = 'public' and c.table_name like 'm2\_%' and c.column_name = 'atualizado_em'
      and not exists (select 1 from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
                      where cl.relname = c.table_name and tg.tgname = c.table_name || '_atualizado_em')),
  0, 'toda tabela com atualizado_em tem o trigger m2_<tabela>_atualizado_em (7.4)');
select is(
  (select count(*)::int from information_schema.columns c
    where c.table_schema = 'public' and c.table_name like 'm2\_%' and c.column_name = 'criado_em'),
  14, 'as 14 tabelas têm criado_em (convenção da seção 7)');

-- Convenção de prefixo m2_ (decisão do usuário): nada do app em public sem prefixo.
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','i','v','m','S') and c.relname not like 'm2\_%'),
  0, 'tabelas, índices, views e sequences em public têm prefixo m2_');
select is(
  (select count(*)::int from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typtype = 'e' and t.typname not like 'm2\_%'),
  0, 'enums em public têm prefixo m2_');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname not like 'm2\_%'),
  0, 'funções em public têm prefixo m2_');
select is(
  (select count(*)::int from pg_trigger tg join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not tg.tgisinternal and tg.tgname not like 'm2\_%'),
  0, 'triggers em public têm prefixo m2_');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and policyname not like 'm2\_%'),
  0, 'políticas em public têm prefixo m2_');

-- 6.4: RLS ligado em todas as tabelas.
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'm2\_%' and not c.relrowsecurity),
  0, 'RLS ligado em todas as tabelas m2_* (6.4)');

-- 6.4: políticas com os nomes do spec.
select policies_are('public', 'm2_predios', array['m2_predios_leitura_admin'], 'm2_predios: só leitura admin (6.4)');
select policies_are('public', 'm2_plantas', array['m2_plantas_leitura_admin'], 'm2_plantas: só leitura admin, sem update direto (6.4)');
select policies_are('public', 'm2_anuncios', array['m2_anuncios_leitura_admin'], 'm2_anuncios: só leitura admin, sem update direto (6.4)');
select policies_are('public', 'm2_editais_leilao', array['m2_editais_leilao_leitura_admin'], 'm2_editais_leilao: só leitura admin, sem update direto (6.4)');
select policies_are('public', 'm2_vendas_consolidadas', array['m2_vendas_consolidadas_leitura_admin'], 'm2_vendas_consolidadas: só leitura admin, sem update direto (6.4)');
select policies_are('public', 'm2_perfis', array['m2_perfis_leitura_propria'], 'm2_perfis: leitura própria (6.4)');
select policies_are('public', 'm2_chaves_api',
  array['m2_chaves_api_leitura_admin', 'm2_chaves_api_insercao_admin', 'm2_chaves_api_atualizacao_admin'], 'm2_chaves_api: leitura e escrita admin (6.4)');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and policyname like '%\_leitura\_admin' and cmd = 'SELECT'),
  13, '12 tabelas de dados + chaves_api com política de leitura admin (6.4)');

-- Grants: ninguém além do service role escreve, exceto o admin em m2_chaves_api (5, 6.4).
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name like 'm2\_%' and grantee in ('anon', 'authenticated')
      and privilege_type <> 'SELECT'),
  0, 'anon e authenticated sem privilégio de escrita de tabela inteira em m2_*');
select is(
  (select array_agg(distinct privilege_type::text order by privilege_type::text) from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'm2_chaves_api' and grantee = 'authenticated' and privilege_type <> 'SELECT'),
  array['INSERT', 'UPDATE'], 'authenticated só insere e atualiza colunas de m2_chaves_api');
select is(
  (select array_agg(column_name::text order by column_name) from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'm2_chaves_api' and grantee = 'authenticated' and privilege_type = 'UPDATE'),
  array['ativa'], 'authenticated só atualiza a coluna ativa de m2_chaves_api (revogar, 13.1)');
select ok(not has_function_privilege('anon', 'public.m2_confirmar_area_planta(uuid,numeric,smallint,text)', 'execute'),
  'anon não executa m2_confirmar_area_planta');

-- 7.2: unique com nulls not distinct em m2_fatores_referencia.
insert into public.m2_fatores_referencia (bairro_id, decada_construcao, vagas_cadastro_proprio, fator_mediano, fator_p25, fator_p75, qtd_plantas)
values (null, null, true, 0.7, 0.65, 0.75, 10);
select throws_ok(
  $$insert into public.m2_fatores_referencia (bairro_id, decada_construcao, vagas_cadastro_proprio, fator_mediano, fator_p25, fator_p75, qtd_plantas)
    values (null, null, true, 0.71, 0.66, 0.76, 9)$$,
  '23505', null, 'fatores_referencia: grupo (nulo, nulo, true) não se repete (nulls not distinct, 7.2)');

-- Trigger de atualizado_em grava now() no update.
update public.m2_bairros set atualizado_em = '2000-01-01' where slug = 'perdizes';
select ok((select atualizado_em > '2000-01-01' from public.m2_bairros where slug = 'perdizes'),
  'trigger m2_bairros_atualizado_em sobrescreve atualizado_em no update (7.4)');

select * from finish();
rollback;
