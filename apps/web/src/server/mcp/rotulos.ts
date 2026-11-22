/**
 * Seção 15: "Rótulos dos selos no painel e no MCP: Confirmada, Calibrada, Indicativa, Estimada, Sem dado."
 * As ferramentas calculam com os valores do enum; esta função troca pelos rótulos na saída.
 * Recebe: a resposta de uma ferramenta. Devolve: a mesma estrutura com os rótulos em selo, selo_area
 * e nas chaves de distribuicao_selos.
 */
import { ROTULO_SELO, type Selo } from "@/lib/selos";

const rotulo = (v: unknown) => (typeof v === "string" && v in ROTULO_SELO ? ROTULO_SELO[v as Selo] : v);

export function withSealLabels(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(withSealLabels);
  if (!valor || typeof valor !== "object") return valor;
  return Object.fromEntries(Object.entries(valor).map(([k, v]) => {
    if (k === "selo" || k === "selo_area") return [k, rotulo(v)];
    if (k === "distribuicao_selos" && v && typeof v === "object") return [k, Object.fromEntries(Object.entries(v).map(([s, n]) => [rotulo(s) as string, n]))];
    return [k, withSealLabels(v)];
  }));
}
