


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."m2_finalidade_anuncio" AS ENUM (
    'venda',
    'aluguel'
);


ALTER TYPE "public"."m2_finalidade_anuncio" OWNER TO "postgres";


CREATE TYPE "public"."m2_fonte_dado" AS ENUM (
    'itbi',
    'iptu',
    'anuncio',
    'pagina_condominio',
    'edital_leilao',
    'revisao_manual',
    'fator_referencia'
);


ALTER TYPE "public"."m2_fonte_dado" OWNER TO "postgres";


CREATE TYPE "public"."m2_motivo_revisao" AS ENUM (
    'fator_incoerente',
    'anuncios_divergentes',
    'anuncio_ambiguo',
    'planta_especial',
    'venda_fora_da_curva',
    'edital_divergente'
);


ALTER TYPE "public"."m2_motivo_revisao" OWNER TO "postgres";


CREATE TYPE "public"."m2_origem_bairro" AS ENUM (
    'campo',
    'cep',
    'quadra',
    'iptu'
);


ALTER TYPE "public"."m2_origem_bairro" OWNER TO "postgres";


CREATE TYPE "public"."m2_papel_usuario" AS ENUM (
    'admin'
);


ALTER TYPE "public"."m2_papel_usuario" OWNER TO "postgres";


CREATE TYPE "public"."m2_selo_area" AS ENUM (
    'confirmada',
    'calibrada',
    'indicativa',
    'estimada',
    'sem_dado'
);


ALTER TYPE "public"."m2_selo_area" OWNER TO "postgres";


CREATE TYPE "public"."m2_status_casamento" AS ENUM (
    'casado_planta',
    'casado_predio',
    'ambiguo',
    'sem_predio',
    'descartado'
);


ALTER TYPE "public"."m2_status_casamento" OWNER TO "postgres";


CREATE TYPE "public"."m2_status_casamento_edital" AS ENUM (
    'casado_unidade',
    'casado_predio',
    'sem_predio',
    'descartado'
);


ALTER TYPE "public"."m2_status_casamento_edital" OWNER TO "postgres";


CREATE TYPE "public"."m2_status_execucao" AS ENUM (
    'em_andamento',
    'concluida',
    'falhou',
    'substituida'
);


ALTER TYPE "public"."m2_status_execucao" OWNER TO "postgres";


CREATE TYPE "public"."m2_tipo_unidade" AS ENUM (
    'apartamento',
    'vaga',
    'outro'
);


ALTER TYPE "public"."m2_tipo_unidade" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."m2_atualizar_atualizado_em"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."m2_atualizar_atualizado_em"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."m2_buscar_predio_por_endereco"("texto" "text", "limiar_similaridade" real DEFAULT 0.4, "limite" integer DEFAULT 5) RETURNS TABLE("predio_id" "uuid", "logradouro" "text", "numero" integer, "endereco" "text", "bairro" "text", "bairro_slug" "text", "ano_construcao" smallint, "total_unidades" integer, "similaridade" real)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $_$
  with entrada as (
    select
      public.m2_normalizar_endereco(split_part(texto, ',', 1)) as antes_da_virgula,
      public.m2_normalizar_endereco(nullif(substr(texto, strpos(texto, ',') + 1), texto)) as depois_da_virgula,
      public.m2_normalizar_endereco(texto) as tudo,
      strpos(texto, ',') > 0 as tem_virgula
  ),
  partes as (
    select
      case
        when e.tem_virgula then (regexp_match(coalesce(e.depois_da_virgula, ''), '(\d+)'))[1]::integer
        else (regexp_match(e.tudo, '(\d+)\D*$'))[1]::integer
      end as numero,
      case
        when e.tem_virgula then e.antes_da_virgula
        else btrim(regexp_replace(e.tudo, '\s*\d+\D*$', ''))
      end as logradouro
    from entrada e
  )
  select
    p.id,
    p.logradouro,
    p.numero,
    p.logradouro || coalesce(', ' || p.numero::text, ''),
    b.nome,
    b.slug,
    p.ano_construcao,
    p.total_unidades_residenciais,
    extensions.similarity(p.logradouro, pt.logradouro)
  from public.m2_predios p
  join public.m2_bairros b on b.id = p.bairro_id
  cross join partes pt
  where (pt.numero is null or p.numero = pt.numero or pt.numero = any (p.numeros_imovel))
    and extensions.similarity(p.logradouro, pt.logradouro) >= limiar_similaridade
  order by extensions.similarity(p.logradouro, pt.logradouro) desc, p.numero, p.id
  limit limite;
$_$;


ALTER FUNCTION "public"."m2_buscar_predio_por_endereco"("texto" "text", "limiar_similaridade" real, "limite" integer) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."m2_anuncios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "url" "text" NOT NULL,
    "dominio" "text" NOT NULL,
    "fonte" "public"."m2_fonte_dado" NOT NULL,
    "execucao_id" "uuid" NOT NULL,
    "logradouro_extraido" "text",
    "numero_extraido" integer,
    "nome_condominio" "text",
    "finalidade" "public"."m2_finalidade_anuncio",
    "area_privativa" numeric(8,2),
    "area_privativa_min" numeric(8,2),
    "area_privativa_max" numeric(8,2),
    "quartos" smallint,
    "vagas" smallint,
    "andar" smallint,
    "preco_pedido" numeric(14,2),
    "predio_id" "uuid",
    "planta_id" "uuid",
    "status_casamento" "public"."m2_status_casamento" DEFAULT 'sem_predio'::"public"."m2_status_casamento" NOT NULL,
    "confianca_casamento" numeric(4,3),
    "casado_manual" boolean DEFAULT false NOT NULL,
    "coletado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."m2_anuncios" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."m2_casar_anuncio"("anuncio_id" "uuid", "predio_id" "uuid", "planta_id" "uuid") RETURNS "public"."m2_anuncios"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
#variable_conflict use_column
declare
  v_status  public.m2_status_casamento;
  v_anuncio public.m2_anuncios;
