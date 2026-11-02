// Documento sencillo (títulos, párrafos, listas, tablas y firmas) y su versión .docx para Word.

import { xmlEsc, zip } from "./zip";

export type Block =
  | { h: string; level?: 1 | 2 }
  | { p: string; bold?: boolean; small?: boolean }
  | { list: string[] }
  | { table: string[][]; head?: boolean; total?: boolean; widths?: number[] }
  | { signs: { role: string; name: string }[] };

export interface Doc { title: string; subtitle?: string; blocks: Block[] }

const run = (t: string, o: { b?: boolean; sz?: number } = {}) =>
  `<w:r><w:rPr>${o.b ? "<w:b/>" : ""}${o.sz ? `<w:sz w:val="${o.sz}"/>` : ""}</w:rPr><w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`;
const para = (inner: string, style?: string, extra = "") => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${extra}</w:pPr>${inner}</w:p>`;

function table(rows: string[][], head: boolean, total: boolean, widths?: number[]) {
  const cols = Math.max(...rows.map((r) => r.length)), W = 9360, ws = widths ?? Array(cols).fill(1), sum = ws.reduce((a, b) => a + b, 0);
  const tw = ws.map((w) => Math.round((w / sum) * W));
  const cell = (t: string, i: number, b: boolean, shade: boolean, right: boolean) =>
    `<w:tc><w:tcPr><w:tcW w:w="${tw[i]}" w:type="dxa"/>${shade ? '<w:shd w:val="clear" w:color="auto" w:fill="E9ECEF"/>' : ""}</w:tcPr>${para(run(t, { b, sz: 18 }), undefined, `<w:spacing w:before="20" w:after="20"/>${right ? '<w:jc w:val="right"/>' : '<w:jc w:val="left"/>'}`)}</w:tc>`;
  const num = (t: string) => /^[-\d.,\s%$]+(m²|m³|m|kg|pza|pzas|t|l|%)?$/.test(t.trim()) && /\d/.test(t);
  const trs = rows.map((r, j) => {
    const isHead = head && j === 0, isTot = total && j === rows.length - 1;
    return `<w:tr>${isHead ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${Array.from({ length: cols }, (_, i) => cell(r[i] ?? "", i, isHead || isTot, isHead, !isHead && i > 0 && num(r[i] ?? ""))).join("")}</w:tr>`;
  }).join("");
  return `<w:tbl><w:tblPr><w:tblStyle w:val="Tabla"/><w:tblW w:w="${W}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${tw.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${trs}</w:tbl>${para("", undefined, '<w:spacing w:after="60"/>')}`;
}

function body(d: Doc) {
  const out: string[] = [para(run(d.title), "Title")];
  if (d.subtitle) out.push(para(run(d.subtitle), "Subtitle"));
  for (const b of d.blocks) {
    if ("h" in b) out.push(para(run(b.h), b.level === 2 ? "Heading2" : "Heading1"));
    else if ("p" in b) out.push(para(run(b.p, { b: b.bold, sz: b.small ? 16 : undefined })));
    else if ("list" in b) for (const li of b.list) out.push(para(run(`•\t${li}`), "Lista"));
    else if ("table" in b) out.push(table(b.table, !!b.head, !!b.total, b.widths));
    else if ("signs" in b) {
      const n = b.signs.length, w = Math.round(9360 / n);
      const cells = b.signs.map((s) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${para("", undefined, '<w:spacing w:before="900"/>')}${para(run("_______________________________"), undefined, '<w:jc w:val="center"/>')}${para(run(s.name || " ", { b: true }), undefined, '<w:jc w:val="center"/>')}${para(run(s.role, { sz: 18 }), undefined, '<w:jc w:val="center"/>')}</w:tc>`).join("");
      out.push(`<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${b.signs.map(() => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid><w:tr>${cells}</w:tr></w:tbl>`);
    }
  }
  return out.join("");
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:lang w:val="es-MX"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="264" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="60"/></w:pPr><w:rPr><w:b/><w:caps/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="360"/></w:pPr><w:rPr><w:sz w:val="22"/><w:color w:val="555555"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="222222"/></w:pBdr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:caps/><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="60"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Lista"><w:name w:val="Lista"/><w:pPr><w:ind w:left="360" w:hanging="240"/><w:spacing w:after="40"/></w:pPr></w:style>
<w:style w:type="table" w:styleId="Tabla"><w:name w:val="Tabla"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="888888"/><w:bottom w:val="single" w:sz="4" w:color="888888"/><w:insideH w:val="single" w:sz="2" w:color="BBBBBB"/></w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

/** El documento como archivo .docx (bytes). */
export function docx(d: Doc): Uint8Array {
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body(d)}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1300" w:right="1440" w:bottom="1300" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return zip([
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: "word/_rels/document.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "word/document.xml", data: document },
    { name: "word/styles.xml", data: STYLES },
  ]);
}
