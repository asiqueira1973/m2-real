/**
 * Gera em memória um PDF mínimo (Helvetica, WinAnsi) a partir de texto. Uso: testes do 8.5.1,
 * que transformam o texto público de um laudo (página do lote) num PDF para passar pelo mesmo
 * caminho da coleta real (PDF → Claude API → allowlist), sem gravar nada em disco.
 * Recebe: texto (acentos do português cabem em WinAnsi). Devolve: o PDF em Buffer.
 */
export function textToPdf(texto: string): Buffer {
  const largura = 95; // caracteres por linha
  const linhasPorPagina = 60;
  const linhas: string[] = [];
  for (const paragrafo of texto.split(/\n/)) {
    let atual = "";
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      if ((atual + " " + palavra).trim().length > largura) {
        linhas.push(atual);
        atual = palavra;
      } else atual = (atual + " " + palavra).trim();
    }
    linhas.push(atual);
  }
  const paginas: string[][] = [];
  for (let i = 0; i < linhas.length; i += linhasPorPagina) paginas.push(linhas.slice(i, i + linhasPorPagina));

  const objetos: string[] = [];
  const add = (corpo: string) => objetos.push(corpo) - 1 + 1; // número do objeto (1-based)
  const catalogo = add("<< /Type /Catalog /Pages 2 0 R >>");
  add(""); // páginas: preenchido depois
  const fonte = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  for (const pagina of paginas) {
    const escapar = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    const conteudo = `BT /F1 10 Tf 13 TL 40 800 Td ${pagina.map((l) => `(${escapar(l)}) Tj T*`).join(" ")} ET`;
    const stream = add(`<< /Length ${Buffer.byteLength(conteudo, "latin1")} >>\nstream\n${conteudo}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fonte} 0 R >> >> /Contents ${stream} 0 R >>`));
  }
  objetos[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objetos.forEach((corpo, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${corpo}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
