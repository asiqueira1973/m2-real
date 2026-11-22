-- =============================================================================
-- Fechou por Quanto — apoio à rotina calibracao (épico 8.4).
-- Divergências declaradas em plans/8.4-consolidacao.md.
-- =============================================================================

-- Fonte das execuções da rotina calibracao (decisão do usuário, 22/11/2026): a 7.2 só prevê
-- itbi/iptu/anuncio/pagina_condominio/edital_leilao para m2_execucoes_ingestao.fonte, e a
-- calibração mistura todas. Valor usado só em m2_execucoes_ingestao.
alter type public.m2_fonte_dado add value if not exists 'calibracao';

-- -----------------------------------------------------------------------------
-- m2_vendas_remover_obsoletas(manter) (seção 7.5; regras 11.11 e 11.15)
-- O que faz: no recálculo da tabela m2_vendas_consolidadas, apaga as vendas cuja guia de
-- apartamento não está mais entre as consolidadas, PRESERVANDO as marcadas pelo admin
-- (marcado_manual = true, regra 11.11).
-- Recebe: ids das guias de apartamento que continuam gerando venda (corpo do RPC, sem limite de URL).
-- Devolve: quantas vendas foram apagadas. Só o pipeline (service role) executa.
-- -----------------------------------------------------------------------------
create function public.m2_vendas_remover_obsoletas(manter uuid[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_apagadas integer;
begin
  delete from public.m2_vendas_consolidadas v
   where not v.marcado_manual
     and not (v.transacao_apartamento_id = any (m2_vendas_remover_obsoletas.manter));
  get diagnostics v_apagadas = row_count;
  return v_apagadas;
end;
$$;

revoke all on function public.m2_vendas_remover_obsoletas(uuid[]) from public, anon, authenticated;
grant execute on function public.m2_vendas_remover_obsoletas(uuid[]) to service_role;