begin
  if not public.m2_eh_admin() then
    raise exception 'Acesso negado: só o admin casa ou descarta anúncios (seção 5).'
      using errcode = '42501';
  end if;

  if m2_casar_anuncio.predio_id is null then
    if m2_casar_anuncio.planta_id is not null then
      raise exception 'Planta informada sem prédio.' using errcode = '22023';
    end if;
    v_status := 'descartado';
  elsif m2_casar_anuncio.planta_id is not null then
    if not exists (
      select 1 from public.m2_plantas pl
      where pl.id = m2_casar_anuncio.planta_id and pl.predio_id = m2_casar_anuncio.predio_id
    ) then
      raise exception 'A planta não pertence ao prédio informado.' using errcode = '22023';
    end if;
    v_status := 'casado_planta';
  else
    if not exists (select 1 from public.m2_predios pr where pr.id = m2_casar_anuncio.predio_id) then
      raise exception 'Prédio não encontrado.' using errcode = 'P0002';
    end if;
    v_status := 'casado_predio';
  end if;

  update public.m2_anuncios a
     set predio_id           = m2_casar_anuncio.predio_id,
         planta_id           = m2_casar_anuncio.planta_id,
         status_casamento    = v_status,
         confianca_casamento = null,  -- vínculo manual não tem confiança calculada
         casado_manual       = true
   where a.id = m2_casar_anuncio.anuncio_id
  returning a.* into v_anuncio;

  if not found then
    raise exception 'Anúncio não encontrado.' using errcode = 'P0002';
  end if;
  return v_anuncio;
end;
$$;


