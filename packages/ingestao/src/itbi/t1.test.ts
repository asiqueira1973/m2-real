import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Guia } from "./guias.js";

// Fixture T1 (spec seção 22): guias reais de 2025 da Joaquim Antunes, 577 e da Caiubi, 324,
// extraídas da planilha da Fazenda pelo leitor do 8.3. Usada também na consolidação (8.4).
const { guias } = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "..", "fixtures", "itbi-t1-2025.json"), "utf8"),
) as { guias: Guia[] };

const joaquim = guias.filter((g) => g.logradouro === "R JOAQUIM ANTUNES" && g.numero === 577);
const tipo = (g: Guia) => (g.usoIptuGuia?.startsWith("APARTAMENTO") ? "apto" : g.usoIptuGuia?.startsWith("GARAGEM") ? "vaga" : "outro");

describe("T1 (seção 22) e critério 8.3: guias de 2025 da Joaquim Antunes, 577", () => {
  it("são 6: 3 apartamentos e 3 vagas", () => {
    expect(joaquim).toHaveLength(6);
    expect(joaquim.filter((g) => tipo(g) === "apto")).toHaveLength(3);
    expect(joaquim.filter((g) => tipo(g) === "vaga")).toHaveLength(3);
  });

  it.each([
    ["2025-07-15", "APTO 72", 1256081.09, 43918.91],
    ["2025-07-30", "APTO 14", 1130000, 100000],
    ["2025-11-14", "APTO.11", 1390000, 240000],
  ])("%s %s: apartamento %d e vaga %d (tabela T1)", (data, complemento, apto, vaga) => {
    const doDia = joaquim.filter((g) => g.dataTransacao === data);
    expect(doDia.find((g) => tipo(g) === "apto")).toMatchObject({ complemento, valorDeclarado: apto, ehCompraVenda: true });
    expect(doDia.find((g) => tipo(g) === "vaga")?.valorDeclarado).toBe(vaga);
  });

  it("Caiubi, 324: AP 24 em 29/08/2025, R$ 762.600, sem vaga separada", () => {
    const caiubi = guias.filter((g) => g.logradouro === "R CAIUBI" && g.numero === 324);
    expect(caiubi).toHaveLength(1);
    expect(caiubi[0]).toMatchObject({ complemento: "AP 24", dataTransacao: "2025-08-29", valorDeclarado: 762600 });
  });
});
