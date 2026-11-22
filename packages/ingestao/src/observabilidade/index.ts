/**
 * Ponto de entrada de "@m2-real/ingestao/saude" (painel O4 e MCP O5 usam a mesma avaliação).
 * Os imports deste módulo e dos que ele carrega ficam sem extensão: o Turbopack do Next não mapeia
 * "./x.js" para "./x.ts" (o tsx e o Vitest aceitam os dois; moduleResolution = Bundler).
 */
export { avaliarSaude, type EstadoSaude, type RelatorioSaude, type SaudeRotina } from "./saude";
export { loadHealth } from "./dados";
