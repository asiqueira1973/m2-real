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
  // Épico 8.11: o painel mudou para /painel; endereços antigos salvos levam para o novo.
  async redirects() {
    return ["predios", "revisao", "evidencias", "execucoes", "chaves"].flatMap((p) => [
      { source: `/${p}`, destination: `/painel/${p}`, permanent: true },
      { source: `/${p}/:resto*`, destination: `/painel/${p}/:resto*`, permanent: true },
    ]);
  },
  async rewrites() {
    return [{ source: "/mcp", destination: "/api/mcp" }];
  },
};

export default nextConfig;
