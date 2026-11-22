"use server";
/**
 * Ações de revisão do painel (seção 5; 7.4; critérios 2 e 3 do 8.8). Cada uma confere o admin e só
 * chama a função SECURITY DEFINER do banco (que confere de novo com m2_eh_admin()); nenhuma faz
 * update direto em tabela. Devolvem {erro} para a tela mostrar, e revalidam as telas afetadas.
 */
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/sessao";

export interface Resultado {
  erro?: string;
  ok?: boolean;
}

/** Mensagem do banco → texto para o admin (sem detalhes técnicos). */
function mensagem(e: { code?: string; message: string }): string {
  if (e.code === "42501") return "Acesso negado.";
  if (e.code === "22023") return e.message; // validações da função, já em português
  if (e.code === "P0002") return "Registro não encontrado.";
  return "Não foi possível salvar. Tente de novo.";
}

/** Revalida a ficha e as listas que mostram o que mudou. */
function revalidar(predioId?: string) {
  if (predioId) revalidatePath(`/painel/predios/${predioId}`);
  revalidatePath("/painel/revisao");
  revalidatePath("/painel/evidencias");
  revalidatePath("/painel/predios");
}

/**
 * "Confirmar área" (critério 2): m2_confirmar_area_planta. Recebe: planta, prédio (para revalidar),
 * área, vagas inclusas (vazio = nulo) e observação. Devolve: ok ou erro.
 */
export async function confirmArea(_: Resultado, form: FormData): Promise<Resultado> {
  const s = await requireAdmin();
  if (!s.ok) return { erro: s.erro };
  const area = Number(String(form.get("area") ?? "").replace(",", "."));
  const vagasTexto = String(form.get("vagas") ?? "").trim();
  const observacao = String(form.get("observacao") ?? "").trim();
  if (!observacao) return { erro: "Escreva a observação." };
  if (!Number.isFinite(area) || area <= 0) return { erro: "Informe a área privativa." };
  const { error } = await s.supabase.rpc("m2_confirmar_area_planta", {
    planta_id: String(form.get("planta")), area_privativa: area,
    vagas_inclusas: vagasTexto === "" ? (null as never) : Number(vagasTexto), observacao,
  });
  if (error) return { erro: mensagem(error) };
  revalidar(String(form.get("predio")));
  return { ok: true };
}

/** "Marcar/desmarcar especial" (seção 10): m2_marcar_planta_especial. */
export async function setSpecial(plantaId: string, predioId: string, especial: boolean): Promise<Resultado> {
  const s = await requireAdmin();
  if (!s.ok) return { erro: s.erro };
  const { error } = await s.supabase.rpc("m2_marcar_planta_especial", { planta_id: plantaId, especial });
  if (error) return { erro: mensagem(error) };
  revalidar(predioId);
  return { ok: true };
}

/** "Marcar/desmarcar fora da curva" (seção 10; regra 11.16): m2_marcar_outlier. */
export async function setOutlier(vendaId: string, predioId: string, foraDaCurva: boolean): Promise<Resultado> {
  const s = await requireAdmin();
  if (!s.ok) return { erro: s.erro };
  const { error } = await s.supabase.rpc("m2_marcar_outlier", { venda_id: vendaId, fora_da_curva: foraDaCurva });
  if (error) return { erro: mensagem(error) };
  revalidar(predioId);
  return { ok: true };
}

/**
 * Casar ou descartar anúncio (critério 3): m2_casar_anuncio. Prédio nulo = descartar; planta
 * nula = casado ao prédio. Recebe: anúncio, prédio e planta. Devolve: ok ou erro.
 */
export async function matchAd(anuncioId: string, predioId: string | null, plantaId: string | null, predioAnterior?: string): Promise<Resultado> {
  const s = await requireAdmin();
  if (!s.ok) return { erro: s.erro };
  const { error } = await s.supabase.rpc("m2_casar_anuncio", { anuncio_id: anuncioId, predio_id: predioId as never, planta_id: plantaId as never });
  if (error) return { erro: mensagem(error) };
  revalidar(predioId ?? predioAnterior);
  if (predioAnterior && predioAnterior !== predioId) revalidatePath(`/painel/predios/${predioAnterior}`);
  return { ok: true };
}

/**
 * Casar ou descartar edital (critério 3): m2_casar_edital. Prédio nulo = descartar; unidade nula =
 * casado ao prédio. Recebe: edital, prédio e unidade. Devolve: ok ou erro.
 */
export async function matchEdital(editalId: string, predioId: string | null, unidadeId: string | null, predioAnterior?: string): Promise<Resultado> {
  const s = await requireAdmin();
  if (!s.ok) return { erro: s.erro };
  const { error } = await s.supabase.rpc("m2_casar_edital", { edital_id: editalId, predio_id: predioId as never, unidade_id: unidadeId as never });
  if (error) return { erro: mensagem(error) };
  revalidar(predioId ?? predioAnterior);
  if (predioAnterior && predioAnterior !== predioId) revalidatePath(`/painel/predios/${predioAnterior}`);
  return { ok: true };
}

/**
 * Busca de prédio para "Vincular" (seção 10, Evidências sem vínculo): m2_buscar_predio_por_endereco
 * (11.5). Recebe: endereço. Devolve: até 5 prédios.
 */
export async function searchBuildings(texto: string) {
  const s = await requireAdmin();
  if (!s.ok) return { erro: s.erro, predios: [] };
  if (texto.trim().length < 3) return { predios: [] };
  const { data, error } = await s.supabase.rpc("m2_buscar_predio_por_endereco", { texto: texto.slice(0, 200) });
  if (error) return { erro: mensagem(error), predios: [] };
  return { predios: data ?? [] };
}

/** Plantas e unidades de apartamento de um prédio, para escolher no vínculo. */
export async function buildingOptions(predioId: string) {
  const s = await requireAdmin();
  if (!s.ok) return { erro: s.erro, plantas: [], unidades: [] };
  const [plantas, unidades] = await Promise.all([
    s.supabase.from("m2_plantas").select("id, area_iptu_referencia, qtd_unidades").eq("predio_id", predioId).order("area_iptu_referencia"),
    s.supabase.from("m2_unidades").select("id, complemento").eq("predio_id", predioId).eq("tipo_unidade", "apartamento").order("complemento").limit(1000),
  ]);
  if (plantas.error || unidades.error) return { erro: "Não foi possível ler o prédio.", plantas: [], unidades: [] };
  return { plantas: plantas.data, unidades: unidades.data };
}
