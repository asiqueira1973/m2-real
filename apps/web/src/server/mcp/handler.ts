/**
 * Servidor MCP do Fechou por Quanto (seções 6.3 e 13.2; épico 8.9). SÓ SERVIDOR: usa a credencial de
 * serviço (fica em src/server/, como manda o CLAUDE.md; a rota só reexporta). Stateless (mcp-handler 2.x).
 * Exige Authorization: Bearer <chave ou token OAuth> (401 com a mensagem da seção 15; 429 no limite
 * da regra 11.22).
 */
import { createServiceClient } from "@m2-real/db/server";
import { createMcpHandler } from "mcp-handler";
import { after } from "next/server";
import { toolCalls, track } from "@/server/eventos/visao";
import { bearerFrom, tooManyRequests, touchKey, unauthorized, verifyCredential, type Credencial } from "./auth";
import { DESCRICOES, ESQUEMAS, runTool } from "./ferramentas";
import { withSealLabels } from "./rotulos";
import { INSTRUCOES_MCP } from "./sobre";

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
  { serverInfo: { name: "Fechou por Quanto", version: "1.0.0" }, instructions: INSTRUCOES_MCP },
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
  // Seção 21: um evento por ferramenta chamada (só o nome da ferramenta; nunca os argumentos).
  for (const ferramenta of toolCalls(await request.clone().json().catch(() => null))) {
    track("fechou_por_quanto_pergunta", async () => {
      const { quem, cliente } = await whoCalled(db, credencial);
      return { quem, propriedades: { ferramenta, credencial: credencial.tipo === "token" ? "oauth" : "chave", cliente } };
    });
  }
  return mcp(request);
}

/**
 * Quem chamou (seção 21): no token OAuth, o e-mail da conta e o nome do app (Claude, ChatGPT…);
 * na chave do painel, "chave_<id>". Roda depois da resposta. Recebe: cliente e credencial.
 */
async function whoCalled(db: ReturnType<typeof createServiceClient>, credencial: Credencial): Promise<{ quem: string; cliente: string | null }> {
  if (credencial.tipo === "chave") return { quem: `chave_${credencial.id}`, cliente: null };
  const { data } = await db.from("m2_tokens_mcp").select("m2_clientes(email), m2_oauth_clientes(nome)").eq("id", credencial.id).maybeSingle();
  const linha = data as { m2_clientes: { email: string } | null; m2_oauth_clientes: { nome: string } | null } | null;
  return { quem: linha?.m2_clientes?.email ?? `token_${credencial.id}`, cliente: linha?.m2_oauth_clientes?.nome?.slice(0, 100) ?? null };
}
