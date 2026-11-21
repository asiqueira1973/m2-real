import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { CAMPOS_IPTU_ROW, readIptuRows } from "./leitor.js";

// Cabeçalho real do IPTU_2026.csv + uma coluna de nome de contribuinte injetada,
// que precisa ser ignorada (seção 20: "a coluna é ignorada no parser, com teste").
const CABECALHO =
  "NUMERO DO CONTRIBUINTE;ANO DO EXERCICIO;NUMERO DA NL;DATA DO CADASTRAMENTO;NUMERO DO CONDOMINIO;CODLOG DO IMOVEL;NOME DE LOGRADOURO DO IMOVEL;NUMERO DO IMOVEL;COMPLEMENTO DO IMOVEL;BAIRRO DO IMOVEL;REFERENCIA DO IMOVEL;CEP DO IMOVEL;QUANTIDADE DE ESQUINAS/FRENTES;FRACAO IDEAL;AREA DO TERRENO;AREA CONSTRUIDA;AREA OCUPADA;VALOR DO M2 DO TERRENO;VALOR DO M2 DE CONSTRUCAO;ANO DA CONSTRUCAO CORRIGIDO;QUANTIDADE DE PAVIMENTOS;TESTADA PARA CALCULO;TIPO DE USO DO IMOVEL;TIPO DE PADRAO DA CONSTRUCAO;TIPO DE TERRENO;FATOR DE OBSOLESCENCIA;ANO DE INICIO DA VIDA DO CONTRIBUINTE;MES DE INICIO DA VIDA DO CONTRIBUINTE;FASE DO CONTRIBUINTE;NOME DO CONTRIBUINTE";
const LINHAS = [
  // Joaquim Antunes, 577 (linha real do IPTU 2026) + nome injetado
  "0150140156-4;2026;1;01/01/26;01-9;10000-1;R JOAQUIM ANTUNES;577;APTO 72;PINHEIROS;;05415-011;0;0.0158;1000;132;132;3000.00;2500.00;1979;18;20.00;Apartamento em condomínio;Residencial vertical - padrão C;Normal;0.60;1980;1;0;FULANO DE TAL",
  // Fora dos 10 bairros (Santa Efigênia, CEP 011)
  "0010030001-4;2026;1;01/01/26;00-0;03812-1;R S CAETANO;13;;SANTA EFIGENIA;;01104-001;1;1.0000;136;135;108;4394.00;2856.00;1924;1;13.00;Loja;Comercial horizontal - padrão B;De esquina;0.20;1963;1;0;BELTRANO",
  // Dentro dos bairros, mas área construída ilegível → inválida
  "0150140157-2;2026;1;01/01/26;01-9;10000-1;R JOAQUIM ANTUNES;577;APTO 73;PINHEIROS;;05415-011;0;0.0123;1000;;132;3000.00;2500.00;1979;18;20.00;Apartamento em condomínio;Residencial vertical - padrão C;Normal;0.60;1980;1;0;CICLANO",
];

const csv = (linhas: string[], cabecalho = CABECALHO) => Readable.from([`﻿${cabecalho}\r\n${linhas.join("\r\n")}\r\n`]);
const PREFIXOS = ["050", "0125", "054", "012", "013", "014", "0540", "045"];

describe("leitor do IPTU (épico 8.2)", () => {
  it("lê só as linhas dos 10 bairros e converte os campos", async () => {
    const r = await readIptuRows(csv(LINHAS), PREFIXOS);
    expect(r).toMatchObject({ linhasLidas: 3, foraDosBairros: 1, invalidas: 1 });
    expect(r.rows).toEqual([
      {
        sql: "01501401564", exercicio: 2026, numeroCondominio: "01-9", logradouro: "R JOAQUIM ANTUNES", numero: 577,
        complemento: "APTO 72", bairro: "PINHEIROS", cep: "05415011", fracaoIdeal: 0.0158, areaConstruida: 132,
        anoConstrucao: 1979, pavimentos: 18, uso: "Apartamento em condomínio", padrao: "Residencial vertical - padrão C",
      },
    ]);
  });

  it("seção 20: a coluna de nome do contribuinte nunca chega à linha (allowlist)", async () => {
    const r = await readIptuRows(csv(LINHAS), PREFIXOS);
    for (const row of r.rows) {
      expect(Object.keys(row).sort()).toEqual([...CAMPOS_IPTU_ROW].sort());
      expect(JSON.stringify(row)).not.toContain("FULANO");
    }
  });

  it("PV3: falta de coluna obrigatória falha com mensagem clara", async () => {
    const semArea = CABECALHO.replace("AREA CONSTRUIDA;", "");
    await expect(readIptuRows(csv([], semArea), PREFIXOS)).rejects.toThrow(/sem colunas obrigatórias: AREA CONSTRUIDA/);
  });
});
