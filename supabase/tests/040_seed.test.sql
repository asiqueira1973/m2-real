-- Épico 8.1, critério 5: seed dos bairros (spec 7.6; tabela 11.2). O 8.14 acrescentou 4 da zona sul (14 no total).
begin;
select plan(6);

select is((select count(*)::int from public.m2_bairros where ativo), 14, '14 bairros ativos (7.6; 8.14)');
select set_eq(
  $$select slug from public.m2_bairros$$,
  array['perdizes','pompeia','pinheiros','vila-madalena','alto-de-pinheiros','alto-da-lapa',
        'higienopolis','jardins','cerqueira-cesar','itaim-bibi','moema','vila-nova-conceicao','brooklin','campo-belo'],
  'slugs dos 14 bairros (seção 1 e 8.14)');
select results_eq(
  $$select prefixos_cep from public.m2_bairros where slug not in ('moema','vila-nova-conceicao','brooklin','campo-belo') order by slug$$,
  $$values (array['050','054']), (array['054']), (array['013','014','0540']), (array['012','013']), (array['045']),
           (array['014']), (array['050','0125']), (array['054']), (array['050']), (array['054'])$$,
  'prefixos de CEP dos 10 bairros originais da tabela 11.2 (ordem alfabética de slug: alto-da-lapa … vila-madalena)');
-- As regex aceitam as grafias do exemplo da 11.2.
select ok(
  'VL POMPEIA' ~ (select padroes_nome[1] from public.m2_bairros where slug = 'pompeia')
  and 'JD PAULISTA' ~ (select padroes_nome[1] from public.m2_bairros where slug = 'jardins')
  and 'CERQUEIRA CEZAR' ~ (select padroes_nome[1] from public.m2_bairros where slug = 'cerqueira-cesar')
  and 'ITAIMBIBI' ~ (select padroes_nome[1] from public.m2_bairros where slug = 'itaim-bibi')
  and 'ALTO DOS PINHEIROS' ~ (select padroes_nome[1] from public.m2_bairros where slug = 'alto-de-pinheiros')
  and not ('PINHEIROS' ~ (select padroes_nome[1] from public.m2_bairros where slug = 'alto-de-pinheiros')),
  'padrões de nome da 11.2 aceitam as grafias esperadas e não confundem Pinheiros com Alto de Pinheiros');

-- 8.14: as grafias medidas no IPTU 2026 casam com um bairro só.
select ok((select bool_and(exists(select 1 from public.m2_bairros b, unnest(b.padroes_nome) r where b.slug = x.slug and x.nome ~ r))
             from (values ('moema','MOEMA'),('vila-nova-conceicao','VL NOVA CONCEICAO'),('vila-nova-conceicao','VILA NOVA CONCEICAO'),
                          ('brooklin','BROOKLIN'),('brooklin','BROOKLIN PAULISTA'),('brooklin','BROOKLIN NOVO'),('brooklin','BROOKLIN PTA NOVO'),('campo-belo','CAMPO BELO')) as x(slug, nome)),
  '8.14: padrões de nome dos bairros da zona sul');
select is((select count(*)::int from public.m2_bairros b, unnest(b.padroes_nome) r where 'BROOKLIN PAULISTA' ~ r), 1, '8.14: Brooklin Paulista casa com um bairro só');

select * from finish();
rollback;
