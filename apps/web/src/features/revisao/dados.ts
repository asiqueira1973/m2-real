/**
 * Dados das telas de qualidade (seção 10; critérios 1 e 3 do 8.8), lidos com a sessão do admin.
 */
import { COBERTURA_JANELA_MESES } from "@m2-real/ingestao/regras";
import { createSessionClient } from "@/lib/supabase/servidor";

/** Itens por grupo na fila (limite técnico; o filtro de motivo pagina o grupo). */
export const ITENS_POR_GRUPO = 20;

/**
 * Fila de revisão (m2_fila_revisao). Recebe: bairro, motivo e página do grupo filtrado.
 * Devolve: bairros (para o filtro) e os itens, já em ordem de motivo e volume de vendas.
 */
export async function loadQueue(bairro: number | null, motivo: string | null, pagina: number) {
  const supabase = await createSessionClient();
  const [bairros, fila] = await Promise.all([
    supabase.from("m2_bairros").select("id, nome").order("nome"),
    supabase.rpc("m2_fila_revisao", {
      bairro, motivo, janela_meses: COBERTURA_JANELA_MESES, limite: ITENS_POR_GRUPO, deslocamento: motivo ? (pagina - 1) * ITENS_POR_GRUPO : 0,
    } as never),
  ]);
  if (bairros.error) throw new Error(`Falha ao ler bairros: ${bairros.error.message}`);
  if (fila.error) throw new Error(`Falha ao ler a fila de revisão: ${fila.error.message}`);
  return { bairros: bairros.data, itens: fila.data ?? [] };
}

/** Status que aparecem em Evidências sem vínculo (seção 10). */
export const STATUS_EVIDENCIAS = {
  anuncios: ["ambiguo", "sem_predio"],
  editais: ["sem_predio", "casado_predio"],
} as const;

/** Limite técnico de linhas por aba (bem abaixo do max_rows de 1.000). */
export const EVIDENCIAS_LIMITE = 200;

/**
 * Evidências sem vínculo. Recebe: aba, domínio e status (filtros; nulos = todos). Devolve: as linhas
 * da aba e os domínios disponíveis (para o filtro).
 */
export async function loadUnlinked(aba: "anuncios" | "editais", dominio: string | null, status: string | null) {
  const supabase = await createSessionClient();
  const statuses = (STATUS_EVIDENCIAS[aba] as readonly string[]).filter((s) => !status || s === status);
  if (aba === "anuncios") {
    let q = supabase.from("m2_anuncios")
      .select("id, url, dominio, fonte, logradouro_extraido, numero_extraido, nome_condominio, area_privativa, area_privativa_min, area_privativa_max, quartos, vagas, status_casamento, predio_id, coletado_em")
      .in("status_casamento", statuses as never);
    if (dominio) q = q.eq("dominio", dominio);
    const { data, error } = await q.order("coletado_em", { ascending: false }).limit(EVIDENCIAS_LIMITE);
    if (error) throw new Error(`Falha ao ler anúncios: ${error.message}`);
    return { anuncios: data, editais: [] as never[] };
  }
  let q = supabase.from("m2_editais_leilao")
    .select("id, url, url_documento, dominio, logradouro_extraido, numero_extraido, complemento_extraido, matricula, area_privativa, vagas, status_casamento, predio_id, coletado_em")
    .in("status_casamento", statuses as never);
  if (dominio) q = q.eq("dominio", dominio);
  const { data, error } = await q.order("coletado_em", { ascending: false }).limit(EVIDENCIAS_LIMITE);
  if (error) throw new Error(`Falha ao ler editais: ${error.message}`);
  return { anuncios: [] as never[], editais: data };
}
