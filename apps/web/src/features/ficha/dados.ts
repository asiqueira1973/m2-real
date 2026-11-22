/**
 * Dados da Ficha do prédio (seção 10; critério 4 do 8.7), lidos com a sessão do admin (RLS):
 * prédio, plantas com o histórico de calibração (7.2 calibracoes), vendas consolidadas do
 * período, anúncios e editais com predio_id do prédio. Alvo: abrir em ≤ 2 s (seção 17).
 * Recebe: id do prédio e meses do período (nulo = todas). Devolve: os dados, ou nulo se o prédio não existe.
 */
import { monthsBefore } from "@/lib/estatistica";
import { createSessionClient } from "@/lib/supabase/servidor";

/** Limite técnico do PostgREST (max_rows = 1.000 corta em silêncio): as vendas vêm em páginas. */
const PAGINA = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadBuildingFile(id: string, meses: number | null) {
  if (!UUID.test(id)) return null; // id que não é uuid: prédio inexistente, não erro de banco
  const supabase = await createSessionClient();
  const falha = (o: string, e: { message: string }) => new Error(`Falha ao ler ${o}: ${e.message}`);

  const desde = meses === null ? null : monthsBefore(new Date(), meses);
  const vendas = async () => {
    const todas = [];
    for (let de = 0; ; de += PAGINA) {
      let q = supabase.from("m2_vendas_consolidadas")
        .select("id, data_transacao, valor_total, valor_apartamento, valor_vagas, qtd_vagas_separadas, area_privativa, selo_area, m2_privativo, m2_iptu, fora_da_curva, vagas_inclusas_area, unidade:m2_unidades(complemento), planta:m2_plantas(fonte_area)")
        .eq("predio_id", id);
      if (desde) q = q.gte("data_transacao", desde);
      const { data, error } = await q.order("data_transacao", { ascending: false }).order("id").range(de, de + PAGINA - 1);
      if (error) throw falha("vendas", error);
      todas.push(...data);
      if (data.length < PAGINA) return todas;
    }
  };

  const [predio, plantas, listaVendas, anuncios, editais, unidades] = await Promise.all([
    supabase.from("m2_predios")
      .select("id, logradouro, numero, numeros_imovel, ano_construcao, qtd_pavimentos, padrao_iptu, vagas_cadastro_proprio, fator_predio, total_unidades_residenciais, bairro:m2_bairros(nome)")
      .eq("id", id).maybeSingle(),
    supabase.from("m2_plantas")
      .select("id, area_iptu_referencia, area_privativa, fator, selo, fonte_area, faixa_erro_pct, vagas_inclusas, quartos, qtd_unidades, especial, revisao_pendente, motivo_revisao, calibracoes:m2_calibracoes(id, criado_em, area_privativa, fator, selo, fonte, autor, observacao)")
      .eq("predio_id", id).order("area_iptu_referencia"),
    vendas(),
    supabase.from("m2_anuncios")
      .select("id, url, dominio, fonte, finalidade, area_privativa, area_privativa_min, area_privativa_max, quartos, vagas, andar, preco_pedido, status_casamento, planta_id, coletado_em")
      .eq("predio_id", id).order("coletado_em", { ascending: false }),
    supabase.from("m2_editais_leilao")
      .select("id, url, url_documento, dominio, complemento_extraido, matricula, area_privativa, area_total, vagas, valor_avaliacao, data_leilao, status_casamento, origem_documento, unidade_id, unidade:m2_unidades(complemento, planta_id)")
      .eq("predio_id", id).order("coletado_em", { ascending: false }),
    // Unidades de apartamento, para "trocar a unidade" de um edital (8.8). O maior prédio tem 784,
    // abaixo do max_rows de 1.000 do PostgREST.
    supabase.from("m2_unidades").select("id, complemento").eq("predio_id", id).eq("tipo_unidade", "apartamento").order("complemento").limit(1000),
  ]);
  if (predio.error) throw falha("o prédio", predio.error);
  if (!predio.data) return null;
  if (plantas.error) throw falha("as plantas", plantas.error);
  if (anuncios.error) throw falha("os anúncios", anuncios.error);
  if (editais.error) throw falha("os editais", editais.error);
  if (unidades.error) throw falha("as unidades", unidades.error);

  // Histórico (aba Histórico): as calibrações de todas as plantas, da mais recente para a mais antiga.
  const historico = plantas.data
    .flatMap((p) => p.calibracoes.map((c) => ({ ...c, plantaArea: p.area_iptu_referencia })))
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  return { predio: predio.data, plantas: plantas.data, vendas: listaVendas, anuncios: anuncios.data, editais: editais.data, unidades: unidades.data, historico };
}
