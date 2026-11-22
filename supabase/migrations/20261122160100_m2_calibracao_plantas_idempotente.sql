-- =============================================================================
-- Fechou por Quanto — m2_aplicar_calibracao_plantas idempotente (épico 8.6).
-- A versão de 20261122160000 inseria o histórico de toda planta pedida. Se o pipeline repetisse
-- a chamada (withRetry, depois de uma resposta perdida com o commit já feito), o histórico sairia
-- duplicado. Agora a função só atualiza a planta cujo estado difere do pedido e só grava histórico
-- das plantas que ela de fato atualizou: repetir a mesma chamada não muda nada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- m2_aplicar_calibracao_plantas(plantas, historico) (regras 11.9, 11.11, 11.12; 7.2 calibracoes)
-- O que faz: grava o estado calibrado das plantas e o histórico das que mudaram, numa transação.
-- Regra 11.11: planta confirmada com fonte revisao_manual NUNCA é alterada nem ganha histórico.
-- Recebe: plantas (jsonb: id, area_privativa, vagas_inclusas, quartos, fator, selo, fonte_area,
-- faixa_erro_pct, especial, revisao_pendente, motivo_revisao) e historico (jsonb: planta_id,
-- area_privativa, vagas_inclusas, fator, selo, fonte, anuncios_ids, editais_ids).
-- Devolve: quantas plantas foram atualizadas. Só o pipeline (service role) executa.
-- -----------------------------------------------------------------------------
create or replace function public.m2_aplicar_calibracao_plantas(plantas jsonb, historico jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  with alteradas as (
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
       and not (p.selo = 'confirmada' and p.fonte_area = 'revisao_manual')  -- regra 11.11
       and (p.area_privativa, p.vagas_inclusas, p.quartos, p.fator, p.selo, p.fonte_area, p.faixa_erro_pct,
            p.especial, p.revisao_pendente, p.motivo_revisao)
           is distinct from
           (x.area_privativa::numeric(8,2), x.vagas_inclusas, x.quartos, x.fator::numeric(5,3), x.selo, x.fonte_area,
            x.faixa_erro_pct::numeric(5,1), x.especial, x.revisao_pendente, x.motivo_revisao)
    returning p.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from alteradas;

  insert into public.m2_calibracoes (planta_id, area_privativa, vagas_inclusas, fator, selo, fonte, anuncios_ids, editais_ids, autor)
  select h.planta_id, h.area_privativa, h.vagas_inclusas, h.fator, h.selo, h.fonte,
         coalesce(h.anuncios_ids, '{}'), coalesce(h.editais_ids, '{}'), 'pipeline'
    from jsonb_to_recordset(m2_aplicar_calibracao_plantas.historico) as h(
           planta_id uuid, area_privativa numeric, vagas_inclusas smallint, fator numeric,
           selo public.m2_selo_area, fonte public.m2_fonte_dado, anuncios_ids uuid[], editais_ids uuid[])
   where h.planta_id = any (v_ids);  -- só plantas atualizadas agora (nunca as da 11.11)

  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

revoke all on function public.m2_aplicar_calibracao_plantas(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.m2_aplicar_calibracao_plantas(jsonb, jsonb) to service_role;
