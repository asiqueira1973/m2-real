/**
 * Utilidades da Claude API compartilhadas pelas coletas (épicos 8.5.1 e 8.15; seção 12).
 */
import { APIError } from "@anthropic-ai/sdk";

/**
 * Erro da Claude API que não melhora ao repetir: status 4xx, menos 408 (tempo), 409 e 429 (limite).
 * Recebe: o erro. Devolve: verdadeiro se for permanente (o documento é descartado; o prédio segue).
 */
export function isPermanentApiError(erro: unknown): boolean {
  return erro instanceof APIError && typeof erro.status === "number" && erro.status >= 400 && erro.status < 500 && ![408, 409, 429].includes(erro.status);
}
