/**
 * Lógica pura das telas de revisão (épico 8.8; seções 10 e 15).
 */
import { area, data, reais, reaisPorM2 } from "./formato";

/**
 * Critério 2 do 8.8: "Confirmar área" só fica habilitado com observação (a função do banco também
 * exige) e com área privativa positiva. Recebe: área digitada e observação. Devolve: se pode enviar.
 */
export function canConfirm(areaDigitada: string, observacao: string): boolean {
  const a = Number(areaDigitada.replace(",", "."));
  return observacao.trim().length > 0 && Number.isFinite(a) && a > 0;
}

/** Item de m2_fila_revisao (os campos usados no resumo). */
export interface ItemFila {
  tipo: string;
  area_iptu: number | null;
  area_privativa: number | null;
  fator: number | null;
  fator_predio: number | null;
  areas_anuncios: number[] | null;
  areas_editais: number[] | null;
  data_venda: string | null;
  unidade: string | null;
  valor_total: number | null;
  m2_privativo: number | null;
}

const lista = (v: readonly number[]) => {
  const t = v.map((x) => String(Number(x)).replace(".", ","));
  return t.length <= 1 ? t.join("") : `${t.slice(0, -1).join(", ")} e ${t.at(-1)}`;
};

/**
 * Resumo das evidências de um item da fila (seção 10: "planta de 132 m²: anúncios com 94 e 107 m²").
 * Recebe: o item. Devolve: a frase.
 */
export function evidenceSummary(i: ItemFila): string {
  if (i.tipo === "venda") {
    return `venda de ${data(i.data_venda)}${i.unidade ? ` (${i.unidade})` : ""}: ${reais(i.valor_total)}, ${reaisPorM2(i.m2_privativo)}`;
  }
  const partes = [`planta de ${area(i.area_iptu)}`];
  const anuncios = i.areas_anuncios?.filter((x) => x !== null) ?? [];
  const editais = i.areas_editais?.filter((x) => x !== null) ?? [];
  const evid = [
    anuncios.length ? `${anuncios.length === 1 ? "anúncio" : "anúncios"} com ${lista(anuncios)} m²` : null,
    editais.length ? `${editais.length === 1 ? "edital" : "editais"} com ${lista(editais)} m²` : null,
  ].filter(Boolean);
  if (evid.length) partes.push(evid.join("; "));
  else if (i.area_privativa !== null) partes.push(`área atual ${area(Number(i.area_privativa))}`);
  if (i.fator !== null && i.fator_predio !== null) partes.push(`fator ${String(Number(i.fator)).replace(".", ",")} × prédio ${String(Number(i.fator_predio)).replace(".", ",")}`);
  return `${partes[0]}${partes.length > 1 ? `: ${partes.slice(1).join("; ")}` : ""}`;
}

/** Aba da ficha que resolve cada tipo de item (abre a ficha "na aba certa", seção 10). */
export function tabFor(tipo: string): "plantas" | "vendas" {
  return tipo === "venda" ? "vendas" : "plantas";
}

/** Recebe: itens ordenados por motivo. Devolve: grupos [motivo, itens, total] na ordem recebida. */
export function groupByReason<T extends { motivo: string; total_motivo: number }>(itens: readonly T[]): { motivo: string; itens: T[]; total: number }[] {
  const grupos: { motivo: string; itens: T[]; total: number }[] = [];
  for (const i of itens) {
    const g = grupos.at(-1);
    if (g && g.motivo === i.motivo) g.itens.push(i);
    else grupos.push({ motivo: i.motivo, itens: [i], total: Number(i.total_motivo) });
  }
  return grupos;
}
