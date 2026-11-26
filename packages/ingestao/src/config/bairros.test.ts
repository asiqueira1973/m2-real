// 8.14: a lista de bairros do código é a mesma do seed (fonte única para MCP, sobre e site).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BAIRROS_COBERTOS, listaPorExtenso, SLUGS_BAIRROS } from "./bairros";

describe("bairros cobertos (tabela 11.2; 8.14)", () => {
  it("slugs e nomes iguais aos do supabase/seed.sql", () => {
    const seed = readFileSync(new URL("../../../../supabase/seed.sql", import.meta.url), "utf8");
    const doSeed = [...seed.matchAll(/\('([^']+)',\s*'([a-z0-9-]+)',/g)].map((m) => ({ slug: m[2], nome: m[1] }));
    expect(doSeed).toEqual(BAIRROS_COBERTOS.map((b) => ({ slug: b.slug, nome: b.nome })));
    expect(SLUGS_BAIRROS).toHaveLength(14);
  });
  it("lista por extenso", () => {
    expect(listaPorExtenso(["A", "B", "C"])).toBe("A, B e C");
    expect(listaPorExtenso(["A"])).toBe("A");
  });
});
