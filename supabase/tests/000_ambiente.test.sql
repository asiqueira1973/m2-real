-- Teste de fumaça do ambiente de banco (épico 8.0, seção 22.1: `npm run db:test`).
-- Confere que o pgTAP roda e que os papéis usados nos testes de RLS (seção 6.4)
-- existem: anon, authenticated e service_role. Os testes de tabelas, políticas
-- e funções m2_* entram no épico 8.1.
begin;
select plan(3);

select has_role('anon', 'papel anon existe (testes de RLS, seção 6.4)');
select has_role('authenticated', 'papel authenticated existe (testes de RLS, seção 6.4)');
select has_role('service_role', 'papel service_role existe (pipeline, seção 5)');

select * from finish();
rollback;
