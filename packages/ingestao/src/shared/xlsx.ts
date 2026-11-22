/**
 * Leitor mínimo de .xlsx em streaming (épico 8.3; seção 4.2: planilhas de ~230 mil linhas não
 * podem ser carregadas inteiras em memória).
 *
 * Por que não o streaming do exceljs: ele exige xl/workbook.xml e sharedStrings.xml ANTES das
 * abas dentro do zip, e a planilha real do ITBI de 2024 os traz no fim (bug achado no 8.3).
 * Aqui o zip é lido pelo diretório central (yauzl), em qualquer ordem: primeiro os nomes das
 * abas e as strings compartilhadas, depois cada aba em stream (saxes).
 *
 * Valores devolvidos: string (texto/compartilhada/inline), number, boolean ou null. Datas vêm
 * como número serial do Excel — quem chama converte pela coluna (itbi/guias.ts toDate).
 */
import type { Readable } from "node:stream";
import { SaxesParser } from "saxes";
import yauzl from "yauzl";

export type CellValue = string | number | boolean | null;

interface ZipIndex {
  zip: yauzl.ZipFile;
  entries: Map<string, yauzl.Entry>;
}

/** Abre o zip a partir do Buffer e indexa as entradas pelo nome. */
function openZip(buffer: Buffer): Promise<ZipIndex> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, autoClose: false }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("Arquivo .xlsx ilegível."));
      const entries = new Map<string, yauzl.Entry>();
      zip.on("entry", (e: yauzl.Entry) => {
        entries.set(e.fileName, e);
        zip.readEntry();
      });
      zip.on("end", () => resolve({ zip, entries }));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

/** Stream de uma entrada do zip. */
function entryStream({ zip, entries }: ZipIndex, nome: string): Promise<Readable> {
  const e = entries.get(nome);
  if (!e) return Promise.reject(new Error(`.xlsx sem ${nome}.`));
  return new Promise((resolve, reject) => zip.openReadStream(e, (err, s) => (err || !s ? reject(err) : resolve(s))));
}

/**
 * Texto de uma entrada em pedaços, decodificado como UTF-8 pelo próprio stream (setEncoding),
 * para não partir caracteres de mais de um byte (á, ç) entre dois pedaços.
 */
async function* entryChunks(idx: ZipIndex, nome: string): AsyncGenerator<string> {
  const s = await entryStream(idx, nome);
  s.setEncoding("utf8");
  for await (const chunk of s) yield chunk as string;
}

/** Conteúdo de uma entrada pequena (workbook, rels) como texto. */
async function entryText(idx: ZipIndex, nome: string): Promise<string> {
  let t = "";
  for await (const chunk of entryChunks(idx, nome)) t += chunk;
  return t;
}

/** Atributo de uma tag XML. */
function attr(tag: string, nome: string): string | undefined {
  return tag.match(new RegExp(`\\b${nome}="([^"]*)"`))?.[1];
}

/**
 * Nomes das abas na ordem da pasta de trabalho e o caminho de cada uma no zip.
 * Recebe: o .xlsx. Devolve: lista {nome, caminho}.
 */
export async function listSheets(buffer: Buffer): Promise<{ nome: string; caminho: string }[]> {
  const idx = await openZip(buffer);
  try {
    return await sheetsOf(idx);
  } finally {
    idx.zip.close();
  }
}

async function sheetsOf(idx: ZipIndex): Promise<{ nome: string; caminho: string }[]> {
  const wb = await entryText(idx, "xl/workbook.xml");
  const rels = await entryText(idx, "xl/_rels/workbook.xml.rels");
  const alvo = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], "Id"), attr(m[0], "Target")]));
  return [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const target = alvo.get(attr(m[0], "r:id")) ?? "";
    const caminho = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    return { nome: decodeXml(attr(m[0], "name") ?? ""), caminho };
  });
}

/** Lê sharedStrings.xml inteiro (alguns MB) para um array. */
async function sharedStrings(idx: ZipIndex): Promise<string[]> {
  if (!idx.entries.has("xl/sharedStrings.xml")) return [];
  const lista: string[] = [];
  const p = new SaxesParser();
  let dentroSi = false;
  let dentroT = false;
  let dentroRPh = false; // guia fonética (<rPh>) não entra no texto
  let atual = "";
  p.on("opentag", (t) => {
    if (t.name === "si") { dentroSi = true; atual = ""; }
    else if (t.name === "rPh") dentroRPh = true;
    else if (t.name === "t" && dentroSi && !dentroRPh) dentroT = true;
  });
  p.on("text", (x) => { if (dentroT) atual += x; });
  p.on("closetag", (t) => {
    if (t.name === "t") dentroT = false;
    else if (t.name === "rPh") dentroRPh = false;
    else if (t.name === "si") { lista.push(atual); dentroSi = false; }
  });
  for await (const chunk of entryChunks(idx, "xl/sharedStrings.xml")) p.write(chunk);
  p.close();
  return lista;
}

