import { describe, expect, it } from "vitest";
import { downloadIfExists } from "./brutos.js";

// Bug da 2ª carga do IPTU (22/11/2026): com o Docker sob carga, o download do bruto no Storage
// deu erro passageiro e a rotina tratou como "arquivo não encontrado", mandando o usuário baixar
// de novo um arquivo que estava lá. Só "não encontrado" é ausência; erro passageiro é repetido;
// outro erro falha com a mensagem real.
function bucket(respostas: ({ data: Blob } | { error: { message: string } })[]) {
  let i = 0;
  return {
    download: async () => {
      const r = respostas[Math.min(i++, respostas.length - 1)]!;
      return "data" in r ? { data: r.data, error: null } : { data: null, error: r.error };
    },
  };
}
const semEspera = { esperasMs: [0, 0, 0] };

describe("downloadIfExists (Storage)", () => {
  it("arquivo que existe → conteúdo", async () => {
    const b = await downloadIfExists(bucket([{ data: new Blob(["abc"]) }]), "iptu/2026.zip", semEspera);
    expect(b?.toString()).toBe("abc");
  });
  it("'Object not found' → nulo (ausência de verdade)", async () => {
    expect(await downloadIfExists(bucket([{ error: { message: "Object not found" } }]), "iptu/2026.zip", semEspera)).toBeNull();
  });
  it("erro passageiro é repetido e, se passar, devolve o conteúdo", async () => {
    const b = await downloadIfExists(bucket([{ error: { message: "fetch failed" } }, { data: new Blob(["ok"]) }]), "iptu/2026.zip", semEspera);
    expect(b?.toString()).toBe("ok");
  });
  it("erro que não é 'não encontrado' nem passageiro falha com a mensagem real", async () => {
    await expect(downloadIfExists(bucket([{ error: { message: "permission denied" } }]), "iptu/2026.zip", semEspera)).rejects.toThrow(/permission denied/);
  });
});

// Épico 8.8: armazém de brutos com dois motores (Supabase Storage e Cloudflare R2).
import { r2RawStore, rawStoreFromEnv, storeRaw, type ArmazemBrutos, type EnviaS3 } from "./brutos.js";

/** Armazém em memória para testar a retenção de 2 versões (seção 17). */
function memoria(): ArmazemBrutos & { arquivos: Map<string, Buffer> } {
  const arquivos = new Map<string, Buffer>();
  return {
    arquivos, nome: "memoria",
    ler: async (c) => arquivos.get(c) ?? null,
    gravar: async (c, b) => { arquivos.set(c, b); },
    mover: async (de, para) => { arquivos.set(para, arquivos.get(de)!); arquivos.delete(de); },
  };
}

describe("storeRaw: 2 versões por fonte/ano (seção 17)", () => {
  it("primeira carga grava; mesma versão não regrava; versão nova empurra a anterior", async () => {
    const a = memoria();
    expect(await storeRaw(a, "itbi", "2026", "xlsx", Buffer.from("v1"), "x")).toBe("itbi/2026.xlsx");
    await storeRaw(a, "itbi", "2026", "xlsx", Buffer.from("v1"), "x");
    expect([...a.arquivos.keys()]).toEqual(["itbi/2026.xlsx"]);
    await storeRaw(a, "itbi", "2026", "xlsx", Buffer.from("v2"), "x");
    expect(a.arquivos.get("itbi/2026.xlsx")!.toString()).toBe("v2");
    expect(a.arquivos.get("itbi/2026.anterior.xlsx")!.toString()).toBe("v1");
    await storeRaw(a, "itbi", "2026", "xlsx", Buffer.from("v3"), "x");
    expect(a.arquivos.get("itbi/2026.anterior.xlsx")!.toString()).toBe("v2"); // nunca mais que 2
  });
});

describe("escolha do armazém", () => {
  const db = { storage: { from: () => ({}) } } as never;
  it("sem BRUTOS_ARMAZEM → Storage do Supabase; com r2 → R2", () => {
    expect(rawStoreFromEnv(db, {}).nome).toBe("supabase:m2_brutos");
    expect(rawStoreFromEnv(db, { BRUTOS_ARMAZEM: "r2", R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "b", R2_SECRET_ACCESS_KEY: "c", R2_BUCKET: "m2-brutos" }).nome).toBe("r2:m2-brutos");
  });
  it("r2 sem as credenciais → erro claro", () => {
    expect(() => rawStoreFromEnv(db, { BRUTOS_ARMAZEM: "r2" })).toThrow(/R2_ACCOUNT_ID/);
  });
});

describe("armazém R2", () => {
  const env = { R2_BUCKET: "m2-brutos" };
  it("objeto ausente (NoSuchKey) → nulo; outro erro → lança", async () => {
    const ausente: EnviaS3 = { send: async () => { throw Object.assign(new Error("no key"), { name: "NoSuchKey" }); } } as never;
    expect(await r2RawStore(env, ausente).ler("iptu/2026.zip")).toBeNull();
    const negado: EnviaS3 = { send: async () => { throw Object.assign(new Error("Access Denied"), { name: "AccessDenied", $metadata: { httpStatusCode: 403 } }); } } as never;
    await expect(r2RawStore(env, negado).ler("iptu/2026.zip")).rejects.toThrow(/Access Denied/);
  });
  it("mover = copiar + apagar no mesmo bucket", async () => {
    const comandos: string[] = [];
    const s3: EnviaS3 = { send: async (c: { constructor: { name: string }; input: Record<string, string> }) => { comandos.push(`${c.constructor.name} ${c.input.Key}`); return {}; } } as never;
    await r2RawStore(env, s3).mover("itbi/2026.xlsx", "itbi/2026.anterior.xlsx");
    expect(comandos).toEqual(["CopyObjectCommand itbi/2026.anterior.xlsx", "DeleteObjectCommand itbi/2026.xlsx"]);
  });
});
