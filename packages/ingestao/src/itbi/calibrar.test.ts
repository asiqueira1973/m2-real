import { describe, expect, it } from "vitest";
import { githubOutputLine, itbiChanged } from "./rotina.js";

// Verifier do 8.8 / seção 9.2: "Planilha não mudou: a execução conclui com 0 gravadas; a calibração
// não roda." A CLI informa ao workflow se houve mudança; o passo da calibração depende disso.
describe("ITBI: calibrar só quando a planilha mudou (9.2)", () => {
  const ano = (linhasLidas: number) => ({ ano: 2026, resultado: { linhasLidas, linhasGravadas: linhasLidas, linhasDescartadas: 0 } });
  it("todos os anos sem mudança (0 lidas) → não calibra", () => {
    expect(itbiChanged([ano(0)])).toBe(false);
    expect(itbiChanged([])).toBe(false);
  });
  it("algum ano com planilha nova → calibra", () => {
    expect(itbiChanged([ano(0), { ...ano(21000), ano: 2025 }])).toBe(true);
  });
  it("linha do GITHUB_OUTPUT", () => {
    expect(githubOutputLine("calibrar", true)).toBe("calibrar=true\n");
  });
});
