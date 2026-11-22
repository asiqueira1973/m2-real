import { describe, expect, it } from "vitest";
import { computeCoverage } from "./cobertura.js";
import { computeReferenceFactors, errorRangePct, groupFor, percentile } from "./fatores.js";
import { adEvidence, adSeal, calibrate, detectSpecial, type EvidenciaAnuncio, type EvidenciaEdital, type PlantaEstado, type PredioInfo } from "./selos.js";

const planta = (id: string, areaIptu: number, p: Partial<PlantaEstado> = {}): PlantaEstado => ({
  id, predioId: "p1", areaIptu, qtdUnidades: 10, areaPrivativa: null, vagasInclusas: null, quartos: null, fator: null,
  selo: "sem_dado", fonteArea: null, faixaErroPct: null, especial: false, revisaoPendente: false, motivoRevisao: null, ...p,
});
const predio = (id = "p1", p: Partial<PredioInfo> = {}): PredioInfo => ({ id, bairroId: 1, decada: 1970, vagasCadastroProprio: true, ...p });
const ad = (id: string, plantaId: string, area: number, p: Partial<EvidenciaAnuncio> = {}): EvidenciaAnuncio =>
  ({ id, plantaId, fonte: "pagina_condominio", area, vagas: 2, quartos: 3, ...p });
const edital = (id: string, plantaId: string, area: number): EvidenciaEdital => ({ id, plantaId, area, vagas: 2, vagasVinculadas: false });
const estado = (r: ReturnType<typeof calibrate>, id: string, original: PlantaEstado) => r.alteradas.find((p) => p.id === id) ?? original;

/** 8 prédios calibrados (fator 0,70 a 0,77) no bairro 1, década 1970, com vagas próprias: forma um grupo da 11.10. */
function grupoCalibrado(bairroId = 1, decada: number | null = 1970) {
  const plantas: PlantaEstado[] = [];
  const predios: PredioInfo[] = [];
  const anuncios: EvidenciaAnuncio[] = [];
  for (let i = 0; i < 8; i++) {
    const pid = `g${bairroId}-${decada}-${i}`;
    predios.push(predio(pid, { bairroId, decada }));
    plantas.push(planta(`pl-${pid}`, 100, { predioId: pid }));
    const area = 70 + i;
    anuncios.push(ad(`a1-${pid}`, `pl-${pid}`, area), ad(`a2-${pid}`, `pl-${pid}`, area));
  }
  return { plantas, predios, anuncios };
}

describe("regra 11.9: selo pelos anúncios", () => {
  it("T2: 94 e 95 → calibrada, área 94,5, fator 0,716", () => {
    const p = planta("pl", 132);
    const r = calibrate([p], [predio()], [ad("a", "pl", 94), ad("b", "pl", 95)], []);
    expect(estado(r, "pl", p)).toMatchObject({ selo: "calibrada", areaPrivativa: 94.5, fator: 0.716, fonteArea: "pagina_condominio" });
  });

  it("T2: com um terceiro anúncio de 107 (fora de 3%), continua calibrada pela mediana dos que concordam", () => {
    const s = adSeal([ad("a", "pl", 94), ad("b", "pl", 95), ad("c", "pl", 107)]);
    expect(s).toMatchObject({ selo: "calibrada", area: 94.5 });
  });

  it("Joaquim Antunes, 577 (evidências reais do banco: 95, 94, 95) → planta de 132 m² calibrada, área 94 ± 2, fator ≈ 0,71", () => {
    const p = planta("pl132", 132);
    const r = calibrate([p], [predio()], [ad("a", "pl132", 95), ad("b", "pl132", 94), ad("c", "pl132", 95)], []);
    const n = estado(r, "pl132", p);
    expect(n.selo).toBe("calibrada");
    expect(Math.abs(n.areaPrivativa! - 94)).toBeLessThanOrEqual(2);
    expect(n.fator!).toBeCloseTo(0.71, 1);
  });

  it("1 evidência → indicativa", () => {
    const p = planta("pl", 132);
    expect(estado(calibrate([p], [predio()], [ad("a", "pl", 94)], []), "pl", p)).toMatchObject({ selo: "indicativa", areaPrivativa: 94 });
  });

  it("2 que não concordam a 3% mas concordam a 8% → indicativa pela mediana", () => {
    expect(adSeal([ad("a", "pl", 94), ad("b", "pl", 100)])).toMatchObject({ selo: "indicativa", area: 97 });
  });

  it("2 que não concordam nem a 8% → revisão anuncios_divergentes, sem área dos anúncios", () => {
    const p = planta("pl", 132);
    const n = estado(calibrate([p], [predio()], [ad("a", "pl", 60), ad("b", "pl", 100)], []), "pl", p);
    expect(n).toMatchObject({ selo: "sem_dado", revisaoPendente: true, motivoRevisao: "anuncios_divergentes" });
  });

  it("página de condomínio com faixa num prédio de 2 plantas: mínimo → menor, máximo → maior", () => {
    const ev = adEvidence({ id: "a", plantaId: "pequena", fonte: "pagina_condominio", areaPrivativa: null, areaMin: 70, areaMax: 110, vagas: null, quartos: null },
      [{ id: "grande", areaIptu: 160 }, { id: "pequena", areaIptu: 100 }]);
    expect(ev.map((e) => [e.plantaId, e.area])).toEqual([["pequena", 70], ["grande", 110]]);
  });
});

