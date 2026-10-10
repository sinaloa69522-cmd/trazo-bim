// PDF mínimo con una imagen JPEG a página completa por hoja. Sin dependencias: el JPEG va tal cual (DCTDecode).

export interface PdfPage {
  /** Bytes del JPEG */
  jpeg: Uint8Array;
  /** Tamaño de la imagen en píxeles */
  w: number;
  h: number;
}

/** wPt × hPt es el tamaño de página en puntos (1 pt = 1/72"); A3 apaisado: 1190.55 × 841.89. */
export function jpegPdf(pages: PdfPage[], wPt: number, hPt: number, title = ""): Uint8Array {
  const enc = new TextEncoder(), parts: Uint8Array[] = [], offsets: number[] = [];
  let len = 0;
  const push = (b: Uint8Array | string) => { const u = typeof b === "string" ? enc.encode(b) : b; parts.push(u); len += u.length; };
  const obj = (n: number, body: () => void) => { offsets[n] = len; push(`${n} 0 obj\n`); body(); push("\nendobj\n"); };
  const n = pages.length, W = wPt.toFixed(2), H = hPt.toFixed(2);
  // 1 catálogo, 2 páginas, 3 info; cada hoja: página, contenido, imagen
  const pageId = (i: number) => 4 + i * 3;
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  obj(2, () => push(`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(" ")}] >>`));
  obj(3, () => push(`<< /Producer (Smartarchitect) /Title (${title.replace(/[()\\]/g, "").replace(/[^\x20-\x7E]/g, "")}) >>`));
  pages.forEach((p, i) => {
    const id = pageId(i), content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(id, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`));
    obj(id + 1, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    obj(id + 2, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      push(p.jpeg); push("\nendstream");
    });
  });
  const total = 3 + n * 3, xref = len;
  push(`xref\n0 ${total + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i <= total; i++) push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
