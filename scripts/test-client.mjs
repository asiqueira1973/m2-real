// Cliente de teste do servidor MCP (épico 8.9, critério 6): node scripts/test-client.mjs
// Variáveis: MCP_URL (ex.: http://localhost:3010/api/mcp ou https://<preview>.vercel.app/mcp) e MCP_CHAVE
// (chave criada na tela Chaves de API). Opcional: VERCEL_PROTECTION_BYPASS, para o preview protegido.
// Confere os critérios do 8.9 e sai com código 1 se algum falhar.
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const url = process.env.MCP_URL;
const chave = process.env.MCP_CHAVE;
if (!url || !chave) {
  console.error("Defina MCP_URL e MCP_CHAVE.");
  process.exit(2);
}
const extras = process.env.VERCEL_PROTECTION_BYPASS ? { "x-vercel-protection-bypass": process.env.VERCEL_PROTECTION_BYPASS } : {};
let falhas = 0;
const conferir = (ok, texto) => { console.log(`${ok ? "ok " : "!! "} ${texto}`); if (!ok) falhas++; };

// 1) Sem chave e com chave errada: 401 (seção 6.3).
for (const [rotulo, auth] of [["sem chave", null], ["chave errada", "Bearer chave-que-nao-existe"]]) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...extras, ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  conferir(r.status === 401, `${rotulo} → HTTP ${r.status} (esperado 401)`);
}

// 2) Cliente MCP de verdade com a chave.
const cliente = new Client({ name: "test-client", version: "1.0.0" });
await cliente.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { authorization: `Bearer ${chave}`, ...extras } } }));
const json = (r) => JSON.parse(r.content.find((c) => c.type === "text").text);

const { tools } = await cliente.listTools();
const nomes = tools.map((t) => t.name).sort();
// As 5 da 13.2 mais a `sobre` (acréscimo de 23/11/2026, spec 13.2).
conferir(JSON.stringify(nomes) === JSON.stringify(["buscar_predio", "comparaveis", "ficha_predio", "m2_bairro", "sobre", "vendas_predio"]), `6 ferramentas: ${nomes.join(", ")}`);
conferir(tools.every((t) => t.inputSchema?.type === "object"), "todas com inputSchema");

// 3) buscar_predio("rua caiubi 324") → Caiubi, 324 em 1º.
const busca = json(await cliente.callTool({ name: "buscar_predio", arguments: { endereco: "rua caiubi 324" } }));
conferir(/CAIUBI, 324/.test(busca.predios?.[0]?.endereco ?? ""), `buscar_predio("rua caiubi 324") → 1º: ${busca.predios?.[0]?.endereco}`);
conferir(busca.fonte === "ITBI Prefeitura de SP + IPTU GeoSampa + calibração Fechou por Quanto" && "atualizado_em" in busca && "dados_desatualizados" in busca, "fonte, atualizado_em e dados_desatualizados na resposta");

// 4) vendas_predio da Joaquim Antunes, 577 → as 3 vendas de 2025 com valor_total, m2_privativo e selo_area.
const ja = json(await cliente.callTool({ name: "buscar_predio", arguments: { endereco: "Rua Joaquim Antunes, 577" } })).predios[0];
const vendas = json(await cliente.callTool({ name: "vendas_predio", arguments: { predio_id: ja.predio_id } }));
const de2025 = vendas.vendas.filter((v) => v.data.startsWith("2025"));
conferir(de2025.length === 3, `vendas_predio(Joaquim Antunes, 577): ${de2025.length} vendas de 2025 (esperado 3)`);
conferir(de2025.every((v) => "valor_total" in v && "m2_privativo" in v && "selo_area" in v && "area_privativa" in v), "cada venda com valor_total, m2_privativo, selo_area e area_privativa");
console.log("    ", de2025.map((v) => `${v.data} ${v.unidade} R$ ${v.valor_total} → ${v.m2_privativo}/m² (${v.selo_area}, ${v.area_privativa} m²)`).join("\n      "));

// 4b) sobre: bairros, selos e cobertura (acréscimo de 23/11/2026).
const sobre = json(await cliente.callTool({ name: "sobre", arguments: {} }));
conferir(sobre.bairros?.length === 10 && sobre.selos?.length === 5 && Array.isArray(sobre.cobertura_atual), `sobre: ${sobre.bairros?.length} bairros, ${sobre.selos?.length} selos, cobertura de ${sobre.cobertura_atual?.length} bairros`);

// 5) Fora da cobertura e as outras ferramentas.
const fora = json(await cliente.callTool({ name: "buscar_predio", arguments: { endereco: "Avenida Paulista, 1" } }));
conferir(fora.predios.length > 0 || /não está na base/.test(fora.mensagem ?? ""), "fora da cobertura → mensagem da seção 15 (ou achou prédio)");
const ficha = json(await cliente.callTool({ name: "ficha_predio", arguments: { predio_id: ja.predio_id } }));
conferir(Array.isArray(ficha.plantas) && ficha.plantas.every((p) => "selo" in p && "area_privativa" in p), "ficha_predio com plantas, selo e área");
const bairro = json(await cliente.callTool({ name: "m2_bairro", arguments: { bairro: "pinheiros" } }));
conferir("mediana_m2_privativo" in bairro && "distribuicao_selos" in bairro && "n_vendas" in bairro, `m2_bairro(pinheiros): mediana ${bairro.mediana_m2_privativo}, n ${bairro.n_vendas}, selos ${JSON.stringify(bairro.distribuicao_selos)}`);
const comp = json(await cliente.callTool({ name: "comparaveis", arguments: { predio_id: ja.predio_id } }));
conferir(Array.isArray(comp.vendas) && comp.vendas.every((v) => "selo_area" in v && "area_privativa" in v), `comparaveis: ${comp.vendas.length} vendas (área de referência ${comp.area_referencia} m²)`);

await cliente.close();
console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