describe("regras 11.9 e 11.10: estimada pelo fator de referência", () => {
  it("planta sem evidência → estimada com o grupo (bairro, década, vagas) e faixa de erro preenchida", () => {
    const g = grupoCalibrado();
    const alvo = planta("alvo", 200, { predioId: "px" });
    const r = calibrate([...g.plantas, alvo], [...g.predios, predio("px")], g.anuncios, []);
    const grupo = r.fatoresReferencia.find((f) => f.bairroId === 1 && f.decada === 1970)!;
    expect(grupo.qtdPlantas).toBe(8);
    const n = estado(r, "alvo", alvo);
    expect(n).toMatchObject({ selo: "estimada", fonteArea: "fator_referencia", fator: grupo.fatorMediano });
    expect(n.areaPrivativa).toBeCloseTo(200 * grupo.fatorMediano, 2);
    expect(n.faixaErroPct).toBe(errorRangePct(grupo));
    expect(n.faixaErroPct).toBeGreaterThan(0);
  });

  it("sem o grupo do bairro, usa o da década; sem ele, o geral", () => {
    const g = grupoCalibrado();
    const f = computeReferenceFactors(g.plantas.map((p, i) => ({ fator: (70 + i) / 100, bairroId: 1, decada: 1970, vagasCadastroProprio: true })));
    expect(groupFor(f, 2, 1970, true)).toMatchObject({ bairroId: null, decada: 1970 });
    expect(groupFor(f, 2, 1990, true)).toMatchObject({ bairroId: null, decada: null });
    expect(groupFor(f, 1, 1970, false)).toBeNull(); // vagas sem cadastro próprio: outro grupo
  });

  it("grupo com menos de 8 plantas não vale: sem grupo → sem_dado", () => {
    const alvo = planta("alvo", 200, { predioId: "px" });
    const poucas = [planta("c", 100, { predioId: "pc" })];
    const r = calibrate([...poucas, alvo], [predio("pc"), predio("px")], [ad("a", "c", 70), ad("b", "c", 70)], []);
    expect(r.fatoresReferencia).toEqual([]);
    expect(estado(r, "alvo", alvo)).toMatchObject({ selo: "sem_dado", areaPrivativa: null });
  });

  it("percentil linear e faixa = (p75 − p25) / mediana × 100 / 2", () => {
    expect(percentile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75);
    expect(errorRangePct({ bairroId: null, decada: null, vagasCadastroProprio: true, fatorMediano: 0.7, fatorP25: 0.65, fatorP75: 0.75, qtdPlantas: 8 })).toBe(7.1);
  });

  it("planta especial não entra nos grupos da 11.10", () => {
    const g = grupoCalibrado();
    g.plantas[0]!.especial = true;
    const r = calibrate(g.plantas, g.predios, g.anuncios, []);
    expect(r.fatoresReferencia).toEqual([]); // sobraram 7
  });
});

