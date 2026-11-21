// Configuração única do Vitest para o monorepo (seção 22.1: `npm test` na raiz).
// Recebe: nada. Devolve: a lista de projetos de teste (um por workspace com testes).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*", "apps/web"],
    passWithNoTests: true,
  },
});
