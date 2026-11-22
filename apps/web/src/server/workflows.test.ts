import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WORKFLOW_DA_ROTINA } from "./github";

// Verifier do 8.8: o "Executar agora" manda só {ref: "main"} (13.1). Um workflow de rotina com input
// obrigatório sem valor padrão é recusado pelo GitHub (HTTP 422) — era o caso do ingestao-iptu.
const PASTA = join(import.meta.dirname, "..", "..", "..", "..", ".github", "workflows");
const ler = (f: string) => readFileSync(join(PASTA, f), "utf8");

/** Inputs de workflow_dispatch: nome → {obrigatório, tem padrão}. Leitura simples do YAML dos nossos arquivos. */
function inputs(yml: string): Record<string, { required: boolean; temDefault: boolean }> {
  const bloco = yml.split(/\n\s*inputs:\s*\n/)[1]?.split(/\n\S|\nconcurrency:|\njobs:/)[0] ?? "";
  const r: Record<string, { required: boolean; temDefault: boolean }> = {};
  for (const m of bloco.matchAll(/\n?\s{6}([a-z_]+):\s*\n((?:\s{8}.*\n?)*)/g)) {
    r[m[1]!] = { required: /required:\s*true/.test(m[2]!), temDefault: /default:/.test(m[2]!) };
  }
  return r;
}

describe("workflows das rotinas (4.4; 13.1)", () => {
  it.each(Object.entries(WORKFLOW_DA_ROTINA))("%s (%s) aceita o disparo sem inputs", (_, arquivo) => {
    const yml = ler(arquivo);
    expect(yml).toMatch(/workflow_dispatch:/);
    for (const [nome, i] of Object.entries(inputs(yml))) {
      expect(i.required && !i.temDefault, `input "${nome}" obrigatório sem padrão`).toBe(false);
    }
  });

  it("todo workflow declara permissions (token mínimo do GitHub)", () => {
    for (const f of readdirSync(PASTA).filter((x) => x.endsWith(".yml"))) expect(ler(f), f).toMatch(/\npermissions:/);
  });

  it("nenhum input entra direto num run (passa por env, contra injeção)", () => {
    for (const f of readdirSync(PASTA).filter((x) => x.endsWith(".yml"))) {
      for (const linha of ler(f).split("\n").filter((l) => /^\s*-?\s*run:/.test(l))) expect(linha, f).not.toMatch(/\$\{\{\s*inputs\./);
    }
  });

  // Seção 9.2: "Planilha não mudou: a execução conclui com 0 gravadas; a calibração não roda."
  it("ingestao-itbi só calibra quando a planilha mudou", () => {
    const yml = ler("ingestao-itbi.yml");
    expect(yml).toMatch(/id:\s*itbi/);
    expect(yml).toMatch(/if:\s*steps\.itbi\.outputs\.calibrar\s*==\s*'true'/);
  });
});