describe("regra 11.12: coerência e especiais", () => {
  it("fator a mais de 10% do fator_predio → fator_incoerente", () => {
    const a = planta("a", 100), b = planta("b", 100), c = planta("c", 100);
    const r = calibrate([a, b, c], [predio()], [ad("1", "a", 70), ad("2", "b", 71), ad("3", "c", 90)], []);
    expect(r.fatorPredio.get("p1")).toBe(0.71);
    expect(estado(r, "c", c)).toMatchObject({ revisaoPendente: true, motivoRevisao: "fator_incoerente" });
    expect(estado(r, "a", a).revisaoPendente).toBe(false);
  });

  it("planta de maior área com ≤ 2 unidades e ≥ 1,4 × a seguinte → especial com revisão", () => {
    expect(detectSpecial([{ id: "cob", areaIptu: 300, qtdUnidades: 1 }, { id: "tipo", areaIptu: 200, qtdUnidades: 20 }])).toBe("cob");
    expect(detectSpecial([{ id: "x", areaIptu: 270, qtdUnidades: 1 }, { id: "tipo", areaIptu: 200, qtdUnidades: 20 }])).toBeNull();
    expect(detectSpecial([{ id: "x", areaIptu: 300, qtdUnidades: 3 }, { id: "tipo", areaIptu: 200, qtdUnidades: 20 }])).toBeNull();
    const cob = planta("cob", 300, { qtdUnidades: 1 }), tipo = planta("tipo", 200);
    expect(estado(calibrate([cob, tipo], [predio()], [], []), "cob", cob)).toMatchObject({ especial: true, motivoRevisao: "planta_especial" });
  });

  it("o pipeline nunca desmarca especial; revisão resolvida pelo admin não volta", () => {
    const marcadaPeloAdmin = planta("x", 100, { especial: true });
    const r = calibrate([marcadaPeloAdmin, planta("y", 100)], [predio()], [], []);
    expect(estado(r, "x", marcadaPeloAdmin)).toMatchObject({ especial: true, revisaoPendente: false });
    const resolvida = planta("cob", 300, { qtdUnidades: 1, especial: true, revisaoPendente: false });
    expect(estado(calibrate([resolvida, planta("t", 200)], [predio()], [], []), "cob", resolvida).revisaoPendente).toBe(false);
  });
});

describe("regra 11.11: planta confirmada em revisão manual não muda", () => {
  it("passa intacta mesmo com evidências contrárias, e o fator dela entra no fator_predio", () => {
    const manual = planta("m", 132, { selo: "confirmada", fonteArea: "revisao_manual", areaPrivativa: 99, fator: 0.75 });
    const r = calibrate([manual], [predio()], [ad("a", "m", 80), ad("b", "m", 80)], [edital("e", "m", 120)]);
    expect(r.alteradas.find((p) => p.id === "m")).toBeUndefined();
    expect(r.historico.find((h) => h.plantaId === "m")).toBeUndefined();
    expect(r.fatorPredio.get("p1")).toBe(0.75);
  });
});

describe("editais (11.9; 8.6)", () => {
  it("edital casado à unidade → confirmada, fonte edital_leilao, área do edital", () => {
    const p = planta("pl", 260);
    const n = estado(calibrate([p], [predio()], [], [edital("e", "pl", 184.32)]), "pl", p);
    expect(n).toMatchObject({ selo: "confirmada", fonteArea: "edital_leilao", areaPrivativa: 184.32, revisaoPendente: false });
  });

  it("edital a mais de 5% da área dos anúncios → edital_divergente, e vale a área do edital", () => {
    const p = planta("pl", 132);
    const r = calibrate([p], [predio()], [ad("a", "pl", 94), ad("b", "pl", 95)], [edital("e", "pl", 105)]);
    expect(estado(r, "pl", p)).toMatchObject({ selo: "confirmada", areaPrivativa: 105, motivoRevisao: "edital_divergente" });
    expect(r.historico[0]).toMatchObject({ editaisIds: ["e"], anunciosIds: ["a", "b"], fonte: "edital_leilao" });
  });

  it("edital a até 5% dos anúncios → confirmada sem revisão", () => {
    const p = planta("pl", 132);
    expect(estado(calibrate([p], [predio()], [ad("a", "pl", 94), ad("b", "pl", 95)], [edital("e", "pl", 96)]), "pl", p).revisaoPendente).toBe(false);
  });

  it("2 editais que concordam a 3% → mediana; que não concordam → não confirma e vai para a revisão", () => {
    const p = planta("pl", 132);
    expect(estado(calibrate([p], [predio()], [], [edital("e1", "pl", 94), edital("e2", "pl", 95)]), "pl", p)).toMatchObject({ selo: "confirmada", areaPrivativa: 94.5 });
    const n = estado(calibrate([p], [predio()], [ad("a", "pl", 94)], [edital("e1", "pl", 94), edital("e2", "pl", 110)]), "pl", p);
    expect(n).toMatchObject({ selo: "indicativa", areaPrivativa: 94, motivoRevisao: "edital_divergente" });
  });

  it("vagas vinculadas à área do edital viram vagas_inclusas em prédio sem vaga com cadastro próprio", () => {
    const p = planta("pl", 260);
    const r = calibrate([p], [predio("p1", { vagasCadastroProprio: false })], [], [{ id: "e", plantaId: "pl", area: 184.32, vagas: 2, vagasVinculadas: true }]);
    expect(estado(r, "pl", p).vagasInclusas).toBe(2);
  });
});

