-- =============================================================================
-- Seed dos 14 bairros do Fechou por Quanto (spec seção 7.6; tabela 11.2; regra 11.2; zona sul no 8.14).
-- prefixos_cep: CEPs aceitos para o bairro. padroes_nome: regex aplicadas ao campo
-- bairro da guia já normalizado (maiúsculas, sem acento, espaços simples).
-- Idempotente: rodar de novo só reafirma os valores.
-- =============================================================================
insert into public.m2_bairros (nome, slug, prefixos_cep, padroes_nome) values
  ('Perdizes',          'perdizes',          array['050', '0125'],        array['^PERDIZES$']),
  ('Pompeia',           'pompeia',           array['050'],                array['^(VILA |VL\.? |V\. )?POMPEIA$']),
  ('Pinheiros',         'pinheiros',         array['054'],                array['^PINHEIROS$']),
  ('Vila Madalena',     'vila-madalena',     array['054'],                array['^(VILA|VL\.?) MADALENA$']),
  ('Alto de Pinheiros', 'alto-de-pinheiros', array['054'],                array['^ALTO (DE |DOS )?PINHEIROS$']),
  ('Alto da Lapa',      'alto-da-lapa',      array['050', '054'],         array['^ALTO DA LAPA$']),
  ('Higienópolis',      'higienopolis',      array['012', '013'],         array['^HIGIENOPOLIS$']),
  ('Jardins',           'jardins',           array['014'],                array['^(JARDIM|JD\.?) (PAULISTA|AMERICA|EUROPA|PAULISTANO)$']),
  ('Cerqueira César',   'cerqueira-cesar',   array['013', '014', '0540'], array['^CERQUEIRA CE[SZ]AR$']),
  ('Itaim Bibi',        'itaim-bibi',        array['045'],                array['^(ITAIM ?BIBI|ITAIM|VL\.? ITAIM|VILA ITAIM)$']),
  ('Moema', 'moema', array['04029', '04075', '04076', '04077', '04078', '04079', '04080', '04081', '04082', '04083', '04084', '04086', '04087', '04088', '04089', '04090', '04514', '04515', '04516', '04517', '04520', '04521', '04522', '04523', '04524'], array['^MOEMA$']),
  ('Vila Nova Conceição', 'vila-nova-conceicao', array['04505', '04507', '04508', '04509', '04510', '04511', '04512', '04513', '04535', '04537', '04543', '04545'], array['^(VILA|VL\.?) NOVA CONCEICAO$']),
  ('Brooklin', 'brooklin', array['04555', '04556', '04557', '04558', '04559', '04560', '04561', '04562', '04563', '04564', '04565', '04566', '04567', '04568', '04569', '04570', '04571', '04575', '04576', '04578', '04580', '04581', '04582', '04583', '04601', '04602', '04610', '04620', '04621', '04622', '04623', '04634', '04702', '04703', '04704', '04705', '04707', '04710'], array['^BROOKLIN( PAULISTA| NOVO| VELHO| PAULISTA NOVO| PTA\.?( NOVO)?)?$']),
  ('Campo Belo', 'campo-belo', array['04601', '04602', '04603', '04605', '04606', '04607', '04608', '04609', '04610', '04611', '04612', '04613', '04614', '04615', '04616', '04617', '04618', '04619', '04620', '04624', '04625'], array['^CAMPO BELO$'])
on conflict (slug) do update
  set nome = excluded.nome,
      prefixos_cep = excluded.prefixos_cep,
      padroes_nome = excluded.padroes_nome;
