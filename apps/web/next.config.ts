// Configuração do Next.js do painel + MCP (seção 4.1). Por ora, só os padrões.
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pacotes do monorepo publicados como TypeScript fonte.
  transpilePackages: ["@m2-real/db"],
};

export default nextConfig;
