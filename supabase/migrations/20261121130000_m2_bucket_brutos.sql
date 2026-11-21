-- =============================================================================
-- Fechou por Quanto — bucket m2_brutos (seção 4.1: "Storage: arquivos brutos"; épico 8.2).
-- Guarda os arquivos de origem (IPTU, ITBI) com retenção de 2 versões por fonte/ano
-- (seção 17), feita pela ingestão. Privado: sem políticas em storage.objects para
-- anon/authenticated, então só o pipeline (service role) lê e grava.
-- Nunca recebe PDFs de leilão (seção 20; hook guard-coleta.sh).
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('m2_brutos', 'm2_brutos', false)
on conflict (id) do nothing;
