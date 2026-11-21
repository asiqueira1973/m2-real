/**
 * Limiares e parâmetros das regras de negócio do Fechou por Quanto.
 *
 * Seção 18.2 do spec: todo número de regra (3%, 12%, 60%, 8 plantas, 150 prédios,
 * 90 dias…) fica aqui, um por constante, com o número da regra no comentário.
 * Nenhum número mágico espalhado pelo código.
 *
 * As constantes entram épico a épico, conforme cada regra é implementada.
 */

/**
 * Rotinas agendadas da seção 4.4. A CLI (`tsx src/cli.ts <rotina>`) e a rota
 * `/api/execucoes/disparar` (seção 13.1) só aceitam estes nomes.
 */
export const ROTINAS = [
  "ingestao-itbi",
  "ingestao-iptu",
  "coleta-anuncios",
  "coleta-leiloes",
  "calibracao",
] as const;

export type Rotina = (typeof ROTINAS)[number];

// ---------------------------------------------------------------------------
// Regra 11.5 — busca de endereço (função m2_buscar_predio_por_endereco).
// Os defaults da função SQL espelham estes valores; o MCP (8.9) passa estas
// constantes explicitamente. Um teste confere que a migration bate com elas.
// ---------------------------------------------------------------------------

/** Regra 11.5: similaridade trigram mínima do logradouro para aceitar um prédio. */
export const BUSCA_SIMILARIDADE_MINIMA = 0.4;

/** Regra 11.5: quantos prédios a busca devolve no máximo ("até 5 prédios", 7.4). */
export const BUSCA_LIMITE_RESULTADOS = 5;
