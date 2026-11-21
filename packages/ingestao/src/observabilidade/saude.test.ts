import { describe, expect, it } from "vitest";
import { avaliarSaude, type ExecucaoResumo } from "./saude.js";

const AGORA = new Date("2026-11-21T12:00:00Z");
const diasAtras = (d: number) => new Date(AGORA.getTime() - d * 86_400_000).toISOString();
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000).toISOString();

function ok(rotina: string, dias: number, linhas = 100, extra: Partial<ExecucaoResumo> = {}): ExecucaoResumo {
  return { rotina, status: "concluida", iniciada_em: diasAtras(dias), concluida_em: diasAtras(dias), linhas_gravadas: linhas, mensagem_erro: null, ...extra };
}

// Todas as rotinas em dia: base dos cenários.
const SAUDAVEL: ExecucaoResumo[] = [
  ok("ingestao-itbi", 10), ok("ingestao-iptu", 200), ok("coleta-anuncios", 3), ok("coleta-leiloes", 2), ok("calibracao", 1),
];

const estado = (execs: ExecucaoResumo[], rotina: string) =>
  avaliarSaude(execs, [], AGORA).rotinas.find((r) => r.rotina === rotina)!;

describe("avaliarSaude (observabilidade O2)", () => {
  it("tudo em dia → ok, sem motivos", () => {
    const r = avaliarSaude(SAUDAVEL, [], AGORA);
    expect(r.ok).toBe(true);
    expect(r.motivos).toEqual([]);
  });

  it("ITBI sem carga há 36 dias (limite 35) → atrasada", () => {
    const s = estado([...SAUDAVEL.filter((e) => e.rotina !== "ingestao-itbi"), ok("ingestao-itbi", 36)], "ingestao-itbi");
    expect(s.estado).toBe("atrasada");
    expect(s.motivo).toContain("36 dias (limite 35)");
  });

  it("última execução falhou → falhou, com a mensagem", () => {
    const falha: ExecucaoResumo = { ...ok("coleta-anuncios", 0.5), status: "falhou", concluida_em: null, mensagem_erro: "429 Firecrawl" };
    const s = estado([...SAUDAVEL, falha], "coleta-anuncios");
    expect(s.estado).toBe("falhou");
    expect(s.motivo).toContain("429 Firecrawl");
  });

  it("falha antiga seguida de sucesso → ok", () => {
    const falha: ExecucaoResumo = { ...ok("coleta-anuncios", 5), status: "falhou", concluida_em: null, mensagem_erro: "x" };
    expect(estado([...SAUDAVEL, falha], "coleta-anuncios").estado).toBe("ok");
  });

  it("em andamento há mais de 6 h → travada (seção 12); há 2 h → não", () => {
    const presa: ExecucaoResumo = { rotina: "calibracao", status: "em_andamento", iniciada_em: horasAtras(7), concluida_em: null, linhas_gravadas: 0, mensagem_erro: null };
    expect(estado([...SAUDAVEL, presa], "calibracao").estado).toBe("travada");
    expect(estado([...SAUDAVEL, { ...presa, iniciada_em: horasAtras(2) }], "calibracao").estado).toBe("ok");
  });

  it("rotina sem nenhuma execução → nunca_executada", () => {
    expect(estado(SAUDAVEL.filter((e) => e.rotina !== "coleta-leiloes"), "coleta-leiloes").estado).toBe("nunca_executada");
  });

  it("volume abaixo de 50% da mediana das 3 anteriores → volume_anomalo", () => {
    const execs = [ok("ingestao-itbi", 1, 40), ok("ingestao-itbi", 30, 100), ok("ingestao-itbi", 60, 120), ok("ingestao-itbi", 90, 90)];
    const s = estado([...SAUDAVEL.filter((e) => e.rotina !== "ingestao-itbi"), ...execs], "ingestao-itbi");
    expect(s.estado).toBe("volume_anomalo");
    expect(s.motivo).toContain("mediana recente (100)");
  });

  it("execução 'sem mudança' não conta como volume anômalo", () => {
    const execs = [
      ok("ingestao-itbi", 1, 0, { sem_mudanca: true }), ok("ingestao-itbi", 30, 100), ok("ingestao-itbi", 60, 120),
      ok("ingestao-itbi", 90, 90), ok("ingestao-itbi", 120, 95),
    ];
    expect(estado([...SAUDAVEL.filter((e) => e.rotina !== "ingestao-itbi"), ...execs], "ingestao-itbi").estado).toBe("ok");
  });

  it("queda de cobertura > 5 pontos num bairro → alerta; 5 pontos exatos → não", () => {
    const r = avaliarSaude(SAUDAVEL, [
      { bairro_id: 3, calculado_em: diasAtras(8), pct_cobertura: 70 },
      { bairro_id: 3, calculado_em: diasAtras(1), pct_cobertura: 62.5 },
      { bairro_id: 1, calculado_em: diasAtras(8), pct_cobertura: 50 },
      { bairro_id: 1, calculado_em: diasAtras(1), pct_cobertura: 45 },
    ], AGORA);
    expect(r.ok).toBe(false);
    expect(r.cobertura).toEqual([expect.objectContaining({ bairro_id: 3, queda_pontos: 7.5 })]);
  });
});
