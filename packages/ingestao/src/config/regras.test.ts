import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUSCA_LIMITE_RESULTADOS, BUSCA_SIMILARIDADE_MINIMA } from "./regras.js";

// Raiz do repositório a partir de packages/ingestao/src/config.
const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");

/** Lê todas as migrations, em ordem, como um texto só. */
function lerMigrations(): string {
  const dir = join(RAIZ, "supabase", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
}

describe("config/regras.ts × banco (seção 18.2: um número, um lugar)", () => {
  it("regra 11.5: defaults de m2_buscar_predio_por_endereco batem com as constantes", () => {
    const sql = lerMigrations();
    const assinatura = sql.match(
      /function public\.m2_buscar_predio_por_endereco\(([\s\S]*?)\)\s*returns/,
    )?.[1];
    expect(assinatura, "função não encontrada nas migrations").toBeDefined();
    expect(assinatura).toMatch(new RegExp(`limiar_similaridade real default ${BUSCA_SIMILARIDADE_MINIMA}\\b`));
    expect(assinatura).toMatch(new RegExp(`limite integer default ${BUSCA_LIMITE_RESULTADOS}\\b`));
  });

  it("regra 11.5: valores do spec", () => {
    expect(BUSCA_SIMILARIDADE_MINIMA).toBe(0.4);
    expect(BUSCA_LIMITE_RESULTADOS).toBe(5);
  });
});
