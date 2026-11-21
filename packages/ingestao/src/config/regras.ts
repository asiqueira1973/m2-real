/**
 * Limiares e parâmetros das regras de negócio do M² Real.
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
