-- =============================================================================
-- Seed dos 10 bairros do Fechou por Quanto (spec seção 7.6; tabela 11.2; regra 11.2).
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
  ('Itaim Bibi',        'itaim-bibi',        array['045'],                array['^(ITAIM ?BIBI|ITAIM|VL\.? ITAIM|VILA ITAIM)$'])
on conflict (slug) do update
  set nome = excluded.nome,
      prefixos_cep = excluded.prefixos_cep,
      padroes_nome = excluded.padroes_nome;
