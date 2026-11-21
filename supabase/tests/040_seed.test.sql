-- Épico 8.1, critério 5: seed dos 10 bairros (spec 7.6; tabela 11.2).
begin;
select plan(4);

select is((select count(*)::int from public.m2_bairros where ativo), 10, '10 bairros ativos (7.6)');
select set_eq(
  $$select slug from public.m2_bairros$$,
  array['perdizes','pompeia','pinheiros','vila-madalena','alto-de-pinheiros','alto-da-lapa',
        'higienopolis','jardins','cerqueira-cesar','itaim-bibi'],
  'slugs dos 10 bairros da seção 1');
select results_eq(
  $$select prefixos_cep from public.m2_bairros order by slug$$,
  $$values (array['050','054']), (array['054']), (array['013','014','0540']), (array['012','013']), (array['045']),
           (array['014']), (array['050','0125']), (array['054']), (array['050']), (array['054'])$$,
  'prefixos de CEP da tabela 11.2 (ordem alfabética de slug: alto-da-lapa … vila-madalena)');
-- As regex aceitam as grafias do exemplo da 11.2.
select ok(
  'VL POMPEIA' ~ (select padroes_nome[1] from public.m2_bairros where slug = 'pompeia')
  and 'JD PAULISTA' ~ (select padroes_nome[1] from public.m2_bairros where slug = 'jardins')
  and 'CERQUEIRA CEZAR' ~ (select padroes_nome[1] from public.m2_bairros where slug = 'cerqueira-cesar')
  and 'ITAIMBIBI' ~ (select padroes_nome[1] from public.m2_bairros where slug = 'itaim-bibi')
  and 'ALTO DOS PINHEIROS' ~ (select padroes_nome[1] from public.m2_bairros where slug = 'alto-de-pinheiros')
  and not ('PINHEIROS' ~ (select padroes_nome[1] from public.m2_bairros where slug = 'alto-de-pinheiros')),
  'padrões de nome da 11.2 aceitam as grafias esperadas e não confundem Pinheiros com Alto de Pinheiros');

select * from finish();
rollback;
