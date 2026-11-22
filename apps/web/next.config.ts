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
};

export default nextConfig;