describe("histórico (7.2 calibracoes): toda mudança de área gera linha", () => {
  it("mudou → uma linha; igual ao que já está → nenhuma", () => {
    const p = planta("pl", 132);
    const r1 = calibrate([p], [predio()], [ad("a", "pl", 94), ad("b", "pl", 95)], []);
    expect(r1.historico).toHaveLength(1);
    const gravada = r1.alteradas[0]!;
    const r2 = calibrate([gravada], [predio()], [ad("a", "pl", 94), ad("b", "pl", 95)], []);
    expect(r2.historico).toHaveLength(0);
    expect(r2.alteradas).toHaveLength(0);
  });
});

describe("cobertura (D12; P4)", () => {
  it("uma linha por bairro; pct = (confirmada + calibrada) / vendas 24m; indicativa não entra; vendas antigas fora", () => {
    const agora = new Date("2026-11-22T00:00:00Z");
    const v = (bairroId: number, seloArea: "confirmada" | "calibrada" | "indicativa" | "estimada" | "sem_dado", dataTransacao = "2026-01-01") => ({ bairroId, seloArea, dataTransacao });
    const r = computeCoverage([1, 2, 3], [v(1, "confirmada"), v(1, "calibrada"), v(1, "indicativa"), v(1, "estimada"), v(1, "sem_dado", "2023-01-01"), v(2, "sem_dado")], agora);
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({ bairroId: 1, vendas24m: 4, vendasConfirmada: 1, vendasCalibrada: 1, vendasIndicativa: 1, vendasEstimada: 1, vendasSemDado: 0, pctCobertura: 50 });
    expect(r[1]).toMatchObject({ vendas24m: 1, pctCobertura: 0 });
    expect(r[2]).toMatchObject({ vendas24m: 0, pctCobertura: 0 });
  });
});

import { rematchAds } from "./plantas.js";

describe("recasamento dos anúncios (11.8; 8.6)", () => {
  /** Banco falso: devolve `anuncios` na leitura paginada e registra os updates. */
  function banco(anuncios: unknown[]) {
    const updates: unknown[] = [];
    const db = {
      from: () => {
        const q: Record<string, unknown> = {};
        const encadear = () => q;
        Object.assign(q, { select: encadear, in: encadear, eq: encadear, not: encadear, order: encadear,
          range: async () => ({ data: anuncios, error: null }),
          update: (l: unknown) => { updates.push(l); return { eq: () => ({ eq: async () => ({ data: null, error: null }) }) }; } });
        return q;
      },
    } as unknown as Parameters<typeof rematchAds>[0];
    return { db, updates };
  }
  const anuncio = { id: "a", predio_id: "p1", fonte: "anuncio", area_privativa: 70, area_privativa_min: null, area_privativa_max: null, confianca_casamento: 0.9, status_casamento: "casado_predio", planta_id: null };
  const duas = [planta("pequena", 100), planta("grande", 160)];

  it("casado_predio vira casado_planta quando o prédio ganha fator", async () => {
    const { db, updates } = banco([anuncio]);
    expect(await rematchAds(db, duas, [{ ...predio(), fatorPredio: 0.7 }], [])).toBe(1);
    expect(updates).toEqual([{ status_casamento: "casado_planta", planta_id: "pequena" }]);
  });

  it("sem fator do prédio, usa o fator de referência do grupo", async () => {
    const { db, updates } = banco([anuncio]);
    const grupo = { bairroId: 1, decada: 1970, vagasCadastroProprio: true, fatorMediano: 0.7, fatorP25: 0.68, fatorP75: 0.72, qtdPlantas: 8 };
    await rematchAds(db, duas, [{ ...predio(), fatorPredio: null }], [grupo]);
    expect(updates).toEqual([{ status_casamento: "casado_planta", planta_id: "pequena" }]);
  });

  it("sem fator nenhum, nada muda", async () => {
    const { db, updates } = banco([anuncio]);
    expect(await rematchAds(db, duas, [{ ...predio(), fatorPredio: null }], [])).toBe(0);
    expect(updates).toEqual([]);
  });
});