ALTER FUNCTION "public"."m2_casar_anuncio"("anuncio_id" "uuid", "predio_id" "uuid", "planta_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m2_editais_leilao" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "url" "text" NOT NULL,
    "url_documento" "text",
    "dominio" "text" NOT NULL,
    "execucao_id" "uuid" NOT NULL,
    "logradouro_extraido" "text",
    "numero_extraido" integer,
    "complemento_extraido" "text",
    "matricula" "text",
    "cartorio" "text",
    "area_privativa" numeric(8,2),
    "area_comum" numeric(8,2),
    "area_total" numeric(8,2),
    "fracao_ideal" numeric(8,6),
    "vagas" smallint,
    "vagas_vinculadas_area" boolean,
    "valor_avaliacao" numeric(14,2),
    "data_leilao" "date",
    "origem_documento" "text" NOT NULL,
    "predio_id" "uuid",
    "unidade_id" "uuid",
    "status_casamento" "public"."m2_status_casamento_edital" DEFAULT 'sem_predio'::"public"."m2_status_casamento_edital" NOT NULL,
    "casado_manual" boolean DEFAULT false NOT NULL,
    "coletado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."m2_editais_leilao" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."m2_casar_edital"("edital_id" "uuid", "predio_id" "uuid", "unidade_id" "uuid") RETURNS "public"."m2_editais_leilao"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
#variable_conflict use_column
declare
  v_status public.m2_status_casamento_edital;
  v_edital public.m2_editais_leilao;
begin
  if not public.m2_eh_admin() then
    raise exception 'Acesso negado: só o admin casa ou descarta editais (seção 5).'
      using errcode = '42501';
  end if;

  if m2_casar_edital.predio_id is null then
    if m2_casar_edital.unidade_id is not null then
      raise exception 'Unidade informada sem prédio.' using errcode = '22023';
    end if;
    v_status := 'descartado';
  elsif m2_casar_edital.unidade_id is not null then
    if not exists (
      select 1 from public.m2_unidades u
      where u.id = m2_casar_edital.unidade_id and u.predio_id = m2_casar_edital.predio_id
    ) then
      raise exception 'A unidade não pertence ao prédio informado.' using errcode = '22023';
    end if;
    v_status := 'casado_unidade';
  else
    if not exists (select 1 from public.m2_predios pr where pr.id = m2_casar_edital.predio_id) then
      raise exception 'Prédio não encontrado.' using errcode = 'P0002';
    end if;
    v_status := 'casado_predio';
  end if;

  update public.m2_editais_leilao e
     set predio_id        = m2_casar_edital.predio_id,
         unidade_id       = m2_casar_edital.unidade_id,
         status_casamento = v_status,
         casado_manual    = true
   where e.id = m2_casar_edital.edital_id
  returning e.* into v_edital;

  if not found then
    raise exception 'Edital não encontrado.' using errcode = 'P0002';
  end if;
  return v_edital;
end;
$$;


ALTER FUNCTION "public"."m2_casar_edital"("edital_id" "uuid", "predio_id" "uuid", "unidade_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m2_plantas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "predio_id" "uuid" NOT NULL,
    "area_iptu_referencia" numeric(10,2) NOT NULL,
    "qtd_unidades" integer NOT NULL,
    "area_privativa" numeric(8,2),
    "vagas_inclusas" smallint,
    "quartos" smallint,
    "fator" numeric(5,3),
    "selo" "public"."m2_selo_area" DEFAULT 'sem_dado'::"public"."m2_selo_area" NOT NULL,
    "fonte_area" "public"."m2_fonte_dado",
    "faixa_erro_pct" numeric(5,1),
    "especial" boolean DEFAULT false NOT NULL,
    "revisao_pendente" boolean DEFAULT false NOT NULL,
    "motivo_revisao" "public"."m2_motivo_revisao",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."m2_plantas" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."m2_confirmar_area_planta"("planta_id" "uuid", "area_privativa" numeric, "vagas_inclusas" smallint, "observacao" "text") RETURNS "public"."m2_plantas"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
#variable_conflict use_column
declare
  v_planta public.m2_plantas;
  v_autor  text;
begin
  if not public.m2_eh_admin() then
    raise exception 'Acesso negado: só o admin confirma a área de uma planta (seção 5).'
      using errcode = '42501';
  end if;
  if m2_confirmar_area_planta.observacao is null or btrim(m2_confirmar_area_planta.observacao) = '' then
    raise exception 'A observação é obrigatória para confirmar a área (seção 7.4).'
      using errcode = '22023';
  end if;
  if m2_confirmar_area_planta.area_privativa is null or m2_confirmar_area_planta.area_privativa <= 0 then
    raise exception 'A área privativa precisa ser maior que zero.' using errcode = '22023';
  end if;

  select pf.email into v_autor from public.m2_perfis pf where pf.id = auth.uid();

  update public.m2_plantas p
     set area_privativa   = m2_confirmar_area_planta.area_privativa,
         vagas_inclusas   = m2_confirmar_area_planta.vagas_inclusas,
         fator            = round(m2_confirmar_area_planta.area_privativa / p.area_iptu_referencia, 3),
         selo             = 'confirmada',
         fonte_area       = 'revisao_manual',
         faixa_erro_pct   = null,   -- faixa de erro só existe no selo estimada (7.2)
         revisao_pendente = false,
         motivo_revisao   = null
   where p.id = m2_confirmar_area_planta.planta_id
  returning p.* into v_planta;

  if not found then
    raise exception 'Planta não encontrada.' using errcode = 'P0002';
  end if;

  insert into public.m2_calibracoes
    (planta_id, area_privativa, vagas_inclusas, fator, selo, fonte, observacao, autor)
  values
    (v_planta.id, v_planta.area_privativa, v_planta.vagas_inclusas, v_planta.fator,
     'confirmada', 'revisao_manual', btrim(m2_confirmar_area_planta.observacao), v_autor);

  return v_planta;
end;
$$;


ALTER FUNCTION "public"."m2_confirmar_area_planta"("planta_id" "uuid", "area_privativa" numeric, "vagas_inclusas" smallint, "observacao" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."m2_eh_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.m2_perfis p
    where p.id = auth.uid()
      and p.papel = 'admin'
      and p.ativo
  );
$$;


ALTER FUNCTION "public"."m2_eh_admin"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m2_vendas_consolidadas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transacao_apartamento_id" "uuid" NOT NULL,
    "transacoes_vagas_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "predio_id" "uuid" NOT NULL,
    "unidade_id" "uuid" NOT NULL,
    "planta_id" "uuid",
    "data_transacao" "date" NOT NULL,
    "valor_apartamento" numeric(14,2) NOT NULL,
    "valor_vagas" numeric(14,2) DEFAULT 0 NOT NULL,
    "valor_total" numeric(14,2) NOT NULL,
    "qtd_vagas_separadas" smallint DEFAULT 0 NOT NULL,
    "vagas_inclusas_area" smallint,
    "area_privativa" numeric(8,2),
    "selo_area" "public"."m2_selo_area" NOT NULL,
    "m2_privativo" numeric(10,2),
    "m2_iptu" numeric(10,2) NOT NULL,
    "fora_da_curva" boolean DEFAULT false NOT NULL,
    "marcado_manual" boolean DEFAULT false NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."m2_vendas_consolidadas" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."m2_marcar_outlier"("venda_id" "uuid", "fora_da_curva" boolean) RETURNS "public"."m2_vendas_consolidadas"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
#variable_conflict use_column
declare
  v_venda public.m2_vendas_consolidadas;
begin
  if not public.m2_eh_admin() then
    raise exception 'Acesso negado: só o admin marca venda fora da curva (seção 5).'
      using errcode = '42501';
  end if;
  if m2_marcar_outlier.fora_da_curva is null then
    raise exception 'Informe verdadeiro ou falso.' using errcode = '22023';
  end if;

  update public.m2_vendas_consolidadas v
     set fora_da_curva  = m2_marcar_outlier.fora_da_curva,
         marcado_manual = true
   where v.id = m2_marcar_outlier.venda_id
  returning v.* into v_venda;

  if not found then
    raise exception 'Venda não encontrada.' using errcode = 'P0002';
  end if;
  return v_venda;
end;
$$;


ALTER FUNCTION "public"."m2_marcar_outlier"("venda_id" "uuid", "fora_da_curva" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."m2_marcar_planta_especial"("planta_id" "uuid", "especial" boolean) RETURNS "public"."m2_plantas"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
#variable_conflict use_column
declare
  v_planta public.m2_plantas;
begin
  if not public.m2_eh_admin() then
    raise exception 'Acesso negado: só o admin marca planta especial (seção 5).'
      using errcode = '42501';
  end if;
  if m2_marcar_planta_especial.especial is null then
    raise exception 'Informe verdadeiro ou falso.' using errcode = '22023';
  end if;

  update public.m2_plantas p
     set especial         = m2_marcar_planta_especial.especial,
         revisao_pendente = case when p.motivo_revisao = 'planta_especial' then false else p.revisao_pendente end,
         motivo_revisao   = case when p.motivo_revisao = 'planta_especial' then null else p.motivo_revisao end
   where p.id = m2_marcar_planta_especial.planta_id
  returning p.* into v_planta;

  if not found then
    raise exception 'Planta não encontrada.' using errcode = 'P0002';
  end if;
  return v_planta;
end;
$$;


ALTER FUNCTION "public"."m2_marcar_planta_especial"("planta_id" "uuid", "especial" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."m2_normalizar_endereco"("texto" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$
declare
  t text;
  abreviacao record;
begin
  if texto is null then
    return null;
  end if;
  -- Sem acento e em maiúsculas.
  t := upper(extensions.unaccent('extensions.unaccent'::regdictionary, texto));
  -- Sem pontuação: tudo que não é letra, dígito ou espaço vira espaço.
  t := regexp_replace(t, '[^A-Z0-9 ]', ' ', 'g');
  -- Espaços simples.
  t := btrim(regexp_replace(t, '\s+', ' ', 'g'));
  -- Abreviações da regra 11.5, só como palavra inteira (\m e \M são limites de palavra).
  for abreviacao in
    select * from (values
      ('R', 'RUA'), ('AV', 'AVENIDA'), ('AL', 'ALAMEDA'), ('PCA', 'PRACA'), ('DR', 'DOUTOR'),
      ('PROF', 'PROFESSOR'), ('CEL', 'CORONEL'), ('MIN', 'MINISTRO'), ('CAP', 'CAPITAO'),
      ('SEN', 'SENADOR'), ('VER', 'VEREADOR')
    ) as a (curta, longa)
  loop
    t := regexp_replace(t, '\m' || abreviacao.curta || '\M', abreviacao.longa, 'g');
  end loop;
  return t;
end;
$$;


ALTER FUNCTION "public"."m2_normalizar_endereco"("texto" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m2_bairros" (
    "id" smallint NOT NULL,
    "nome" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "prefixos_cep" "text"[] NOT NULL,
    "padroes_nome" "text"[] NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "m2_bairros_slug_formato" CHECK (("slug" ~ '^[a-z0-9-]+$'::"text"))
);


ALTER TABLE "public"."m2_bairros" OWNER TO "postgres";


ALTER TABLE "public"."m2_bairros" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."m2_bairros_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."m2_calibracoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "planta_id" "uuid" NOT NULL,
    "area_privativa" numeric(8,2),
    "vagas_inclusas" smallint,
    "fator" numeric(5,3),
    "selo" "public"."m2_selo_area" NOT NULL,
    "fonte" "public"."m2_fonte_dado" NOT NULL,
    "anuncios_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "editais_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "observacao" "text",
    "autor" "text" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."m2_calibracoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m2_chaves_api" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "prefixo" character(8) NOT NULL,
    "hash_chave" "text" NOT NULL,
    "ativa" boolean DEFAULT true NOT NULL,
    "ultimo_uso_em" timestamp with time zone,
    "criada_por" "uuid" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."m2_chaves_api" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m2_cobertura_bairros" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bairro_id" smallint NOT NULL,
    "calculado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "vendas_24m" integer NOT NULL,
    "vendas_confirmada" integer NOT NULL,
    "vendas_calibrada" integer NOT NULL,
    "vendas_indicativa" integer NOT NULL,
    "vendas_estimada" integer NOT NULL,
    "vendas_sem_dado" integer NOT NULL,
    "pct_cobertura" numeric(5,1) NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."m2_cobertura_bairros" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m2_execucoes_ingestao" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fonte" "public"."m2_fonte_dado" NOT NULL,
    "rotina" "text" NOT NULL,
    "referencia" "text",
    "arquivo_url" "text",
    "arquivo_hash" "text",
    "caminho_storage" "text",
    "status" "public"."m2_status_execucao" DEFAULT 'em_andamento'::"public"."m2_status_execucao" NOT NULL,
    "linhas_lidas" integer DEFAULT 0 NOT NULL,
    "linhas_gravadas" integer DEFAULT 0 NOT NULL,
    "linhas_descartadas" integer DEFAULT 0 NOT NULL,
    "mensagem_erro" "text",
    "iniciada_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "concluida_em" timestamp with time zone,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."m2_execucoes_ingestao" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m2_fatores_referencia" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bairro_id" smallint,
    "decada_construcao" smallint,
    "vagas_cadastro_proprio" boolean NOT NULL,
    "fator_mediano" numeric(5,3) NOT NULL,
    "fator_p25" numeric(5,3) NOT NULL,
    "fator_p75" numeric(5,3) NOT NULL,
    "qtd_plantas" integer NOT NULL,
    "calculado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."m2_fatores_referencia" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m2_perfis" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "papel" "public"."m2_papel_usuario" DEFAULT 'admin'::"public"."m2_papel_usuario" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."m2_perfis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m2_predios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chave_predio" "text" NOT NULL,
    "setor" character(3) NOT NULL,
    "quadra" character(3) NOT NULL,
    "numero_condominio" "text" NOT NULL,
    "bairro_id" smallint NOT NULL,
    "logradouro" "text" NOT NULL,
    "numero" integer,
    "cep" character(8) NOT NULL,
    "ano_construcao" smallint,
    "qtd_pavimentos" smallint,
    "padrao_iptu" "text",
    "total_unidades_residenciais" integer DEFAULT 0 NOT NULL,
    "vagas_cadastro_proprio" boolean DEFAULT false NOT NULL,
    "fator_predio" numeric(5,3),
    "prioridade_coleta" integer DEFAULT 0 NOT NULL,
    "ultima_coleta_em" timestamp with time zone,
    "ultima_coleta_leilao_em" timestamp with time zone,
    "exercicio_iptu" smallint NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "numeros_imovel" integer[] DEFAULT '{}'::integer[] NOT NULL
);


ALTER TABLE "public"."m2_predios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m2_transacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hash_linha" "text" NOT NULL,
    "execucao_id" "uuid" NOT NULL,
    "sql" character(11) NOT NULL,
    "unidade_id" "uuid",
    "predio_id" "uuid",
    "bairro_id" smallint NOT NULL,
    "origem_bairro" "public"."m2_origem_bairro" NOT NULL,
    "logradouro" "text" NOT NULL,
    "numero" integer,
    "complemento" "text",
    "cep" character(8),
    "natureza" "text" NOT NULL,
    "eh_compra_venda" boolean NOT NULL,
    "data_transacao" "date" NOT NULL,
    "mes_referencia" "date" NOT NULL,
    "valor_declarado" numeric(14,2) NOT NULL,
    "valor_venal_referencia" numeric(14,2),
    "base_calculo" numeric(14,2),
    "proporcao_transmitida" numeric(6,4),
    "tipo_financiamento" "text",
    "valor_financiado" numeric(14,2) DEFAULT 0 NOT NULL,
    "cartorio" "text",
    "matricula" "text",
    "uso_iptu_guia" "text",
    "area_construida_guia" numeric(10,2),
    "fracao_ideal_guia" numeric(8,6),
    "unidade_sem_cadastro_proprio" boolean DEFAULT false NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."m2_transacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m2_unidades" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sql" character(11) NOT NULL,
    "predio_id" "uuid" NOT NULL,
    "planta_id" "uuid",
    "tipo_unidade" "public"."m2_tipo_unidade" NOT NULL,
    "complemento" "text",
    "uso_iptu" "text" NOT NULL,
    "area_construida" numeric(10,2) NOT NULL,
    "fracao_ideal" numeric(8,6),
    "andar_inferido" smallint,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."m2_unidades" OWNER TO "postgres";


ALTER TABLE ONLY "public"."m2_anuncios"
    ADD CONSTRAINT "m2_anuncios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m2_anuncios"
    ADD CONSTRAINT "m2_anuncios_url_key" UNIQUE ("url");



ALTER TABLE ONLY "public"."m2_bairros"
    ADD CONSTRAINT "m2_bairros_nome_key" UNIQUE ("nome");



ALTER TABLE ONLY "public"."m2_bairros"
    ADD CONSTRAINT "m2_bairros_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m2_bairros"
    ADD CONSTRAINT "m2_bairros_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."m2_calibracoes"
    ADD CONSTRAINT "m2_calibracoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m2_chaves_api"
    ADD CONSTRAINT "m2_chaves_api_hash_chave_key" UNIQUE ("hash_chave");



ALTER TABLE ONLY "public"."m2_chaves_api"
    ADD CONSTRAINT "m2_chaves_api_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m2_cobertura_bairros"
    ADD CONSTRAINT "m2_cobertura_bairros_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m2_editais_leilao"
    ADD CONSTRAINT "m2_editais_leilao_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m2_editais_leilao"
    ADD CONSTRAINT "m2_editais_leilao_url_key" UNIQUE ("url");



ALTER TABLE ONLY "public"."m2_execucoes_ingestao"
    ADD CONSTRAINT "m2_execucoes_ingestao_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m2_fatores_referencia"
    ADD CONSTRAINT "m2_fatores_referencia_grupo_unico" UNIQUE NULLS NOT DISTINCT ("bairro_id", "decada_construcao", "vagas_cadastro_proprio");



ALTER TABLE ONLY "public"."m2_fatores_referencia"
    ADD CONSTRAINT "m2_fatores_referencia_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m2_perfis"
    ADD CONSTRAINT "m2_perfis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m2_plantas"
    ADD CONSTRAINT "m2_plantas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m2_predios"
    ADD CONSTRAINT "m2_predios_chave_predio_key" UNIQUE ("chave_predio");



ALTER TABLE ONLY "public"."m2_predios"
    ADD CONSTRAINT "m2_predios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m2_transacoes"
    ADD CONSTRAINT "m2_transacoes_hash_linha_key" UNIQUE ("hash_linha");



ALTER TABLE ONLY "public"."m2_transacoes"
    ADD CONSTRAINT "m2_transacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m2_unidades"
    ADD CONSTRAINT "m2_unidades_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m2_unidades"
    ADD CONSTRAINT "m2_unidades_sql_key" UNIQUE ("sql");



ALTER TABLE ONLY "public"."m2_vendas_consolidadas"
    ADD CONSTRAINT "m2_vendas_consolidadas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m2_vendas_consolidadas"
    ADD CONSTRAINT "m2_vendas_consolidadas_transacao_apartamento_id_key" UNIQUE ("transacao_apartamento_id");



CREATE INDEX "m2_anuncios_execucao_idx" ON "public"."m2_anuncios" USING "btree" ("execucao_id");



CREATE INDEX "m2_anuncios_planta_idx" ON "public"."m2_anuncios" USING "btree" ("planta_id");



CREATE INDEX "m2_anuncios_predio_idx" ON "public"."m2_anuncios" USING "btree" ("predio_id");



CREATE INDEX "m2_calibracoes_planta_idx" ON "public"."m2_calibracoes" USING "btree" ("planta_id");



CREATE INDEX "m2_chaves_api_criada_por_idx" ON "public"."m2_chaves_api" USING "btree" ("criada_por");



CREATE INDEX "m2_cobertura_bairros_bairro_idx" ON "public"."m2_cobertura_bairros" USING "btree" ("bairro_id", "calculado_em");



CREATE INDEX "m2_editais_leilao_execucao_idx" ON "public"."m2_editais_leilao" USING "btree" ("execucao_id");



CREATE INDEX "m2_editais_leilao_matricula_idx" ON "public"."m2_editais_leilao" USING "btree" ("matricula");



CREATE INDEX "m2_editais_leilao_predio_idx" ON "public"."m2_editais_leilao" USING "btree" ("predio_id");



CREATE INDEX "m2_editais_leilao_unidade_idx" ON "public"."m2_editais_leilao" USING "btree" ("unidade_id");



CREATE INDEX "m2_fatores_referencia_bairro_idx" ON "public"."m2_fatores_referencia" USING "btree" ("bairro_id");



CREATE INDEX "m2_plantas_predio_idx" ON "public"."m2_plantas" USING "btree" ("predio_id");



CREATE INDEX "m2_predios_bairro_idx" ON "public"."m2_predios" USING "btree" ("bairro_id");



CREATE INDEX "m2_predios_logradouro_numero_idx" ON "public"."m2_predios" USING "btree" ("logradouro", "numero");



CREATE INDEX "m2_predios_logradouro_trgm_idx" ON "public"."m2_predios" USING "gin" ("logradouro" "extensions"."gin_trgm_ops");



CREATE INDEX "m2_transacoes_bairro_data_idx" ON "public"."m2_transacoes" USING "btree" ("bairro_id", "data_transacao");



CREATE INDEX "m2_transacoes_execucao_idx" ON "public"."m2_transacoes" USING "btree" ("execucao_id");



CREATE INDEX "m2_transacoes_predio_data_idx" ON "public"."m2_transacoes" USING "btree" ("predio_id", "data_transacao");



CREATE INDEX "m2_transacoes_sql_idx" ON "public"."m2_transacoes" USING "btree" ("sql");



CREATE INDEX "m2_transacoes_unidade_idx" ON "public"."m2_transacoes" USING "btree" ("unidade_id");



CREATE INDEX "m2_unidades_planta_idx" ON "public"."m2_unidades" USING "btree" ("planta_id");



CREATE INDEX "m2_unidades_predio_idx" ON "public"."m2_unidades" USING "btree" ("predio_id");



CREATE INDEX "m2_vendas_consolidadas_planta_idx" ON "public"."m2_vendas_consolidadas" USING "btree" ("planta_id");



CREATE INDEX "m2_vendas_consolidadas_predio_data_idx" ON "public"."m2_vendas_consolidadas" USING "btree" ("predio_id", "data_transacao");



CREATE INDEX "m2_vendas_consolidadas_unidade_idx" ON "public"."m2_vendas_consolidadas" USING "btree" ("unidade_id");



CREATE OR REPLACE TRIGGER "m2_anuncios_atualizado_em" BEFORE UPDATE ON "public"."m2_anuncios" FOR EACH ROW EXECUTE FUNCTION "public"."m2_atualizar_atualizado_em"();



CREATE OR REPLACE TRIGGER "m2_bairros_atualizado_em" BEFORE UPDATE ON "public"."m2_bairros" FOR EACH ROW EXECUTE FUNCTION "public"."m2_atualizar_atualizado_em"();



CREATE OR REPLACE TRIGGER "m2_chaves_api_atualizado_em" BEFORE UPDATE ON "public"."m2_chaves_api" FOR EACH ROW EXECUTE FUNCTION "public"."m2_atualizar_atualizado_em"();



CREATE OR REPLACE TRIGGER "m2_editais_leilao_atualizado_em" BEFORE UPDATE ON "public"."m2_editais_leilao" FOR EACH ROW EXECUTE FUNCTION "public"."m2_atualizar_atualizado_em"();



CREATE OR REPLACE TRIGGER "m2_execucoes_ingestao_atualizado_em" BEFORE UPDATE ON "public"."m2_execucoes_ingestao" FOR EACH ROW EXECUTE FUNCTION "public"."m2_atualizar_atualizado_em"();



CREATE OR REPLACE TRIGGER "m2_fatores_referencia_atualizado_em" BEFORE UPDATE ON "public"."m2_fatores_referencia" FOR EACH ROW EXECUTE FUNCTION "public"."m2_atualizar_atualizado_em"();



CREATE OR REPLACE TRIGGER "m2_perfis_atualizado_em" BEFORE UPDATE ON "public"."m2_perfis" FOR EACH ROW EXECUTE FUNCTION "public"."m2_atualizar_atualizado_em"();



CREATE OR REPLACE TRIGGER "m2_plantas_atualizado_em" BEFORE UPDATE ON "public"."m2_plantas" FOR EACH ROW EXECUTE FUNCTION "public"."m2_atualizar_atualizado_em"();



CREATE OR REPLACE TRIGGER "m2_predios_atualizado_em" BEFORE UPDATE ON "public"."m2_predios" FOR EACH ROW EXECUTE FUNCTION "public"."m2_atualizar_atualizado_em"();



CREATE OR REPLACE TRIGGER "m2_transacoes_atualizado_em" BEFORE UPDATE ON "public"."m2_transacoes" FOR EACH ROW EXECUTE FUNCTION "public"."m2_atualizar_atualizado_em"();



CREATE OR REPLACE TRIGGER "m2_unidades_atualizado_em" BEFORE UPDATE ON "public"."m2_unidades" FOR EACH ROW EXECUTE FUNCTION "public"."m2_atualizar_atualizado_em"();



CREATE OR REPLACE TRIGGER "m2_vendas_consolidadas_atualizado_em" BEFORE UPDATE ON "public"."m2_vendas_consolidadas" FOR EACH ROW EXECUTE FUNCTION "public"."m2_atualizar_atualizado_em"();



ALTER TABLE ONLY "public"."m2_anuncios"
    ADD CONSTRAINT "m2_anuncios_execucao_id_fkey" FOREIGN KEY ("execucao_id") REFERENCES "public"."m2_execucoes_ingestao"("id");



ALTER TABLE ONLY "public"."m2_anuncios"
    ADD CONSTRAINT "m2_anuncios_planta_id_fkey" FOREIGN KEY ("planta_id") REFERENCES "public"."m2_plantas"("id");



ALTER TABLE ONLY "public"."m2_anuncios"
    ADD CONSTRAINT "m2_anuncios_predio_id_fkey" FOREIGN KEY ("predio_id") REFERENCES "public"."m2_predios"("id");



ALTER TABLE ONLY "public"."m2_calibracoes"
    ADD CONSTRAINT "m2_calibracoes_planta_id_fkey" FOREIGN KEY ("planta_id") REFERENCES "public"."m2_plantas"("id");



ALTER TABLE ONLY "public"."m2_chaves_api"
    ADD CONSTRAINT "m2_chaves_api_criada_por_fkey" FOREIGN KEY ("criada_por") REFERENCES "public"."m2_perfis"("id");



ALTER TABLE ONLY "public"."m2_cobertura_bairros"
    ADD CONSTRAINT "m2_cobertura_bairros_bairro_id_fkey" FOREIGN KEY ("bairro_id") REFERENCES "public"."m2_bairros"("id");



ALTER TABLE ONLY "public"."m2_editais_leilao"
    ADD CONSTRAINT "m2_editais_leilao_execucao_id_fkey" FOREIGN KEY ("execucao_id") REFERENCES "public"."m2_execucoes_ingestao"("id");



ALTER TABLE ONLY "public"."m2_editais_leilao"
    ADD CONSTRAINT "m2_editais_leilao_predio_id_fkey" FOREIGN KEY ("predio_id") REFERENCES "public"."m2_predios"("id");



ALTER TABLE ONLY "public"."m2_editais_leilao"
    ADD CONSTRAINT "m2_editais_leilao_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "public"."m2_unidades"("id");



ALTER TABLE ONLY "public"."m2_fatores_referencia"
    ADD CONSTRAINT "m2_fatores_referencia_bairro_id_fkey" FOREIGN KEY ("bairro_id") REFERENCES "public"."m2_bairros"("id");



ALTER TABLE ONLY "public"."m2_perfis"
    ADD CONSTRAINT "m2_perfis_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."m2_plantas"
    ADD CONSTRAINT "m2_plantas_predio_id_fkey" FOREIGN KEY ("predio_id") REFERENCES "public"."m2_predios"("id");



ALTER TABLE ONLY "public"."m2_predios"
    ADD CONSTRAINT "m2_predios_bairro_id_fkey" FOREIGN KEY ("bairro_id") REFERENCES "public"."m2_bairros"("id");



ALTER TABLE ONLY "public"."m2_transacoes"
    ADD CONSTRAINT "m2_transacoes_bairro_id_fkey" FOREIGN KEY ("bairro_id") REFERENCES "public"."m2_bairros"("id");



ALTER TABLE ONLY "public"."m2_transacoes"
    ADD CONSTRAINT "m2_transacoes_execucao_id_fkey" FOREIGN KEY ("execucao_id") REFERENCES "public"."m2_execucoes_ingestao"("id");



ALTER TABLE ONLY "public"."m2_transacoes"
    ADD CONSTRAINT "m2_transacoes_predio_id_fkey" FOREIGN KEY ("predio_id") REFERENCES "public"."m2_predios"("id");



ALTER TABLE ONLY "public"."m2_transacoes"
    ADD CONSTRAINT "m2_transacoes_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "public"."m2_unidades"("id");



ALTER TABLE ONLY "public"."m2_unidades"
    ADD CONSTRAINT "m2_unidades_planta_id_fkey" FOREIGN KEY ("planta_id") REFERENCES "public"."m2_plantas"("id");



ALTER TABLE ONLY "public"."m2_unidades"
    ADD CONSTRAINT "m2_unidades_predio_id_fkey" FOREIGN KEY ("predio_id") REFERENCES "public"."m2_predios"("id");



ALTER TABLE ONLY "public"."m2_vendas_consolidadas"
    ADD CONSTRAINT "m2_vendas_consolidadas_planta_id_fkey" FOREIGN KEY ("planta_id") REFERENCES "public"."m2_plantas"("id");



ALTER TABLE ONLY "public"."m2_vendas_consolidadas"
    ADD CONSTRAINT "m2_vendas_consolidadas_predio_id_fkey" FOREIGN KEY ("predio_id") REFERENCES "public"."m2_predios"("id");



ALTER TABLE ONLY "public"."m2_vendas_consolidadas"
    ADD CONSTRAINT "m2_vendas_consolidadas_transacao_apartamento_id_fkey" FOREIGN KEY ("transacao_apartamento_id") REFERENCES "public"."m2_transacoes"("id");



ALTER TABLE ONLY "public"."m2_vendas_consolidadas"
    ADD CONSTRAINT "m2_vendas_consolidadas_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "public"."m2_unidades"("id");



ALTER TABLE "public"."m2_anuncios" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "m2_anuncios_leitura_admin" ON "public"."m2_anuncios" FOR SELECT TO "authenticated" USING (( SELECT "public"."m2_eh_admin"() AS "m2_eh_admin"));



ALTER TABLE "public"."m2_bairros" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "m2_bairros_leitura_admin" ON "public"."m2_bairros" FOR SELECT TO "authenticated" USING (( SELECT "public"."m2_eh_admin"() AS "m2_eh_admin"));



ALTER TABLE "public"."m2_calibracoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "m2_calibracoes_leitura_admin" ON "public"."m2_calibracoes" FOR SELECT TO "authenticated" USING (( SELECT "public"."m2_eh_admin"() AS "m2_eh_admin"));



ALTER TABLE "public"."m2_chaves_api" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "m2_chaves_api_atualizacao_admin" ON "public"."m2_chaves_api" FOR UPDATE TO "authenticated" USING (( SELECT "public"."m2_eh_admin"() AS "m2_eh_admin")) WITH CHECK (( SELECT "public"."m2_eh_admin"() AS "m2_eh_admin"));



CREATE POLICY "m2_chaves_api_insercao_admin" ON "public"."m2_chaves_api" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."m2_eh_admin"() AS "m2_eh_admin") AND ("criada_por" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "m2_chaves_api_leitura_admin" ON "public"."m2_chaves_api" FOR SELECT TO "authenticated" USING (( SELECT "public"."m2_eh_admin"() AS "m2_eh_admin"));



ALTER TABLE "public"."m2_cobertura_bairros" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "m2_cobertura_bairros_leitura_admin" ON "public"."m2_cobertura_bairros" FOR SELECT TO "authenticated" USING (( SELECT "public"."m2_eh_admin"() AS "m2_eh_admin"));



ALTER TABLE "public"."m2_editais_leilao" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "m2_editais_leilao_leitura_admin" ON "public"."m2_editais_leilao" FOR SELECT TO "authenticated" USING (( SELECT "public"."m2_eh_admin"() AS "m2_eh_admin"));



ALTER TABLE "public"."m2_execucoes_ingestao" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "m2_execucoes_ingestao_leitura_admin" ON "public"."m2_execucoes_ingestao" FOR SELECT TO "authenticated" USING (( SELECT "public"."m2_eh_admin"() AS "m2_eh_admin"));



ALTER TABLE "public"."m2_fatores_referencia" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "m2_fatores_referencia_leitura_admin" ON "public"."m2_fatores_referencia" FOR SELECT TO "authenticated" USING (( SELECT "public"."m2_eh_admin"() AS "m2_eh_admin"));



ALTER TABLE "public"."m2_perfis" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "m2_perfis_leitura_propria" ON "public"."m2_perfis" FOR SELECT TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."m2_plantas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "m2_plantas_leitura_admin" ON "public"."m2_plantas" FOR SELECT TO "authenticated" USING (( SELECT "public"."m2_eh_admin"() AS "m2_eh_admin"));



ALTER TABLE "public"."m2_predios" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "m2_predios_leitura_admin" ON "public"."m2_predios" FOR SELECT TO "authenticated" USING (( SELECT "public"."m2_eh_admin"() AS "m2_eh_admin"));



ALTER TABLE "public"."m2_transacoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "m2_transacoes_leitura_admin" ON "public"."m2_transacoes" FOR SELECT TO "authenticated" USING (( SELECT "public"."m2_eh_admin"() AS "m2_eh_admin"));



ALTER TABLE "public"."m2_unidades" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "m2_unidades_leitura_admin" ON "public"."m2_unidades" FOR SELECT TO "authenticated" USING (( SELECT "public"."m2_eh_admin"() AS "m2_eh_admin"));



ALTER TABLE "public"."m2_vendas_consolidadas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "m2_vendas_consolidadas_leitura_admin" ON "public"."m2_vendas_consolidadas" FOR SELECT TO "authenticated" USING (( SELECT "public"."m2_eh_admin"() AS "m2_eh_admin"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."m2_atualizar_atualizado_em"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."m2_atualizar_atualizado_em"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."m2_buscar_predio_por_endereco"("texto" "text", "limiar_similaridade" real, "limite" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."m2_buscar_predio_por_endereco"("texto" "text", "limiar_similaridade" real, "limite" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."m2_buscar_predio_por_endereco"("texto" "text", "limiar_similaridade" real, "limite" integer) TO "service_role";



GRANT ALL ON TABLE "public"."m2_anuncios" TO "service_role";
GRANT SELECT ON TABLE "public"."m2_anuncios" TO "anon";
GRANT SELECT ON TABLE "public"."m2_anuncios" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."m2_casar_anuncio"("anuncio_id" "uuid", "predio_id" "uuid", "planta_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."m2_casar_anuncio"("anuncio_id" "uuid", "predio_id" "uuid", "planta_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."m2_casar_anuncio"("anuncio_id" "uuid", "predio_id" "uuid", "planta_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."m2_editais_leilao" TO "service_role";
GRANT SELECT ON TABLE "public"."m2_editais_leilao" TO "anon";
GRANT SELECT ON TABLE "public"."m2_editais_leilao" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."m2_casar_edital"("edital_id" "uuid", "predio_id" "uuid", "unidade_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."m2_casar_edital"("edital_id" "uuid", "predio_id" "uuid", "unidade_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."m2_casar_edital"("edital_id" "uuid", "predio_id" "uuid", "unidade_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."m2_plantas" TO "service_role";
GRANT SELECT ON TABLE "public"."m2_plantas" TO "anon";
GRANT SELECT ON TABLE "public"."m2_plantas" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."m2_confirmar_area_planta"("planta_id" "uuid", "area_privativa" numeric, "vagas_inclusas" smallint, "observacao" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."m2_confirmar_area_planta"("planta_id" "uuid", "area_privativa" numeric, "vagas_inclusas" smallint, "observacao" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."m2_confirmar_area_planta"("planta_id" "uuid", "area_privativa" numeric, "vagas_inclusas" smallint, "observacao" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."m2_eh_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."m2_eh_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."m2_eh_admin"() TO "service_role";



GRANT ALL ON TABLE "public"."m2_vendas_consolidadas" TO "service_role";
GRANT SELECT ON TABLE "public"."m2_vendas_consolidadas" TO "anon";
GRANT SELECT ON TABLE "public"."m2_vendas_consolidadas" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."m2_marcar_outlier"("venda_id" "uuid", "fora_da_curva" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."m2_marcar_outlier"("venda_id" "uuid", "fora_da_curva" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."m2_marcar_outlier"("venda_id" "uuid", "fora_da_curva" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."m2_marcar_planta_especial"("planta_id" "uuid", "especial" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."m2_marcar_planta_especial"("planta_id" "uuid", "especial" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."m2_marcar_planta_especial"("planta_id" "uuid", "especial" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."m2_normalizar_endereco"("texto" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."m2_normalizar_endereco"("texto" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."m2_normalizar_endereco"("texto" "text") TO "service_role";



GRANT ALL ON TABLE "public"."m2_bairros" TO "service_role";
GRANT SELECT ON TABLE "public"."m2_bairros" TO "anon";
GRANT SELECT ON TABLE "public"."m2_bairros" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."m2_bairros_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."m2_bairros_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."m2_bairros_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."m2_calibracoes" TO "service_role";
GRANT SELECT ON TABLE "public"."m2_calibracoes" TO "anon";
GRANT SELECT ON TABLE "public"."m2_calibracoes" TO "authenticated";



GRANT ALL ON TABLE "public"."m2_chaves_api" TO "service_role";
GRANT SELECT ON TABLE "public"."m2_chaves_api" TO "anon";
GRANT SELECT ON TABLE "public"."m2_chaves_api" TO "authenticated";



GRANT INSERT("nome") ON TABLE "public"."m2_chaves_api" TO "authenticated";



GRANT INSERT("prefixo") ON TABLE "public"."m2_chaves_api" TO "authenticated";



GRANT INSERT("hash_chave") ON TABLE "public"."m2_chaves_api" TO "authenticated";



GRANT UPDATE("ativa") ON TABLE "public"."m2_chaves_api" TO "authenticated";



GRANT INSERT("criada_por") ON TABLE "public"."m2_chaves_api" TO "authenticated";



GRANT ALL ON TABLE "public"."m2_cobertura_bairros" TO "service_role";
GRANT SELECT ON TABLE "public"."m2_cobertura_bairros" TO "anon";
GRANT SELECT ON TABLE "public"."m2_cobertura_bairros" TO "authenticated";



GRANT ALL ON TABLE "public"."m2_execucoes_ingestao" TO "service_role";
GRANT SELECT ON TABLE "public"."m2_execucoes_ingestao" TO "anon";
GRANT SELECT ON TABLE "public"."m2_execucoes_ingestao" TO "authenticated";



GRANT ALL ON TABLE "public"."m2_fatores_referencia" TO "service_role";
GRANT SELECT ON TABLE "public"."m2_fatores_referencia" TO "anon";
GRANT SELECT ON TABLE "public"."m2_fatores_referencia" TO "authenticated";



GRANT ALL ON TABLE "public"."m2_perfis" TO "service_role";
GRANT SELECT ON TABLE "public"."m2_perfis" TO "anon";
GRANT SELECT ON TABLE "public"."m2_perfis" TO "authenticated";



GRANT ALL ON TABLE "public"."m2_predios" TO "service_role";
GRANT SELECT ON TABLE "public"."m2_predios" TO "anon";
GRANT SELECT ON TABLE "public"."m2_predios" TO "authenticated";



GRANT ALL ON TABLE "public"."m2_transacoes" TO "service_role";
GRANT SELECT ON TABLE "public"."m2_transacoes" TO "anon";
GRANT SELECT ON TABLE "public"."m2_transacoes" TO "authenticated";



GRANT ALL ON TABLE "public"."m2_unidades" TO "service_role";
GRANT SELECT ON TABLE "public"."m2_unidades" TO "anon";
GRANT SELECT ON TABLE "public"."m2_unidades" TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







