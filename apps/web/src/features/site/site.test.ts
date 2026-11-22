// Épico 8.11: o site relê os dados no ritmo de regras.ts e o texto não promete o que não existe.
import { SITE_REVALIDAR_S } from "@m2-real/ingestao/regras";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ASSISTENTES, CONVERSA, ENDERECO_MCP, PERGUNTAS } from "./conteudo";


describe("site (8.11)", () => {
  it("revalidate da página é o SITE_REVALIDAR_S (o Next exige literal; o Vitest não lê TSX, então lê o texto)", () => {
    const fonte = readFileSync(new URL("../../app/(site)/page.tsx", import.meta.url), "utf8");
    expect(Number(fonte.match(/export const revalidate = (\d+);/)?.[1])).toBe(SITE_REVALIDAR_S);
  });
  it("endereço do MCP em /mcp e os três assistentes com passo a passo", () => {
    expect(ENDERECO_MCP).toBe("https://fechouporquanto.com.br/mcp");
    expect(ASSISTENTES.map((a) => a.nome)).toEqual(["Claude", "ChatGPT", "Grok"]);
    for (const a of ASSISTENTES) expect(a.passos.length).toBeGreaterThanOrEqual(4);
  });
  it("exemplos não usam os endereços reservados para os prints (Caiubi e Joaquim Antunes) nem número de apartamento", () => {
    const textos = [CONVERSA.pergunta, CONVERSA.resumo, ...CONVERSA.vendas.map((v) => `${v.quando} ${v.valor} ${v.nota}`), ...PERGUNTAS.grupos.flatMap((g) => g.perguntas)].join(" ");
    expect(textos).not.toMatch(/caiubi|joaquim antunes/i);
    expect(textos).not.toMatch(/\bapto?\.?\s*\d/i);
  });
});
