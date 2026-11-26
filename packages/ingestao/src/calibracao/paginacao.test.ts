// Bug (8.14, produção): com ~90 mil guias de compra e venda, a leitura por OFFSET (range) passa dos
// 8 s do PostgREST nas páginas finais e a calibração falha. A leitura tem de ser por chave (id > último),
// que custa o mesmo em toda página.
import { describe, expect, it } from "vitest";
import { loadPurchaseSlips } from "./dados";

/** Banco falso: 2.500 guias; registra se a consulta usou range (offset) ou gt (chave). */
function banco() {
  const ids = Array.from({ length: 2500 }, (_, i) => `id-${String(i).padStart(5, "0")}`);
  const chamadas: { gt: string | null; range: boolean }[] = [];
  const db = {
    from: () => {
      const c = { gt: null as string | null, range: false, limite: 1000 };
      const q: Record<string, unknown> = {};
      for (const f of ["select", "eq", "not", "order"]) q[f] = () => q;
      q.gt = (_col: string, v: string) => { c.gt = v; return q; };
      q.limit = (n: number) => { c.limite = n; return q; };
      q.range = (de: number, ate: number) => { c.range = true; chamadas.push({ gt: c.gt, range: true }); return Promise.resolve({ data: linhas(ids.slice(de, ate + 1)), error: null }); };
      q.then = (ok: (v: unknown) => void) => {
        chamadas.push({ gt: c.gt, range: false });
        const desde = c.gt ? ids.indexOf(c.gt) + 1 : 0;
        ok({ data: linhas(ids.slice(desde, desde + c.limite)), error: null });
      };
      return q;
    },
  };
  return { db: db as never, chamadas };
}
const linhas = (ids: string[]) => ids.map((id) => ({
  id, predio_id: "p", unidade_id: "u", data_transacao: "2025-01-01", valor_declarado: 1, valor_venal_referencia: null, matricula: null,
  unidade_sem_cadastro_proprio: false, unidade: { tipo_unidade: "apartamento", area_construida: 80, planta_id: null, planta: null }, predio: { bairro_id: 1 },
}));

describe("loadPurchaseSlips: paginação por chave", () => {
  it("lê tudo sem OFFSET: cada página começa depois do último id lido", async () => {
    const { db, chamadas } = banco();
    const guias = await loadPurchaseSlips(db);
    expect(guias).toHaveLength(2500);
    expect(chamadas.some((c) => c.range)).toBe(false);
    expect(chamadas.map((c) => c.gt)).toEqual([null, "id-00999", "id-01999"]);
  });
});
