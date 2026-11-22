-- =============================================================================
-- Fechou por Quanto — gravação da calibração das plantas (épico 8.6; regras 11.9 a 11.12).
-- Divergência declarada em plans/8.6-calibracao.md (a 7.4 não lista estas funções; o cálculo
-- fica no código da ingestão, 7.5, e estas funções só gravam em lote).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- m2_aplicar_calibracao_plantas(plantas, historico) (regras 11.9, 11.11, 11.12; 7.2 calibracoes)
-- O que faz: grava o estado calibrado de várias plantas e o histórico das que mudaram de área,
-- numa transação. Regra 11.11: planta confirmada com fonte revisao_manual NUNCA é alterada aqui,
-- nem ganha linha de histórico do pipeline, mesmo que o código peça.
-- Recebe: plantas (jsonb: id, area_privativa, vagas_inclusas, quartos, fator, selo, fonte_area,
-- faixa_erro_pct, especial, revisao_pendente, motivo_revisao) e historico (jsonb: planta_id,
-- area_privativa, vagas_inclusas, fator, selo, fonte, anuncios_ids, editais_ids).
-- Devolve: quantas plantas foram atualizadas. Só o pipeline (service role) executa.
-- -----------------------------------------------------------------------------
create function public.m2_aplicar_calibracao_plantas(plantas jsonb, historico jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_atualizadas integer;
begin
  update public.m2_plantas p
     set area_privativa   = x.area_privativa,
         vagas_inclusas   = x.vagas_inclusas,
         quartos          = x.quartos,
         fator            = x.fator,
         selo             = x.selo,
         fonte_area       = x.fonte_area,
         faixa_erro_pct   = x.faixa_erro_pct,
         especial         = x.especial,
         revisao_pendente = x.revisao_pendente,
         motivo_revisao   = x.motivo_revisao,
         atualizado_em    = now()
    from jsonb_to_recordset(m2_aplicar_calibracao_plantas.plantas) as x(
           id uuid, area_privativa numeric, vagas_inclusas smallint, quartos smallint, fator numeric,
           selo public.m2_selo_area, fonte_area public.m2_fonte_dado, faixa_erro_pct numeric,
           especial boolean, revisao_pendente boolean, motivo_revisao public.m2_motivo_revisao)
   where p.id = x.id
     and not (p.selo = 'confirmada' and p.fonte_area = 'revisao_manual');  -- regra 11.11
  get diagnostics v_atualizadas = row_count;

  insert into public.m2_calibracoes (planta_id, area_privativa, vagas_inclusas, fator, selo, fonte, anuncios_ids, editais_ids, autor)
  select h.planta_id, h.area_privativa, h.vagas_inclusas, h.fator, h.selo, h.fonte,
         coalesce(h.anuncios_ids, '{}'), coalesce(h.editais_ids, '{}'), 'pipeline'
    from jsonb_to_recordset(m2_aplicar_calibracao_plantas.historico) as h(
           planta_id uuid, area_privativa numeric, vagas_inclusas smallint, fator numeric,
           selo public.m2_selo_area, fonte public.m2_fonte_dado, anuncios_ids uuid[], editais_ids uuid[])
    join public.m2_plantas p on p.id = h.planta_id
   -- regra 11.11: se a planta está confirmada à mão, a linha do pipeline não entra
   where not (p.selo = 'confirmada' and p.fonte_area = 'revisao_manual');

  return v_atualizadas;
end;
$$;

revoke all on function public.m2_aplicar_calibracao_plantas(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.m2_aplicar_calibracao_plantas(jsonb, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- m2_atualizar_fator_predio(ids, fatores) (7.2 predios.fator_predio; regra 11.12)
-- O que faz: grava fator_predio de vários prédios (mediana dos fatores das plantas com selo
-- ≥ indicativa, calculada no código; nulo sem calibração). Só altera o que mudou.
-- Recebe: ids e fatores na mesma ordem. Devolve: quantos prédios mudaram. Só service role.
-- -----------------------------------------------------------------------------
create function public.m2_atualizar_fator_predio(ids uuid[], fatores numeric[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_atualizados integer;
begin
  if coalesce(array_length(ids, 1), 0) <> coalesce(array_length(fatores, 1), 0) then
    raise exception 'ids e fatores com tamanhos diferentes.' using errcode = '22023';
  end if;
  update public.m2_predios p
     set fator_predio = x.fator, atualizado_em = now()
    from unnest(m2_atualizar_fator_predio.ids, m2_atualizar_fator_predio.fatores) as x(id, fator)
   where p.id = x.id
     and p.fator_predio is distinct from x.fator;
  get diagnostics v_atualizados = row_count;
  return v_atualizados;
end;
$$;

revoke all on function public.m2_atualizar_fator_predio(uuid[], numeric[]) from public, anon, authenticated;
grant execute on function public.m2_atualizar_fator_predio(uuid[], numeric[]) to service_role;

-- -----------------------------------------------------------------------------
-- m2_substituir_fatores_referencia(linhas) (regra 11.10; 7.5: recalculado pelo pipeline)
-- O que faz: troca o conteúdo de m2_fatores_referencia pelos grupos calculados, numa transação
-- (quem lê nunca vê a tabela vazia).
-- Recebe: jsonb com bairro_id, decada_construcao, vagas_cadastro_proprio, fator_mediano, fator_p25,
-- fator_p75, qtd_plantas. Devolve: quantos grupos ficaram. Só service role.
-- -----------------------------------------------------------------------------
create function public.m2_substituir_fatores_referencia(linhas jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_inseridos integer;
begin
  delete from public.m2_fatores_referencia where true;
  insert into public.m2_fatores_referencia
         (bairro_id, decada_construcao, vagas_cadastro_proprio, fator_mediano, fator_p25, fator_p75, qtd_plantas, calculado_em)
  select x.bairro_id, x.decada_construcao, x.vagas_cadastro_proprio, x.fator_mediano, x.fator_p25, x.fator_p75, x.qtd_plantas, now()
    from jsonb_to_recordset(m2_substituir_fatores_referencia.linhas) as x(
           bairro_id smallint, decada_construcao smallint, vagas_cadastro_proprio boolean,
           fator_mediano numeric, fator_p25 numeric, fator_p75 numeric, qtd_plantas integer);
  get diagnostics v_inseridos = row_count;
  return v_inseridos;
end;
$$;

revoke all on function public.m2_substituir_fatores_referencia(jsonb) from public, anon, authenticated;
grant execute on function public.m2_substituir_fatores_referencia(jsonb) to service_role;
