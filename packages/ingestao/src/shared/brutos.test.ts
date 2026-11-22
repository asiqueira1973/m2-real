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
