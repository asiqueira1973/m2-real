// Projeto de testes do app web (rotas, MCP e utilitários de servidor nos épicos 8.7–8.9).
import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "web",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
