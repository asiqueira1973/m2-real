/**
 * Ponto de entrada de "@m2-real/ingestao/saude" (painel O4 e MCP O5 usam a mesma avaliação).
 */
export { avaliarSaude, type EstadoSaude, type RelatorioSaude, type SaudeRotina } from "./saude.js";
export { loadHealth } from "./dados.js";
