/**
 * Servidor MCP do Fechou por Quanto (seções 6.3 e 13.2; épico 8.9): /api/mcp e /mcp (rewrite em
 * next.config.ts). Stateless (mcp-handler 2.x). Exige Authorization: Bearer <chave> (401 com a
 * mensagem da seção 15). Lê o banco com a credencial de serviço, só no servidor.
 */
import { createServiceClient } from "@m2-real/db/server";
import { createMcpHandler } from "mcp-handler";
import { bearerFrom, unauthorized, verifyKey } from "@/server/mcp/auth";
import { DESCRICOES, ESQUEMAS, runTool } from "@/server/mcp/ferramentas";

const mcp = createMcpHandler(
  (server) => {
    // O registro é o mesmo para as 5; a união dos schemas não cabe na sobrecarga tipada do SDK.
    const registrar = server.registerTool.bind(server) as unknown as (nome: string, config: object, cb: (entrada: never) => Promise<unknown>) => void;
    for (const nome of Object.keys(ESQUEMAS) as (keyof typeof ESQUEMAS)[]) {
      registrar(nome, { title: nome, description: DESCRICOES[nome], inputSchema: ESQUEMAS[nome], annotations: { readOnlyHint: true } }, async (entrada) => {
        const resposta = await runTool(createServiceClient(), nome, entrada);
        return { content: [{ type: "text" as const, text: JSON.stringify(resposta, null, 2) }] };
      });
    }
  },
  { serverInfo: { name: "Fechou por Quanto", version: "1.0.0" } },
);

/** Confere a chave antes de entregar ao MCP. Recebe: a requisição. Devolve: a resposta do MCP ou 401. */
async function handler(request: Request): Promise<Response> {
  const chave = bearerFrom(request.headers.get("authorization"));
  if (!chave || !(await verifyKey(createServiceClient(), chave))) return unauthorized();
  return mcp(request);
}

export { handler as GET, handler as POST, handler as DELETE };
