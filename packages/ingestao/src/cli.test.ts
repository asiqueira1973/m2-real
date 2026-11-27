import { describe, expect, it } from "vitest";
import { limitFromEnv, parseArgs } from "./cli.js";
import { ROTINAS } from "./config/regras.js";

describe("cli: rotinas da seção 4.4", () => {
  it("aceita as cinco rotinas do spec", () => {
    expect(ROTINAS).toEqual([
      "ingestao-itbi",
      "ingestao-iptu",
      "coleta-anuncios",
      "coleta-leiloes",
      "calibracao",
    ]);
    for (const r of ROTINAS) expect(parseArgs([r, "2025"])).toEqual({ rotina: r, args: ["2025"] });
  });

  it("aceita os nomes curtos da seção 18.5 (npm run ingestao -- itbi 2025)", () => {
    expect(parseArgs(["itbi", "2025"]).rotina).toBe("ingestao-itbi");
    expect(parseArgs(["iptu"]).rotina).toBe("ingestao-iptu");
    expect(parseArgs(["anuncios"]).rotina).toBe("coleta-anuncios");
    expect(parseArgs(["leiloes"]).rotina).toBe("coleta-leiloes");
  });

  it("recusa rotina desconhecida ou ausente, listando as válidas", () => {
    expect(() => parseArgs(["apagar-tudo"])).toThrow(/Rotina inválida.*ingestao-itbi/);
    expect(() => parseArgs([])).toThrow(/Rotina inválida/);
  });
});

describe("tetos lidos das variáveis (seção 17)", () => {
  it("número positivo vale; vazio, texto, zero ou negativo caem no padrão (um NaN desligaria o teto)", () => {
    expect(limitFromEnv("50")).toBe(50);
    expect([limitFromEnv(undefined), limitFromEnv(""), limitFromEnv("abc"), limitFromEnv("0"), limitFromEnv("-5")]).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });
});
