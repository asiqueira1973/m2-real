/**
 * Servidor MCP do Fechou por Quanto (seções 6.3 e 13.2; épico 8.9). SÓ SERVIDOR: usa a credencial de
 * serviço (fica em src/server/, como manda o CLAUDE.md; a rota só reexporta). Stateless (mcp-handler 2.x).
 * Exige Authorization: Bearer <chave ou token OAuth> (401 com a mensagem da seção 15; 429 no limite
 * da regra 11.19).
 */
import { createServiceClient } from "@m2-real/db/server";
import { createMcpHandler } from "mcp-handler";
import { after } from "next/server";
import { bearerFrom, tooManyRequests, touchKey, unauthorized, verifyCredential } from "./auth";
import { DESCRICOES, ESQUEMAS, runTool } from "./ferramentas";
import { withSealLabels } from "./rotulos";

const mcp = createMcpHandler(
  (server) => {
    // O registro é o mesmo para as 5; a união dos schemas não cabe na sobrecarga tipada do SDK.
    const registrar = server.registerTool.bind(server) as unknown as (nome: string, config: object, cb: (entrada: never) => Promise<unknown>) => void;
    for (const nome of Object.keys(ESQUEMAS) as (keyof typeof ESQUEMAS)[]) {
      registrar(nome, { title: nome, description: DESCRICOES[nome], inputSchema: ESQUEMAS[nome], annotations: { readOnlyHint: true } }, async (entrada) => {
        const resposta = withSealLabels(await runTool(createServiceClient(), nome, entrada)); // seção 15: rótulos dos selos
        return { content: [{ type: "text" as const, text: JSON.stringify(resposta, null, 2) }] };
      });
    }
  },
  { serverInfo: { name: "Fechou por Quanto", version: "1.0.0" } },
);

/**
 * Confere a credencial e entrega ao MCP. Recebe: a requisição. Devolve: a resposta do MCP, 401 ou 429.
 * Chave do painel: ultimo_uso_em é gravado com after() do Next (depois da resposta, sem ser cortado na
 * Vercel). Token OAuth: o uso já foi contado na conferência.
 */
export async function mcpHandler(request: Request): Promise<Response> {
  const valor = bearerFrom(request.headers.get("authorization"));
  const db = createServiceClient();
  const credencial = valor ? await verifyCredential(db, valor) : null;
  if (!credencial) return unauthorized();
  if (credencial.tipo === "token" && !credencial.permitido) return tooManyRequests(credencial.esperaS);
  if (credencial.tipo === "chave") after(() => touchKey(db, credencial.id));
  return mcp(request);
}
