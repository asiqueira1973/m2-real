-- Épico 8.2: P3 (busca por qualquer número do condomínio) e bucket de brutos privado.
begin;
select plan(5);

insert into public.m2_predios (id, chave_predio, setor, quadra, numero_condominio, bairro_id, logradouro, numero, numeros_imovel, cep, exercicio_iptu)
values ('00000000-0000-0000-0000-0000000000d9', '001-054-01-9', '001', '054', '01-9',
        (select id from public.m2_bairros where slug = 'higienopolis'), 'AVENIDA RIO BRANCO', 127, '{115,117,125,127}', '01205000', 2026);

select has_column('public', 'm2_predios', 'numeros_imovel', 'm2_predios.numeros_imovel existe (P3)');
select is((select predio_id from public.m2_buscar_predio_por_endereco('Av. Rio Branco, 127') limit 1),
  '00000000-0000-0000-0000-0000000000d9'::uuid, 'busca pelo número principal');
select is((select predio_id from public.m2_buscar_predio_por_endereco('av rio branco 115') limit 1),
  '00000000-0000-0000-0000-0000000000d9'::uuid, 'P3: busca por um número secundário do condomínio acha o prédio');
select is((select count(*)::int from public.m2_buscar_predio_por_endereco('av rio branco 116')), 0,
  'número que não é do condomínio não acha');
select ok((select not public from storage.buckets where id = 'm2_brutos'), 'bucket m2_brutos existe e é privado (seção 20)');

select * from finish();
rollback;
