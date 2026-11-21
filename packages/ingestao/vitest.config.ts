// Projeto de testes da ingestão (seção 22: regras da seção 11 testadas com Vitest).
import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "ingestao",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