/** Índice 0-based da coluna a partir da referência da célula ("AB12" → 27). */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

/**
 * Lê todas as abas, em stream, chamando onRow para cada linha.
 * Recebe: o .xlsx, um filtro de abas (nome → ler ou não) e o callback (nome da aba, número da
 * linha 1-based, valores 0-based na posição da coluna). Devolve: nada. Lança erro se o xlsx for inválido.
 */
export async function readRows(
  buffer: Buffer,
  aceitarAba: (nome: string) => boolean,
  onRow: (aba: string, linha: number, valores: CellValue[]) => void,
): Promise<void> {
  const idx = await openZip(buffer);
  try {
    const abas = await sheetsOf(idx);
    const strings = await sharedStrings(idx);
    for (const aba of abas) {
      if (!aceitarAba(aba.nome)) continue;
      await readSheet(idx, aba.caminho, strings, (linha, valores) => onRow(aba.nome, linha, valores));
    }
  } finally {
    idx.zip.close();
  }
}

/**
 * Primeira linha de cada aba aceita, sem ler o resto (o stream é interrompido após a 1ª linha).
 * Usado para achar cabeçalhos antes da leitura completa (abas sem cabeçalho, ITBI 2024).
 * Recebe: o .xlsx e o filtro de abas. Devolve: mapa aba → valores da 1ª linha.
 */
export async function readFirstRows(buffer: Buffer, aceitarAba: (nome: string) => boolean): Promise<Map<string, CellValue[]>> {
  const idx = await openZip(buffer);
  const primeiras = new Map<string, CellValue[]>();
  try {
    const abas = await sheetsOf(idx);
    const strings = await sharedStrings(idx);
    for (const aba of abas) {
      if (!aceitarAba(aba.nome)) continue;
      await readSheet(idx, aba.caminho, strings, (_l, v) => primeiras.set(aba.nome, v), 1);
    }
  } finally {
    idx.zip.close();
  }
  return primeiras;
}

/**
 * Faz o parse de uma aba em stream, montando cada <row> a partir das <c>.
 * Com maxLinhas, para de ler depois dessa quantidade de linhas.
 */
async function readSheet(
  idx: ZipIndex,
  caminho: string,
  strings: string[],
  onRow: (linha: number, v: CellValue[]) => void,
  maxLinhas = Infinity,
) {
  let emitidas = 0;
  const p = new SaxesParser();
  let linha = 0;
  let valores: CellValue[] = [];
  let col = 0;
  let tipo = "";
  let texto = "";
  let lendo = false;
  p.on("opentag", (t) => {
    if (t.name === "row") {
      linha = Number(t.attributes.r ?? linha + 1);
      valores = [];
      col = 0;
    } else if (t.name === "c") {
      const r = t.attributes.r as string | undefined;
      col = r ? columnIndex(r) : col;
      tipo = (t.attributes.t as string | undefined) ?? "";
      texto = "";
    } else if (t.name === "v" || (t.name === "t" && tipo === "inlineStr")) {
      lendo = true;
    }
  });
  p.on("text", (x) => { if (lendo) texto += x; });
  p.on("closetag", (t) => {
    if (t.name === "v" || t.name === "t") lendo = false;
    else if (t.name === "c") {
      let v: CellValue = null;
      if (texto !== "") {
        if (tipo === "s") v = strings[Number(texto)] ?? null;
        else if (tipo === "str" || tipo === "inlineStr" || tipo === "e") v = texto;
        else if (tipo === "b") v = texto === "1";
        else { const n = Number(texto); v = Number.isFinite(n) ? n : texto; }
      }
      valores[col] = v;
      col++;
    } else if (t.name === "row") {
      for (let i = 0; i < valores.length; i++) if (valores[i] === undefined) valores[i] = null;
      if (emitidas < maxLinhas) onRow(linha, valores);
      emitidas++;
    }
  });
  for await (const chunk of entryChunks(idx, caminho)) {
    p.write(chunk);
    if (emitidas >= maxLinhas) return; // sai do laço: o gerador fecha o stream da entrada
  }
  p.close();
}

/** Entidades XML básicas em atributos (nomes de aba). */
function decodeXml(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
