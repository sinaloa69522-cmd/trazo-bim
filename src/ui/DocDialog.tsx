import { useEffect, useRef, useState } from "react";
import { docx, type Doc } from "../core/docx";
import { saveFile } from "./saveFile";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const isNum = (t: string) => /\d/.test(t) && /^[-\d.,\s%$×/]+(m²|m³|m|kg|pza|pzas|t|l|%)?$/.test(t.trim());

/** El documento como HTML (vista previa e impresión). */
export function docHtml(d: Doc): string {
  const out = [`<h1>${esc(d.title)}</h1>`, d.subtitle ? `<p class="sub">${esc(d.subtitle)}</p>` : ""];
  for (const b of d.blocks) {
    if ("h" in b) out.push(b.level === 2 ? `<h3>${esc(b.h)}</h3>` : `<h2>${esc(b.h)}</h2>`);
    else if ("p" in b) out.push(`<p${b.small ? ' class="small"' : ""}>${b.bold ? `<b>${esc(b.p)}</b>` : esc(b.p)}</p>`);
    else if ("list" in b) out.push(`<ul>${b.list.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`);
    else if ("table" in b) {
      const rows = b.table.map((r, j) => {
        const tag = b.head && j === 0 ? "th" : "td", cls = b.total && j === b.table.length - 1 ? ' class="tot"' : "";
        return `<tr${cls}>${r.map((c, i) => `<${tag}${tag === "td" && i > 0 && isNum(c) ? ' class="r"' : ""}>${esc(c)}</${tag}>`).join("")}</tr>`;
      });
      out.push(`<table>${rows.join("")}</table>`);
    } else if ("signs" in b) out.push(`<div class="signs">${b.signs.map((s) => `<div><span class="line"></span><b>${esc(s.name || " ")}</b><small>${esc(s.role)}</small></div>`).join("")}</div>`);
  }
  return out.join("\n");
}

export const DOC_CSS = `
.docpage{font-family:Arial,Helvetica,sans-serif;font-size:10pt;line-height:1.4;color:#111;background:#fff}
.docpage h1{font-size:16pt;text-transform:uppercase;text-align:center;margin:0 0 2pt}
.docpage .sub{text-align:center;color:#555;margin:0 0 16pt}
.docpage h2{font-size:11pt;text-transform:uppercase;border-bottom:1px solid #222;margin:16pt 0 6pt;padding-bottom:2pt;break-after:avoid}
.docpage h3{font-size:10pt;margin:10pt 0 3pt;break-after:avoid}
.docpage p{margin:0 0 6pt;text-align:justify}
.docpage ul{margin:0 0 6pt;padding-left:16pt}
.docpage table{width:100%;border-collapse:collapse;margin:2pt 0 8pt;font-size:9pt;break-inside:auto}
.docpage th{background:#e9ecef;text-align:left;border-top:1px solid #888;border-bottom:1px solid #888;padding:2pt 4pt}
.docpage td{border-bottom:1px solid #ccc;padding:2pt 4pt;vertical-align:top}
.docpage td.r{text-align:right;font-variant-numeric:tabular-nums}
.docpage tr.tot td{font-weight:700;border-top:1px solid #888}
.docpage .signs{display:flex;gap:16pt;margin-top:48pt;break-inside:avoid}
.docpage .signs div{flex:1;display:flex;flex-direction:column;align-items:center;text-align:center;gap:2pt}
.docpage .signs .line{width:90%;border-top:1px solid #111;margin-bottom:3pt}
.docpage .signs small{color:#444}
`;

/** Imprime el documento (o lo guarda como PDF desde el diálogo de impresión) en un marco aparte. */
export function printDoc(d: Doc) {
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(f);
  const w = f.contentWindow!;
  w.document.open();
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>@page{size:letter;margin:20mm 22mm}body{margin:0}${DOC_CSS}</style></head><body class="docpage">${docHtml(d)}</body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); setTimeout(() => f.remove(), 1000); }, 250);
}

/** Vista previa de un documento con descarga en Word e impresión. */
export function DocDialog({ make, file, hint, onClose }: { make: () => Doc; file: string; hint: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [doc] = useState(make);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} onClose={onClose} className="docdlg">
      <div className="dochead">
        <h3>{doc.title}</h3>
        <div className="docacts">
          <button className="btn primary" onClick={() => void saveFile(`${file}.docx`, new Blob([docx(doc)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }))}>Descargar Word</button>
          <button className="btn" onClick={() => printDoc(doc)}>Imprimir / PDF</button>
          <button className="btn" onClick={() => ref.current?.close()}>Cerrar</button>
        </div>
      </div>
      <style>{DOC_CSS}</style>
      <p className="hint">{hint}</p>
      <div className="docscroll"><article className="docpage" dangerouslySetInnerHTML={{ __html: docHtml(doc) }} /></div>
    </dialog>
  );
}
