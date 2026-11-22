// Configuração do Next.js do painel + MCP (seção 4.1).
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

// Ambiente local: o mesmo .env.local da raiz que a ingestão usa (seção 18.4). Na Vercel as
// variáveis vêm do projeto e o arquivo não existe.
const envRaiz = resolve(import.meta.dirname, "../../.env.local");
if (existsSync(envRaiz)) process.loadEnvFile(envRaiz);

const nextConfig: NextConfig = {
  // Pacotes do monorepo publicados como TypeScript fonte.
  transpilePackages: ["@m2-real/db", "@m2-real/ingestao"],
  // Épico 8.9 (decisão do usuário): o MCP também responde em /mcp (fechouporquanto.com.br/mcp).
  async rewrites() {
    return [{ source: "/mcp", destination: "/api/mcp" }];
  },
};

export default nextConfig;
