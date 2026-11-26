-- Bug (8.14, produção): m2_ligar_transacoes_unidades passava dos 8 s com ~92 mil guias sem unidade
-- (varredura do índice inteiro de sql). Precisa de índice parcial nas guias sem unidade (seção 9.2).
begin;
select plan(1);
select has_index('public', 'm2_transacoes', 'm2_transacoes_sql_sem_unidade_idx', 'índice parcial de sql nas guias sem unidade (9.2)');
select * from finish();
rollback;
