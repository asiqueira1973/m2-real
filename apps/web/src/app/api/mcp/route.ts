/**
 * Rota do servidor MCP (seção 13.2): /api/mcp e /mcp (rewrite em next.config.ts). A lógica e a
 * credencial de serviço ficam em src/server/mcp/handler.ts.
 */
import { mcpHandler } from "@/server/mcp/handler";

export { mcpHandler as GET, mcpHandler as POST, mcpHandler as DELETE };
