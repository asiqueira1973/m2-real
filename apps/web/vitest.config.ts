// Projeto de testes do app web (rotas, MCP e utilitários de servidor nos épicos 8.7–8.9).
import { resolve } from "node:path";
import { defineProject } from "vitest/config";

export default defineProject({
  // Mesmo alias do tsconfig ("@/" = src/), para os módulos do servidor serem testados como são importados.
  resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
  test: {
    name: "web",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
