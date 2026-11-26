-- =============================================================================
-- Fechou por Quanto — índice da ligação tardia (seção 9.2; correção depois do 8.14).
-- m2_ligar_transacoes_unidades procura guias sem unidade pelo SQL. Sem este índice parcial, o plano
-- varria o índice inteiro de sql (~194 mil guias) e passava dos 8 s do PostgREST na nuvem.
-- =============================================================================
create index if not exists m2_transacoes_sql_sem_unidade_idx on public.m2_transacoes (sql) where unidade_id is null;
